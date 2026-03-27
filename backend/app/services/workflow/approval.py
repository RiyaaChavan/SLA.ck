from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Action,
    ActionStatus,
    Alert,
    AlertStatus,
    Approval,
    ApprovalDecision,
    Recommendation,
)
from app.utils.audit import log_event


def decide_recommendation(
    db: Session, *, recommendation_id: int, approver_name: str, approved: bool, notes: str | None
) -> Recommendation:
    recommendation = db.get(Recommendation, recommendation_id)
    if recommendation is None:
        raise ValueError("Recommendation not found")

    existing = db.scalar(
        select(Approval).where(Approval.recommendation_id == recommendation_id).order_by(Approval.id.desc())
    )
    approval = existing or Approval(recommendation_id=recommendation_id, approver_name=approver_name)
    approval.approver_name = approver_name
    approval.notes = notes
    approval.decision = ApprovalDecision.approved if approved else ApprovalDecision.rejected
    approval.decided_at = datetime.now(UTC)
    db.add(approval)

    alert = db.get(Alert, recommendation.alert_id)
    if alert:
        alert.status = AlertStatus.approved if approved else AlertStatus.rejected
        log_event(
            db,
            organization_id=alert.organization_id,
            entity_type="recommendation",
            entity_id=recommendation.id,
            event_type="approved" if approved else "rejected",
            payload={"approver_name": approver_name, "notes": notes},
        )
    db.commit()
    db.refresh(recommendation)
    return recommendation


def execute_action(db: Session, *, action_id: int) -> Action:
    action = db.get(Action, action_id)
    if action is None:
        raise ValueError("Action not found")

    action.status = ActionStatus.executed
    action.executed_at = datetime.now(UTC)
    action.result_summary = f"Executed {action.action_type} through SLA.ck workflow engine."
    recommendation = db.get(Recommendation, action.recommendation_id)
    if recommendation is not None:
        alert = db.get(Alert, recommendation.alert_id)
        if alert:
            alert.status = AlertStatus.actioned
            log_event(
                db,
                organization_id=alert.organization_id,
                entity_type="action",
                entity_id=action.id,
                event_type="executed",
                payload={"action_type": action.action_type},
            )
    db.commit()
    db.refresh(action)
    return action
