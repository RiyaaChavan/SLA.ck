from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.domain import SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry
from app.services.sla.contracts import DocumentIntake, ExtractionOutput, SlaCandidateContract
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
    if response_hours != candidate.response_deadline_hours:
        parsing_notes.append("Normalized response deadline to minimum supported value.")
    if resolution_hours != candidate.resolution_deadline_hours:
        parsing_notes.append("Normalized resolution deadline to remain >= response deadline.")
    return candidate.model_copy(
        update={
            "name": candidate.name.strip(),
            "response_deadline_hours": response_hours,
            "resolution_deadline_hours": resolution_hours,
            "penalty_amount": round(float(candidate.penalty_amount), 2),
            "confidence_score": round(float(candidate.confidence_score), 3),
            "parsing_notes": parsing_notes,
            "extraction_source": intake.extraction_source,
        }
    )


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
        "candidate_metadata": candidate.candidate_metadata or {},
    }


def batch_out(batch: SlaExtractionBatch) -> dict:
    return {
        "id": batch.id,
        "source_document_name": batch.source_document_name,
        "document_type": batch.document_type,
        "status": batch.status,
        "uploaded_at": batch.uploaded_at,
        "extraction_source": batch.extraction_source,
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
                candidate_metadata=candidate.candidate_metadata,
            )
        )
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
