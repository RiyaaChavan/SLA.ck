from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Department, SLA, Workflow


def _risk_level(minutes: int, backlog_hours: float) -> str:
    if minutes <= 0:
        return "critical"
    if minutes <= 60 or backlog_hours >= 48:
        return "high"
    if minutes <= 240 or backlog_hours >= 24:
        return "medium"
    return "low"


def list_live_ops(db: Session, organization_id: int) -> list[dict]:
    departments = {
        item.id: item
        for item in db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    }
    slas = {
        item.department_id: item
        for item in db.scalars(select(SLA).where(SLA.organization_id == organization_id)).all()
    }
    workflows = db.scalars(
        select(Workflow).where(Workflow.organization_id == organization_id).order_by(Workflow.expected_by.asc())
    ).all()

    now = datetime.now(UTC)
    items: list[dict] = []
    for workflow in workflows:
        department = departments.get(workflow.department_id)
        sla = slas.get(workflow.department_id)
        if workflow.expected_by.tzinfo is None:
            naive_now = datetime.now(UTC).replace(tzinfo=None)
            time_remaining_minutes = int((workflow.expected_by - naive_now).total_seconds() // 60)
        else:
            time_remaining_minutes = int((workflow.expected_by - now).total_seconds() // 60)
        response_deadline = workflow.opened_at + timedelta(hours=max((sla.target_hours if sla else 8) // 2, 1))
        projected_penalty = (
            round((sla.penalty_per_breach if sla else 35_000) * max(workflow.backlog_hours / max((sla.target_hours if sla else 8), 1), 0.5), 2)
        )
        items.append(
            {
                "id": workflow.id,
                "item_type": workflow.workflow_type,
                "title": f"{workflow.workflow_type.replace('_', ' ').title()} work item",
                "team": department.name if department else None,
                "owner_name": (
                    f"{department.name} Queue Owner" if department else "Operations Queue Owner"
                ),
                "status": workflow.status,
                "current_stage": "escalation" if time_remaining_minutes <= 0 else "monitoring",
                "assigned_sla_name": sla.name if sla else None,
                "response_deadline": response_deadline,
                "resolution_deadline": workflow.expected_by,
                "time_remaining_minutes": time_remaining_minutes,
                "predicted_breach_risk": _risk_level(time_remaining_minutes, workflow.backlog_hours),
                "projected_penalty": projected_penalty,
                "linked_case_id": None,
                "suggested_action": (
                    "Escalate and reroute backlog" if time_remaining_minutes <= 60 else "Monitor queue and rebalance"
                ),
            }
        )
    items.sort(key=lambda item: (item["time_remaining_minutes"], -item["projected_penalty"]))
    return items
