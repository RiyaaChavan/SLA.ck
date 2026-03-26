from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry
from app.utils.audit import log_event


def _candidate_payload(source_document_name: str) -> list[dict]:
    lowered = source_document_name.lower()
    if "premium" in lowered or "support" in lowered:
        return [
            {
                "name": "Premium P1 Response SLA",
                "applies_to": {"priority": "P1", "customer_tier": "premium"},
                "conditions": "Apply when premium incidents are opened in the support or ops queue.",
                "response_deadline_hours": 1,
                "resolution_deadline_hours": 4,
                "penalty_amount": 90000.0,
                "escalation_owner": "Support Director",
                "business_hours_logic": "24x7",
                "auto_action_allowed": True,
            }
        ]
    return [
        {
            "name": "Operations Standard SLA",
            "applies_to": {"queue": "operations", "priority": "standard"},
            "conditions": "Apply to standard operational work items and warehouse requests.",
            "response_deadline_hours": 4,
            "resolution_deadline_hours": 12,
            "penalty_amount": 45000.0,
            "escalation_owner": "Operations Director",
            "business_hours_logic": "Business hours",
            "auto_action_allowed": False,
        },
        {
            "name": "Vendor Dispute SLA",
            "applies_to": {"workflow": "vendor_dispute"},
            "conditions": "Apply when finance or procurement raises a vendor discrepancy case.",
            "response_deadline_hours": 8,
            "resolution_deadline_hours": 24,
            "penalty_amount": 30000.0,
            "escalation_owner": "Procurement Head",
            "business_hours_logic": "Business hours",
            "auto_action_allowed": False,
        },
    ]


def _batch_out(batch: SlaExtractionBatch) -> dict:
    return {
        "id": batch.id,
        "source_document_name": batch.source_document_name,
        "status": batch.status,
        "uploaded_at": batch.uploaded_at,
        "candidate_rules": [
            {
                "id": candidate.id,
                "name": candidate.name,
                "applies_to": candidate.applies_to,
                "conditions": candidate.conditions,
                "response_deadline_hours": candidate.response_deadline_hours,
                "resolution_deadline_hours": candidate.resolution_deadline_hours,
                "penalty_amount": round(candidate.penalty_amount, 2),
                "escalation_owner": candidate.escalation_owner,
                "business_hours_logic": candidate.business_hours_logic,
                "auto_action_allowed": candidate.auto_action_allowed,
                "status": candidate.status,
            }
            for candidate in batch.candidates
        ],
    }


def list_rulebook_entries(db: Session, organization_id: int) -> list[dict]:
    rules = db.scalars(
        select(SlaRulebookEntry)
        .where(SlaRulebookEntry.organization_id == organization_id)
        .order_by(SlaRulebookEntry.created_at.desc())
    ).all()
    return [
        {
            "id": rule.id,
            "name": rule.name,
            "status": rule.status,
            "applies_to": rule.applies_to,
            "conditions": rule.conditions,
            "response_deadline_hours": rule.response_deadline_hours,
            "resolution_deadline_hours": rule.resolution_deadline_hours,
            "penalty_amount": round(rule.penalty_amount, 2),
            "escalation_owner": rule.escalation_owner,
            "business_hours_logic": rule.business_hours_logic,
            "auto_action_allowed": rule.auto_action_allowed,
            "source_document_name": rule.source_document_name,
            "last_reviewed_at": rule.last_reviewed_at,
        }
        for rule in rules
    ]


def list_extraction_batches(db: Session, organization_id: int) -> list[dict]:
    batches = db.scalars(
        select(SlaExtractionBatch)
        .where(SlaExtractionBatch.organization_id == organization_id)
        .order_by(SlaExtractionBatch.uploaded_at.desc())
    ).all()
    return [_batch_out(batch) for batch in batches]


def create_extraction_batch(
    db: Session,
    *,
    organization_id: int,
    source_document_name: str,
) -> dict:
    batch = SlaExtractionBatch(
        organization_id=organization_id,
        source_document_name=source_document_name,
        status="pending_review",
        uploaded_at=datetime.now(UTC),
    )
    db.add(batch)
    db.flush()
    for candidate_payload in _candidate_payload(source_document_name):
        db.add(SlaExtractionCandidate(batch_id=batch.id, **candidate_payload))
    log_event(
        db,
        organization_id=organization_id,
        entity_type="sla_extraction_batch",
        entity_id=batch.id,
        event_type="uploaded",
        payload={"source_document_name": source_document_name},
    )
    db.commit()
    db.refresh(batch)
    return _batch_out(batch)


def approve_extraction_batch(db: Session, *, batch_id: int, edits: list[dict]) -> dict:
    batch = db.get(SlaExtractionBatch, batch_id)
    if batch is None:
        raise ValueError("SLA extraction batch not found")

    edits_by_id = {item["id"]: item for item in edits}
    created_rules = 0
    for candidate in batch.candidates:
        patch = edits_by_id.get(candidate.id, {})
        candidate.name = patch.get("name", candidate.name)
        candidate.applies_to = patch.get("applies_to", candidate.applies_to)
        candidate.conditions = patch.get("conditions", candidate.conditions)
        candidate.response_deadline_hours = patch.get(
            "response_deadline_hours", candidate.response_deadline_hours
        )
        candidate.resolution_deadline_hours = patch.get(
            "resolution_deadline_hours", candidate.resolution_deadline_hours
        )
        candidate.penalty_amount = patch.get("penalty_amount", candidate.penalty_amount)
        candidate.escalation_owner = patch.get("escalation_owner", candidate.escalation_owner)
        candidate.business_hours_logic = patch.get(
            "business_hours_logic", candidate.business_hours_logic
        )
        candidate.auto_action_allowed = patch.get(
            "auto_action_allowed", candidate.auto_action_allowed
        )
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
                business_hours_logic=candidate.business_hours_logic,
                auto_action_allowed=candidate.auto_action_allowed,
                source_document_name=batch.source_document_name,
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
    return {"batch_id": batch.id, "status": batch.status, "rules_created": created_rules}


def discard_extraction_batch(db: Session, *, batch_id: int) -> dict:
    batch = db.get(SlaExtractionBatch, batch_id)
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
    return {"batch_id": batch.id, "status": batch.status, "rules_created": 0}
