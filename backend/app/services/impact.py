from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import DetectorDefinition, DetectorRun, Organization
from app.services.cases import list_cases


def impact_overview(db: Session, organization_id: int) -> dict:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")

    cases = list_cases(db, organization_id, sort="newest")
    detectors = db.scalars(
        select(DetectorDefinition).where(DetectorDefinition.organization_id == organization_id)
    ).all()
    runs = db.scalars(
        select(DetectorRun)
        .where(DetectorRun.organization_id == organization_id)
        .order_by(DetectorRun.created_at.desc())
    ).all()
    latest_runs: dict[int, DetectorRun] = {}
    for run in runs:
        latest_runs.setdefault(run.detector_id, run)

    projected_total = float(sum(run.row_count for run in latest_runs.values()))
    active_presets = sum(1 for detector in detectors if detector.enabled)
    latest_row_count = float(sum(run.row_count for run in latest_runs.values()))
    pending_runs = sum(1 for detector in detectors if detector.enabled and detector.last_run_at is None)

    vendor_rollup: dict[str, float] = defaultdict(float)
    for detector in detectors:
        module_key = detector.module or "General"
        vendor_rollup[module_key] += latest_runs.get(detector.id).row_count if detector.id in latest_runs else 0

    team_rollup: dict[str, int] = defaultdict(int)
    for case in cases:
        if case["team"]:
            team_rollup[case["team"]] += 1

    top_vendors = [
        {
            "vendor": label,
            "risk_score": min(1.0, value / max(latest_row_count, 1.0)),
            "projected_impact": float(value),
        }
        for label, value in sorted(vendor_rollup.items(), key=lambda item: item[1], reverse=True)[:5]
    ]
    top_teams = [
        {
            "team": label,
            "open_items": count,
            "sla_breach_risk": "high" if count >= 3 else "medium" if count >= 1 else "low",
        }
        for label, count in sorted(team_rollup.items(), key=lambda item: item[1], reverse=True)[:5]
    ]
    periods = ["Latest"]
    realized = float(sum(1 for run in latest_runs.values() if run.status == "success"))
    projected = float(len(detectors))
    capture_rate = round((realized / projected) * 100, 2) if projected else 0.0
    return {
        "organization": organization,
        "metrics": [
            {"label": "Connected presets", "value": float(len(detectors)), "delta": None},
            {"label": "Active presets", "value": float(active_presets), "delta": None},
            {"label": "Latest anomaly rows", "value": latest_row_count, "delta": None},
            {"label": "Pending first runs", "value": float(pending_runs), "delta": None},
        ],
        "top_vendors_by_risk": top_vendors,
        "top_teams_by_overload": top_teams,
        "realized_vs_projected": {
            "periods": periods,
            "projected_savings": [projected_total],
            "realized_savings": [realized],
            "capture_rate_pct": capture_rate,
        },
        "recent_cases": cases[:5],
        "approval_execution_funnel": {
            "pending_approval": sum(1 for case in cases if case["approval_state"] == "pending"),
            "approved": sum(1 for case in cases if case["approval_state"] == "approved"),
            "rejected": sum(1 for case in cases if case["approval_state"] == "rejected"),
            "executed": sum(1 for case in cases if case["action_state"] == "executed"),
        },
    }
