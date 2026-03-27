from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.core.config import settings
from app.models.domain import SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry
from app.services.sla.contracts import (
    BusinessContractDocument,
    DocumentIntake,
    ExtractionOutput,
    SlaCandidateContract,
)
from app.services.sla.parsers import extract_text_from_bytes
from app.services.sla.providers import get_extraction_provider
from app.utils.logging import get_logger
from app.utils.audit import log_event


logger = get_logger("app.sla.extraction")

SUPPORTED_DOCUMENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "text": "text/plain",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "scan": "image/scan",
}

_DELIVERY_SCOPE_TOKENS = (
    "last-mile",
    "last mile",
    "pickup",
    "rider",
    "dispatch",
    "delivery",
    "proof-of-delivery",
    "completed drop",
    "transport",
    "dark stores",
)

_FINANCE_SCOPE_TOKENS = (
    "invoice",
    "billing",
    "payment",
    "reconciliation",
    "rate",
    "commercial dispute",
    "purchase order",
    "po",
)

_SUPPORT_SCOPE_TOKENS = (
    "support",
    "incident",
    "outage",
    "ticket",
    "service desk",
)

_WAREHOUSE_SCOPE_TOKENS = (
    "warehouse",
    "inventory",
    "putaway",
    "fulfilment center",
    "fulfillment center",
)


