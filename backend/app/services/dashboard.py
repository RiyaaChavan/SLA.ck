from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Alert, Organization, Report, ResourceSnapshot


def dashboard_overview(db: Session, organization_id: int) -> dict:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")

    alerts = db.scalars(select(Alert).where(Alert.organization_id == organization_id)).all()
    reports = db.scalars(select(Report).where(Report.organization_id == organization_id)).all()
    resources = db.scalars(
        select(ResourceSnapshot).where(ResourceSnapshot.organization_id == organization_id)
    ).all()
    total_exposure = sum(alert.projected_impact for alert in alerts)
    top_alerts = sorted(alerts, key=lambda item: item.projected_impact, reverse=True)[:6]

    mix: dict[str, int] = {}
    for alert in alerts:
        mix[alert.type.value] = mix.get(alert.type.value, 0) + 1

    resource_heatmap = [
        {
            "department_id": resource.department_id,
            "resource_name": resource.resource_name,
            "resource_type": resource.resource_type,
            "utilization_pct": resource.utilization_pct,
            "monthly_cost": resource.monthly_cost,
        }
        for resource in sorted(resources, key=lambda item: item.monthly_cost, reverse=True)[:12]
    ]

    return {
        "organization": organization,
        "metrics": [
            {"label": "Projected exposure", "value": round(total_exposure, 2), "delta": 12.4},
            {"label": "Active alerts", "value": float(len(alerts)), "delta": -4.0},
            {
                "label": "Realizable savings",
                "value": round(total_exposure * 0.63, 2),
                "delta": 7.8,
            },
            {"label": "Reports generated", "value": float(len(reports)), "delta": None},
        ],
        "alert_mix": [{"label": key, "value": value} for key, value in mix.items()],
        "resource_heatmap": resource_heatmap,
        "top_alerts": top_alerts,
        "reports": [
            {
                "id": report.id,
                "title": report.title,
                "status": report.status.value,
                "storage_path": report.storage_path,
            }
            for report in reports[:5]
        ],
    }


def resource_overview(db: Session, organization_id: int) -> dict:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")
    rows = [
        {
            "department_id": snapshot.department_id,
            "resource_name": snapshot.resource_name,
            "resource_type": snapshot.resource_type,
            "utilization_pct": snapshot.utilization_pct,
            "monthly_cost": snapshot.monthly_cost,
            "active_units": snapshot.active_units,
            "provisioned_units": snapshot.provisioned_units,
        }
        for snapshot in db.scalars(
            select(ResourceSnapshot).where(ResourceSnapshot.organization_id == organization_id)
        ).all()
    ]
    return {"organization": organization, "rows": rows}
