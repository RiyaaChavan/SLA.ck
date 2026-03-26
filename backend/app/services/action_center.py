from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Action, Alert, Recommendation
from app.services.case_read_model import build_action_request, load_case_context
from app.services.workflow.approval import decide_recommendation, execute_action


def list_action_requests(db: Session, organization_id: int) -> list[dict]:
    alerts = db.scalars(
        select(Alert).where(Alert.organization_id == organization_id).order_by(Alert.projected_impact.desc())
    ).all()
    context = load_case_context(db, organization_id)
    actions = [build_action_request(alert, context) for alert in alerts]
    return [item for item in actions if item is not None]


def get_action_request(db: Session, action_id: int) -> dict:
    action = db.get(Action, action_id)
    if action is None:
        raise ValueError("Action not found")
    recommendation = db.get(Recommendation, action.recommendation_id)
    if recommendation is None:
        raise ValueError("Recommendation not found")
    alert = db.get(Alert, recommendation.alert_id)
    if alert is None:
        raise ValueError("Case not found")
    context = load_case_context(db, alert.organization_id)
    payload = build_action_request(alert, context)
    if payload is None:
        raise ValueError("Action request unavailable")
    return payload


def approve_action_request(
    db: Session, *, action_id: int, approver_name: str, notes: str | None = None
) -> dict:
    action = db.get(Action, action_id)
    if action is None:
        raise ValueError("Action not found")
    decide_recommendation(
        db,
        recommendation_id=action.recommendation_id,
        approver_name=approver_name,
        approved=True,
        notes=notes,
    )
    return get_action_request(db, action_id)


def reject_action_request(
    db: Session, *, action_id: int, approver_name: str, notes: str | None = None
) -> dict:
    action = db.get(Action, action_id)
    if action is None:
        raise ValueError("Action not found")
    decide_recommendation(
        db,
        recommendation_id=action.recommendation_id,
        approver_name=approver_name,
        approved=False,
        notes=notes,
    )
    return get_action_request(db, action_id)


def execute_action_request(db: Session, *, action_id: int) -> dict:
    execute_action(db, action_id=action_id)
    return get_action_request(db, action_id)