def _contains_any(text: str, tokens: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(token in lowered for token in tokens)


def _infer_candidate_applies_to(candidate: SlaCandidateContract) -> tuple[dict, list[str]]:
    applies_to = dict(candidate.applies_to or {})
    notes: list[str] = []
    document = candidate.business_document
    source_text = " | ".join(
        [
            candidate.name,
            candidate.conditions,
            document.executive_summary,
            *document.service_scope,
            *document.service_level_commitments,
            *document.operational_obligations,
            *document.commercial_terms,
            *document.risk_watchouts,
        ]
    ).lower()

    if "critical" in source_text and "priority" not in applies_to:
        applies_to["priority"] = "P1"
        notes.append("Inferred priority=P1 from critical incident language.")

    if _contains_any(source_text, _DELIVERY_SCOPE_TOKENS):
        applies_to.setdefault("workflow_category", "delivery")
        applies_to.setdefault("issue_type", "ops_task")
        applies_to.setdefault("business_unit", "delivery")
        applies_to.setdefault("workflow", "delivery_issue")
        notes.append("Inferred delivery routing dimensions from service-scope language.")
    elif _contains_any(source_text, _FINANCE_SCOPE_TOKENS):
        applies_to.setdefault("workflow_category", "finance")
        applies_to.setdefault("issue_type", "discrepancy_case")
        applies_to.setdefault("business_unit", "procurement")
        applies_to.setdefault("workflow", "vendor_dispute")
        notes.append("Inferred finance or procurement routing dimensions from commercial language.")
    elif _contains_any(source_text, _WAREHOUSE_SCOPE_TOKENS):
        applies_to.setdefault("workflow_category", "warehouse")
        applies_to.setdefault("issue_type", "ops_task")
        applies_to.setdefault("business_unit", "warehouse")
        applies_to.setdefault("workflow", "warehouse_request")
        notes.append("Inferred warehouse routing dimensions from operational scope language.")
    elif _contains_any(source_text, _SUPPORT_SCOPE_TOKENS):
        applies_to.setdefault("workflow_category", "support")
        applies_to.setdefault("issue_type", "support_ticket")
        applies_to.setdefault("business_unit", "support")
        applies_to.setdefault("workflow", "support_ticket")
        notes.append("Inferred support routing dimensions from incident language.")

    return applies_to, notes


def detect_document_intake(
    *,
    source_document_name: str,
    document_type: str | None,
    sample_text: str | None,
) -> DocumentIntake:
    extension = Path(source_document_name).suffix.lower().lstrip(".") or None
    resolved_type = (document_type or extension or "pdf").lower()
    if resolved_type not in SUPPORTED_DOCUMENT_TYPES:
        resolved_type = "txt"
    extraction_source = "ocr_normalized" if resolved_type in {"png", "jpg", "jpeg", "scan"} else "text_parsed"
    return DocumentIntake(
        source_document_name=source_document_name,
        document_type=resolved_type,
        content_type=SUPPORTED_DOCUMENT_TYPES[resolved_type],
        file_extension=extension,
        extraction_source=extraction_source,
        raw_text=(sample_text or "").strip() or None,
    )


def normalize_candidate(candidate: SlaCandidateContract, *, intake: DocumentIntake) -> SlaCandidateContract:
    response_hours = max(int(candidate.response_deadline_hours), 1)
    resolution_hours = max(int(candidate.resolution_deadline_hours), response_hours)
    parsing_notes = list(candidate.parsing_notes)
    business_document = candidate.business_document
    executive_summary = business_document.executive_summary.strip()
    if not executive_summary:
        executive_summary = (
            f"{candidate.name.strip()} governs {candidate.conditions.strip().rstrip('.')}."
            if candidate.conditions.strip()
            else f"{candidate.name.strip()} governs the documented service commitment."
        )
    if response_hours != candidate.response_deadline_hours:
        parsing_notes.append("Normalized response deadline to minimum supported value.")
    if resolution_hours != candidate.resolution_deadline_hours:
        parsing_notes.append("Normalized resolution deadline to remain >= response deadline.")
    inferred_applies_to, inference_notes = _infer_candidate_applies_to(candidate)
    parsing_notes.extend(inference_notes)
    return candidate.model_copy(
        update={
            "name": candidate.name.strip(),
            "applies_to": inferred_applies_to,
            "response_deadline_hours": response_hours,
            "resolution_deadline_hours": resolution_hours,
            "penalty_amount": round(float(candidate.penalty_amount), 2),
            "confidence_score": round(float(candidate.confidence_score), 3),
            "parsing_notes": parsing_notes,
            "extraction_source": intake.extraction_source,
            "business_document": business_document.model_copy(
                update={
                    "executive_summary": executive_summary,
                    "service_scope": [item.strip() for item in business_document.service_scope if str(item).strip()],
                    "service_level_commitments": [
                        item.strip() for item in business_document.service_level_commitments if str(item).strip()
                    ],
                    "operational_obligations": [
                        item.strip() for item in business_document.operational_obligations if str(item).strip()
                    ],
                    "exclusions_and_assumptions": [
                        item.strip() for item in business_document.exclusions_and_assumptions if str(item).strip()
                    ],
                    "commercial_terms": [item.strip() for item in business_document.commercial_terms if str(item).strip()],
                    "escalation_path": [item.strip() for item in business_document.escalation_path if str(item).strip()],
                    "approval_and_governance": [
                        item.strip() for item in business_document.approval_and_governance if str(item).strip()
                    ],
                    "risk_watchouts": [item.strip() for item in business_document.risk_watchouts if str(item).strip()],
                }
            ),
        }
    )


def _resolve_business_document(candidate: SlaExtractionCandidate) -> dict:
    metadata = candidate.candidate_metadata or {}
    raw_document = metadata.get("business_document") if isinstance(metadata, dict) else None
    if isinstance(raw_document, dict):
        return BusinessContractDocument.model_validate(raw_document).model_dump()
    return BusinessContractDocument(
        executive_summary=(
            f"{candidate.name} governs {candidate.conditions.rstrip('.')}."
            if candidate.conditions
            else f"{candidate.name} governs the documented service commitment."
        ),
        service_scope=[str(candidate.applies_to)] if candidate.applies_to else [],
        service_level_commitments=[
            f"First response within {candidate.response_deadline_hours} hour(s).",
            f"Resolution within {candidate.resolution_deadline_hours} hour(s).",
        ],
        operational_obligations=[f"Escalation owner: {candidate.escalation_owner}."],
        exclusions_and_assumptions=[],
        commercial_terms=[f"Penalty per breach: INR {round(candidate.penalty_amount, 2):,.2f}."],
        escalation_path=list((candidate.escalation_policy or {}).get("levels") or []),
        approval_and_governance=[],
        risk_watchouts=[],
    ).model_dump()


def orchestrate_extraction(
    *,
    source_document_name: str,
    document_type: str,
    sample_text: str | None,
) -> ExtractionOutput:
    logger.info(
        "sla_extraction_orchestrate_start source=%s doc_type=%s sample_text_chars=%s",
        source_document_name,
        document_type,
        len(sample_text or ""),
    )
    intake = detect_document_intake(
        source_document_name=source_document_name,
        document_type=document_type,
        sample_text=sample_text,
    )
    provider = get_extraction_provider()
    raw_output = provider.extract(intake)
    normalized_candidates = [normalize_candidate(candidate, intake=intake) for candidate in raw_output.candidates]
    logger.info(
        "sla_extraction_orchestrate_done source=%s extraction_source=%s candidates=%s",
        source_document_name,
        intake.extraction_source,
        len(normalized_candidates),
    )
    return raw_output.model_copy(update={"candidates": normalized_candidates})


def orchestrate_extraction_from_file(
    *,
    source_document_name: str,
    document_type: str,
    file_bytes: bytes,
) -> ExtractionOutput:
    logger.info(
        "sla_extraction_file_parse_start source=%s doc_type=%s bytes=%s",
        source_document_name,
        document_type,
        len(file_bytes),
    )
    extracted_text = extract_text_from_bytes(document_type, file_bytes)
    if not extracted_text.strip():
        raise ValueError("No text could be extracted from the uploaded document")
    logger.info(
        "sla_extraction_file_parse_done source=%s doc_type=%s extracted_chars=%s",
        source_document_name,
        document_type,
        len(extracted_text),
    )
    return orchestrate_extraction(
        source_document_name=source_document_name,
        document_type=document_type,
        sample_text=extracted_text,
    )


def _candidate_out(candidate: SlaExtractionCandidate) -> dict:
    return {
        "id": candidate.id,
        "name": candidate.name,
        "applies_to": candidate.applies_to,
        "conditions": candidate.conditions,
        "response_deadline_hours": candidate.response_deadline_hours,
        "resolution_deadline_hours": candidate.resolution_deadline_hours,
        "penalty_amount": round(candidate.penalty_amount, 2),
        "escalation_owner": candidate.escalation_owner,
        "escalation_policy": candidate.escalation_policy or {},
        "business_hours_logic": candidate.business_hours_logic,
        "business_hours_definition": candidate.business_hours_definition or {},
        "auto_action_allowed": candidate.auto_action_allowed,
        "auto_action_policy": candidate.auto_action_policy or {},
        "status": candidate.status,
        "confidence_score": round(candidate.confidence_score or 0.0, 3),
        "parsing_notes": candidate.parsing_notes or [],
        "extraction_source": candidate.extraction_source,
        "business_document": _resolve_business_document(candidate),
        "candidate_metadata": candidate.candidate_metadata or {},
    }


def contract_pdf_path_for_batch(batch_id: int) -> Path:
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    return settings.reports_dir / f"sla-contract-batch-{batch_id}.pdf"


def _contract_pdf_path_value(batch: SlaExtractionBatch) -> str | None:
    value = (batch.run_metadata or {}).get("contract_pdf_path")
    if isinstance(value, str) and value.strip():
        return value
    path = contract_pdf_path_for_batch(batch.id)
    return str(path) if path.exists() else None


def batch_out(batch: SlaExtractionBatch) -> dict:
    return {
        "id": batch.id,
        "source_document_name": batch.source_document_name,
        "document_type": batch.document_type,
        "status": batch.status,
        "uploaded_at": batch.uploaded_at,
        "extraction_source": batch.extraction_source,
        "contract_pdf_path": _contract_pdf_path_value(batch),
        "run_metadata": batch.run_metadata or {},
        "candidate_rules": [_candidate_out(candidate) for candidate in batch.candidates],
    }


def list_extraction_batches(db: Session, organization_id: int) -> list[dict]:
    batches = db.scalars(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.organization_id == organization_id)
        .options(selectinload(SlaExtractionBatch.candidates))
        .order_by(SlaExtractionBatch.uploaded_at.desc())
    ).all()
    return [batch_out(batch) for batch in batches]


