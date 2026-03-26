from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.domain import Department, Organization, Workflow
from app.services.cases import list_cases


def impact_overview(db: Session, organization_id: int) -> dict:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")

    cases = list_cases(db, organization_id, sort="cost_impact")
    departments = {
        item.id: item
        for item in db.query(Department).filter(Department.organization_id == organization_id).all()
    }
    projected_total = round(sum(item["projected_impact"] for item in cases), 2)
    penalty_exposure = round(
        sum(item["projected_impact"] for item in cases if item["module"] == "SLA Sentinel"), 2
    )
    projected_savings = round(sum(item["projected_impact"] * 0.63 for item in cases), 2)
    realized_savings = round(sum((item["realized_impact"] or 0.0) for item in cases), 2)
    approved_actions = sum(1 for item in cases if item["approval_state"] == "approved")
    executed_actions = sum(1 for item in cases if item["action_state"] == "executed")
    open_high_risk = sum(
        1 for item in cases if item["severity"] in {"high", "critical"} and item["status"] != "actioned"
    )

    vendor_rollup: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"projected_impact": 0.0, "case_count": 0}
    )
    for item in cases:
        if not item["vendor"]:
            continue
        vendor_rollup[item["vendor"]]["projected_impact"] += item["projected_impact"]
        vendor_rollup[item["vendor"]]["case_count"] += 1

    workflows = (
        db.query(Workflow)
        .filter(Workflow.organization_id == organization_id)
        .filter(Workflow.resolved_at.is_(None))
        .filter(Workflow.status.in_(("open", "pending", "active")))
        .all()
    )
    team_backlog: dict[str, dict[str, float]] = defaultdict(
        lambda: {"overload_hours": 0.0, "projected_impact": 0.0}
    )
    for workflow in workflows:
        department = departments.get(workflow.department_id)
        team_name = department.name if department else f"Department {workflow.department_id}"
        team_backlog[team_name]["overload_hours"] += workflow.backlog_hours
    for item in cases:
        if item["team"] and item["module"] == "SLA Sentinel":
            team_backlog[item["team"]]["projected_impact"] += item["projected_impact"]

    top_vendors = sorted(
        (
            {
                "vendor_name": vendor_name,
                "projected_impact": round(values["projected_impact"], 2),
                "case_count": int(values["case_count"]),
            }
            for vendor_name, values in vendor_rollup.items()
        ),
        key=lambda item: item["projected_impact"],
        reverse=True,
    )[:5]

    top_teams = sorted(
        (
            {
                "team_name": team_name,
                "overload_hours": round(values["overload_hours"], 2),
                "projected_impact": round(values["projected_impact"], 2),
            }
            for team_name, values in team_backlog.items()
        ),
        key=lambda item: (item["overload_hours"], item["projected_impact"]),
        reverse=True,
    )[:5]

    return {
        "organization": organization,
        "metrics": [
            {"label": "Total projected leakage detected", "value": projected_total, "delta": 12.6},
            {"label": "Total penalty exposure", "value": penalty_exposure, "delta": 8.4},
            {"label": "Total projected savings", "value": projected_savings, "delta": 10.1},
            {"label": "Approved actions", "value": float(approved_actions), "delta": None},
            {"label": "Executed actions", "value": float(executed_actions), "delta": None},
            {"label": "Open high-risk cases", "value": float(open_high_risk), "delta": -3.0},
        ],
        "top_vendors_by_risk": top_vendors,
        "top_teams_by_overload": top_teams,
        "realized_vs_projected": {
            "projected_savings": projected_savings,
            "realized_savings": realized_savings,
            "capture_rate_pct": round((realized_savings / projected_savings * 100), 2)
            if projected_savings
            else 0.0,
        },
        "recent_cases": list_cases(db, organization_id, sort="newest")[:5],
    }
