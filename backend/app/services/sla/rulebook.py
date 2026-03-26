from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import SlaRulebookEntry
from app.utils.audit import log_event


def rulebook_out(rule: SlaRulebookEntry) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "status": rule.status,
        "applies_to": rule.applies_to,
        "conditions": rule.conditions,
        "response_deadline_hours": rule.response_deadline_hours,
        "resolution_deadline_hours": rule.resolution_deadline_hours,
        "penalty_amount": round(rule.penalty_amount, 2),
        "escalation_owner": rule.escalation_owner,
        "escalation_policy": rule.escalation_policy or {},
        "business_hours_logic": rule.business_hours_logic,
        "business_hours_definition": rule.business_hours_definition or {},
        "auto_action_allowed": rule.auto_action_allowed,
        "auto_action_policy": rule.auto_action_policy or {},
        "source_document_name": rule.source_document_name,
        "rule_version": rule.rule_version,
        "reviewed_by": rule.reviewed_by,
        "review_notes": rule.review_notes,
        "last_reviewed_at": rule.last_reviewed_at,
        "supersedes_rule_id": rule.supersedes_rule_id,
        "source_batch_id": rule.source_batch_id,
    }


def list_rulebook_entries(
    db: Session,
    organization_id: int,
    *,
    status: str | None = None,
    search: str | None = None,
    workflow_category: str | None = None,
    priority: str | None = None,
    business_unit: str | None = None,
) -> list[dict]:
    stmt = select(SlaRulebookEntry).where(SlaRulebookEntry.organization_id == organization_id)
    if status:
        stmt = stmt.where(SlaRulebookEntry.status == status)
    if search:
        stmt = stmt.where(SlaRulebookEntry.name.ilike(f"%{search}%"))
    for key, value in (
        ("workflow_category", workflow_category),
        ("priority", priority),
        ("business_unit", business_unit),
    ):
        if value:
            stmt = stmt.where(SlaRulebookEntry.applies_to.contains({key: value}))
    rules = db.scalars(stmt.order_by(SlaRulebookEntry.created_at.desc())).all()
    return [rulebook_out(rule) for rule in rules]


def create_rulebook_entry(db: Session, *, organization_id: int, payload: dict) -> dict:
    rule = SlaRulebookEntry(
        organization_id=organization_id,
        name=payload["name"],
        status=payload.get("status", "draft"),
        applies_to=payload.get("applies_to", {}),
        conditions=payload["conditions"],
        response_deadline_hours=payload["response_deadline_hours"],
        resolution_deadline_hours=payload["resolution_deadline_hours"],
        penalty_amount=payload.get("penalty_amount", 0.0),
        escalation_owner=payload["escalation_owner"],
        escalation_policy=payload.get("escalation_policy", {}),
        business_hours_logic=payload.get("business_hours_logic", "business_hours"),
        business_hours_definition=payload.get("business_hours_definition", {}),
        auto_action_allowed=payload.get("auto_action_allowed", False),
        auto_action_policy=payload.get("auto_action_policy", {}),
        source_document_name=payload.get("source_document_name", "manual_rule"),
        rule_version=payload.get("rule_version", 1),
        reviewed_by=payload.get("reviewed_by"),
        review_notes=payload.get("review_notes"),
        last_reviewed_at=datetime.now(UTC) if payload.get("reviewed_by") else None,
        supersedes_rule_id=payload.get("supersedes_rule_id"),
        source_batch_id=payload.get("source_batch_id"),
    )
    db.add(rule)
    db.flush()
    log_event(
        db,
        organization_id=organization_id,
        entity_type="sla_rulebook_entry",
        entity_id=rule.id,
        event_type="created",
        payload={"status": rule.status, "name": rule.name},
    )
    db.commit()
    db.refresh(rule)
    return rulebook_out(rule)


def update_rulebook_entry(db: Session, *, rule_id: int, payload: dict) -> dict:
    rule = db.get(SlaRulebookEntry, rule_id)
    if rule is None:
        raise ValueError("SLA rulebook entry not found")
    previous_status = rule.status
    for field in (
        "name",
        "status",
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
        "source_document_name",
        "reviewed_by",
        "review_notes",
        "supersedes_rule_id",
    ):
        if field in payload:
            setattr(rule, field, payload[field])
    if payload:
        rule.rule_version = (rule.rule_version or 1) + 1
        rule.last_reviewed_at = datetime.now(UTC)
    log_event(
        db,
        organization_id=rule.organization_id,
        entity_type="sla_rulebook_entry",
        entity_id=rule.id,
        event_type="updated",
        payload={"previous_status": previous_status, "status": rule.status, "version": rule.rule_version},
    )
    db.commit()
    db.refresh(rule)
    return rulebook_out(rule)


def archive_rulebook_entry(db: Session, *, rule_id: int, reviewed_by: str | None = None) -> dict:
    return update_rulebook_entry(
        db,
        rule_id=rule_id,
        payload={
            "status": "archived",
            "reviewed_by": reviewed_by,
            "review_notes": "Rule archived.",
        },
    )