def _save_extraction_batch(
    db: Session,
    *,
    organization_id: int,
    source_document_name: str,
    extraction: ExtractionOutput,
) -> dict:
    logger.info(
        "sla_extraction_persist_start source=%s org_id=%s candidates=%s provider=%s model=%s",
        source_document_name,
        organization_id,
        len(extraction.candidates),
        extraction.run_metadata.provider,
        extraction.run_metadata.model,
    )
    batch = SlaExtractionBatch(
        organization_id=organization_id,
        source_document_name=source_document_name,
        document_type=extraction.intake.document_type,
        status="pending_review",
        uploaded_at=datetime.now(UTC),
        extraction_source=extraction.intake.extraction_source,
        run_metadata=extraction.run_metadata.model_dump(),
    )
    db.add(batch)
    db.flush()
    for candidate in extraction.candidates:
        db.add(
            SlaExtractionCandidate(
                batch_id=batch.id,
                name=candidate.name,
                applies_to=candidate.applies_to,
                conditions=candidate.conditions,
                response_deadline_hours=candidate.response_deadline_hours,
                resolution_deadline_hours=candidate.resolution_deadline_hours,
                penalty_amount=candidate.penalty_amount,
                escalation_owner=candidate.escalation_owner,
                escalation_policy=candidate.escalation_policy,
                business_hours_logic=candidate.business_hours_logic,
                business_hours_definition=candidate.business_hours_definition,
                auto_action_allowed=candidate.auto_action_allowed,
                auto_action_policy=candidate.auto_action_policy,
                status="pending",
                confidence_score=candidate.confidence_score,
                parsing_notes=candidate.parsing_notes,
                extraction_source=candidate.extraction_source,
                candidate_metadata={
                    **(candidate.candidate_metadata or {}),
                    "business_document": candidate.business_document.model_dump(),
                },
            )
        )
    contract_path = contract_pdf_path_for_batch(batch.id)
    _render_contract_pdf(
        source_document_name=source_document_name,
        output_path=contract_path,
        candidates=extraction.candidates,
    )
    batch.run_metadata = {
        **(batch.run_metadata or {}),
        "contract_pdf_path": str(contract_path),
    }
    log_event(
        db,
        organization_id=organization_id,
        entity_type="sla_extraction_batch",
        entity_id=batch.id,
        event_type="uploaded",
        payload={
            "source_document_name": source_document_name,
            "document_type": extraction.intake.document_type,
            "provider": extraction.run_metadata.provider,
            "model": extraction.run_metadata.model,
        },
    )
    db.commit()
    batch = db.scalar(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.id == batch.id)
        .options(selectinload(SlaExtractionBatch.candidates))
    )
    logger.info(
        "sla_extraction_persist_done batch_id=%s source=%s status=%s",
        batch.id,
        source_document_name,
        batch.status,
    )
    return batch_out(batch)


