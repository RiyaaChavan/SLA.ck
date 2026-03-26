from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Alert
from app.services.case_read_model import SEVERITY_RANK, build_case_detail, build_case_summary, load_case_context


def _matches_filter(value: str | None, expected: str | None) -> bool:
    if not expected:
        return True
    if value is None:
        return False
    return value.lower() == expected.lower()


def list_cases(
    db: Session,
    organization_id: int,
    *,
    sort: str = "cost_impact",
    severity: str | None = None,
    status: str | None = None,
    module: str | None = None,
    team: str | None = None,
    vendor: str | None = None,
    detector: str | None = None,
    approver: str | None = None,
    action_state: str | None = None,
) -> list[dict]:
    alerts = db.scalars(
        select(Alert).where(Alert.organization_id == organization_id).order_by(Alert.id.desc())
    ).all()
    context = load_case_context(db, organization_id)
    cases = [build_case_summary(alert, context) for alert in alerts]
    filtered = [
        case
        for case in cases
        if _matches_filter(case["severity"], severity)
        and _matches_filter(case["status"], status)
        and _matches_filter(case["module"], module)
        and _matches_filter(case["team"], team)
        and _matches_filter(case["vendor"], vendor)
        and _matches_filter(case["detector_name"], detector)
        and _matches_filter(case["approver_name"], approver)
        and _matches_filter(case["action_state"], action_state)
    ]

    if sort == "severity":
        filtered.sort(key=lambda item: SEVERITY_RANK.get(item["severity"], 0), reverse=True)
    elif sort == "deadline":
        filtered.sort(
            key=lambda item: (
                item["sla_countdown_minutes"] is None,
                item["sla_countdown_minutes"] if item["sla_countdown_minutes"] is not None else 0,
            )
        )
    elif sort == "sla_risk":
        filtered.sort(
            key=lambda item: (
                SEVERITY_RANK.get(item["sla_risk_level"] or "", 0),
                -(item["projected_impact"]),
            ),
            reverse=True,
        )
    elif sort == "newest":
        filtered.sort(key=lambda item: item["created_at"], reverse=True)
    elif sort == "status":
        filtered.sort(key=lambda item: (item["status"], -item["projected_impact"]))
    else:
        filtered.sort(key=lambda item: item["projected_impact"], reverse=True)
    return filtered


def get_case_detail(db: Session, case_id: int) -> dict:
    alert = db.get(Alert, case_id)
    if alert is None:
        raise ValueError("Case not found")
    context = load_case_context(db, alert.organization_id)
    return build_case_detail(alert, context)
