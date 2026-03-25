from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.domain import AuditEvent


def log_event(
    db: Session,
    *,
    organization_id: int,
    entity_type: str,
    entity_id: int,
    event_type: str,
    payload: dict,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        payload=payload,
        created_at=datetime.now(UTC),
    )
    db.add(event)
    return event