def _draw_wrapped_lines(
    pdf: canvas.Canvas,
    *,
    text: str,
    x: int,
    y: int,
    max_width: int,
    line_height: int,
    bullet: str | None = None,
) -> int:
    parts = [segment for segment in text.split() if segment]
    if not parts:
        return y
    prefix = f"{bullet} " if bullet else ""
    line = prefix
    for word in parts:
        candidate = f"{line}{word} "
        if pdf.stringWidth(candidate.strip(), "Helvetica", 10) > max_width and line.strip():
            pdf.drawString(x, y, line.strip())
            y -= line_height
            line = ("  " if bullet else "") + f"{word} "
        else:
            line = candidate
    if line.strip():
        pdf.drawString(x, y, line.strip())
        y -= line_height
    return y


def _ensure_page_space(pdf: canvas.Canvas, y: int, minimum: int = 90) -> int:
    if y >= minimum:
        return y
    pdf.showPage()
    pdf.setFont("Helvetica", 10)
    return A4[1] - 56


def _render_contract_pdf(
    *,
    source_document_name: str,
    output_path: Path,
    candidates: list[SlaCandidateContract],
) -> None:
    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    pdf.setTitle(f"SLA Contract Review - {source_document_name}")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(44, height - 46, "Business Contract Review")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(44, height - 68, f"Source document: {source_document_name}")
    pdf.drawString(44, height - 84, f"Generated: {datetime.now(UTC).isoformat()} UTC")
    y = height - 114

    for index, candidate in enumerate(candidates, start=1):
        y = _ensure_page_space(pdf, y, 120)
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(44, y, f"{index}. {candidate.name}")
        y -= 18
        pdf.setFont("Helvetica", 10)
        pdf.drawString(
            44,
            y,
            (
                f"Response {candidate.response_deadline_hours}h | "
                f"Resolution {candidate.resolution_deadline_hours}h | "
                f"Penalty INR {candidate.penalty_amount:,.2f}"
            ),
        )
        y -= 18

        sections = [
            ("Executive summary", [candidate.business_document.executive_summary] if candidate.business_document.executive_summary else []),
            ("Service scope", candidate.business_document.service_scope),
            ("Service-level commitments", candidate.business_document.service_level_commitments),
            ("Operational obligations", candidate.business_document.operational_obligations),
            ("Exclusions and assumptions", candidate.business_document.exclusions_and_assumptions),
            ("Commercial terms", candidate.business_document.commercial_terms),
            ("Escalation path", candidate.business_document.escalation_path),
            ("Approval and governance", candidate.business_document.approval_and_governance),
            ("Risk watchouts", candidate.business_document.risk_watchouts),
        ]

        for heading, items in sections:
            if not items:
                continue
            y = _ensure_page_space(pdf, y, 90)
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(44, y, heading)
            y -= 14
            pdf.setFont("Helvetica", 10)
            for item in items:
                y = _draw_wrapped_lines(
                    pdf,
                    text=item,
                    x=54,
                    y=y,
                    max_width=int(width) - 110,
                    line_height=13,
                    bullet="-",
                )
            y -= 4

        y = _ensure_page_space(pdf, y, 90)
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(44, y, "Matching logic")
        y -= 14
        pdf.setFont("Helvetica", 10)
        applies_to = ", ".join(f"{key}={value}" for key, value in (candidate.applies_to or {}).items()) or "broad fallback"
        y = _draw_wrapped_lines(
            pdf,
            text=f"Applies to: {applies_to}",
            x=54,
            y=y,
            max_width=int(width) - 110,
            line_height=13,
            bullet="-",
        )
        y = _draw_wrapped_lines(
            pdf,
            text=f"Conditions: {candidate.conditions}",
            x=54,
            y=y,
            max_width=int(width) - 110,
            line_height=13,
            bullet="-",
        )
        y = _draw_wrapped_lines(
            pdf,
            text=f"Escalation owner: {candidate.escalation_owner}",
            x=54,
            y=y,
            max_width=int(width) - 110,
            line_height=13,
            bullet="-",
        )
        y -= 10

    pdf.save()


def get_extraction_batch(db: Session, *, batch_id: int) -> SlaExtractionBatch:
    batch = db.scalar(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.id == batch_id)
        .options(selectinload(SlaExtractionBatch.candidates))
    )
    if batch is None:
        raise ValueError("SLA extraction batch not found")
    return batch


def create_extraction_batch(
    db: Session,
    *,
    organization_id: int,
    source_document_name: str,
    document_type: str,
    sample_text: str | None,
) -> dict:
    extraction = orchestrate_extraction(
        source_document_name=source_document_name,
        document_type=document_type,
        sample_text=sample_text,
    )
    return _save_extraction_batch(
        db,
        organization_id=organization_id,
        source_document_name=source_document_name,
        extraction=extraction,
    )


def create_extraction_batch_from_file(
    db: Session,
    *,
    organization_id: int,
    source_document_name: str,
    document_type: str,
    file_bytes: bytes,
) -> dict:
    extraction = orchestrate_extraction_from_file(
        source_document_name=source_document_name,
        document_type=document_type,
        file_bytes=file_bytes,
    )
    return _save_extraction_batch(
        db,
        organization_id=organization_id,
        source_document_name=source_document_name,
        extraction=extraction,
    )


def approve_extraction_batch(db: Session, *, batch_id: int, edits: list[dict]) -> dict:
    batch = db.scalar(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.id == batch_id)
        .options(selectinload(SlaExtractionBatch.candidates))
    )
    if batch is None:
        raise ValueError("SLA extraction batch not found")

    logger.info("sla_extraction_approve_start batch_id=%s edit_count=%s", batch_id, len(edits))
    edits_by_id = {item["id"]: item for item in edits}
    created_rules = 0
    for candidate in batch.candidates:
        if candidate.status == "discarded":
            logger.info("sla_extraction_approve_skip_candidate candidate_id=%s reason=discarded", candidate.id)
            continue
        patch = edits_by_id.get(candidate.id, {})
        for field in (
            "name",
            "applies_to",
            "conditions",
            "response_deadline_hours",
            "resolution_deadline_hours",
            "penalty_amount",
            "escalation_owner",
            "escalation_policy",
            "business_hours_logic",
            "business_hours_definition",
            "auto_action_allowed",
            "auto_action_policy",
        ):
            if field in patch:
                setattr(candidate, field, patch[field])
        candidate.status = "approved"
        db.add(
            SlaRulebookEntry(
                organization_id=batch.organization_id,
                name=candidate.name,
                status="active",
                applies_to=candidate.applies_to,
                conditions=candidate.conditions,
                response_deadline_hours=candidate.response_deadline_hours,
                resolution_deadline_hours=candidate.resolution_deadline_hours,
                penalty_amount=candidate.penalty_amount,
                escalation_owner=candidate.escalation_owner,
                escalation_policy=candidate.escalation_policy,
                business_hours_logic=candidate.business_hours_logic,
                business_hours_definition=candidate.business_hours_definition,
                auto_action_allowed=candidate.auto_action_allowed,
                auto_action_policy=candidate.auto_action_policy,
                source_document_name=batch.source_document_name,
                source_batch_id=batch.id,
                rule_version=1,
                reviewed_by="business-reviewer",
                review_notes="Approved from extraction review queue.",
                last_reviewed_at=datetime.now(UTC),
            )
        )
        created_rules += 1

    batch.status = "approved"
    log_event(
        db,
        organization_id=batch.organization_id,
        entity_type="sla_extraction_batch",
        entity_id=batch.id,
        event_type="approved",
        payload={"rules_created": created_rules},
    )
    db.commit()
    logger.info("sla_extraction_approve_done batch_id=%s rules_created=%s", batch.id, created_rules)
    return {"batch_id": batch.id, "status": batch.status, "rules_created": created_rules}


def discard_extraction_candidate(db: Session, *, candidate_id: int) -> dict:
    """Mark a single candidate as discarded before batch approval (skipped when creating rules)."""
    candidate = db.scalar(
        select(SlaExtractionCandidate).where(SlaExtractionCandidate.id == candidate_id)
    )
    if candidate is None:
        raise ValueError("SLA extraction candidate not found")
    batch_row = db.get(SlaExtractionBatch, candidate.batch_id)
    if batch_row is None:
        raise ValueError("SLA extraction batch not found")
    candidate.status = "discarded"
    log_event(
        db,
        organization_id=batch_row.organization_id,
        entity_type="sla_extraction_candidate",
        entity_id=candidate.id,
        event_type="discarded",
        payload={"batch_id": candidate.batch_id, "name": candidate.name},
    )
    db.commit()
    db.refresh(candidate)
    logger.info("sla_extraction_candidate_discard_done candidate_id=%s batch_id=%s", candidate.id, candidate.batch_id)
    return batch_out(
        db.scalar(
            select(SlaExtractionBatch)
            .where(SlaExtractionBatch.id == candidate.batch_id)
            .options(selectinload(SlaExtractionBatch.candidates))
        )
    )


def discard_extraction_batch(db: Session, *, batch_id: int) -> dict:
    batch = db.scalar(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.id == batch_id)
        .options(selectinload(SlaExtractionBatch.candidates))
    )
    if batch is None:
        raise ValueError("SLA extraction batch not found")
    batch.status = "discarded"
    for candidate in batch.candidates:
        candidate.status = "discarded"
    log_event(
        db,
        organization_id=batch.organization_id,
        entity_type="sla_extraction_batch",
        entity_id=batch.id,
        event_type="discarded",
        payload={"source_document_name": batch.source_document_name},
    )
    db.commit()
    logger.info("sla_extraction_discard_done batch_id=%s", batch.id)
    return {"batch_id": batch.id, "status": batch.status, "rules_created": 0}
