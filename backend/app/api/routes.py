from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.domain import Action, Alert, AuditEvent, Organization
from app.schemas.api import (
    AlertOut,
    AuditFeedItem,
    DashboardOverview,
    InvestigationRequest,
    InvestigationResponse,
    OrganizationOut,
    RecommendationDecisionIn,
    ReportRequest,
    ResourceOverview,
    SeedResponse,
)
from app.services.alerts.detector import scan_organization_alerts
from app.services.dashboard import dashboard_overview, resource_overview
from app.services.query.investigator import run_investigation
from app.services.reporting.reporter import generate_pdf_report, list_reports
from app.services.seed.generator import seed_database
from app.services.workflow.approval import decide_recommendation, execute_action


router = APIRouter(prefix="/api")


@router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/bootstrap/seed", response_model=SeedResponse)
def bootstrap_seed(reset: bool = False, db: Session = Depends(get_db)) -> SeedResponse:
    return SeedResponse.model_validate(seed_database(db, reset=reset))


@router.get("/organizations", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db)) -> list[OrganizationOut]:
    organizations = db.scalars(select(Organization).order_by(Organization.id.asc())).all()
    return [OrganizationOut.model_validate(item, from_attributes=True) for item in organizations]


@router.get("/dashboard/{organization_id}", response_model=DashboardOverview)
def get_dashboard(organization_id: int, db: Session = Depends(get_db)) -> DashboardOverview:
    try:
        payload = dashboard_overview(db, organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DashboardOverview(
        organization=OrganizationOut.model_validate(payload["organization"], from_attributes=True),
        metrics=payload["metrics"],
        alert_mix=payload["alert_mix"],
        resource_heatmap=payload["resource_heatmap"],
        top_alerts=[
            AlertOut(
                id=alert.id,
                organization_id=alert.organization_id,
                title=alert.title,
                description=alert.description,
                type=alert.type.value,
                severity=alert.severity.value,
                status=alert.status.value,
                projected_impact=alert.projected_impact,
                confidence_score=alert.confidence_score,
                created_at=alert.created_at,
                recommendation_id=alert.recommendations[0].id if alert.recommendations else None,
                action_id=None,
            )
            for alert in payload["top_alerts"]
        ],
        reports=payload["reports"],
    )


@router.get("/alerts/{organization_id}", response_model=list[AlertOut])
def list_alerts(organization_id: int, db: Session = Depends(get_db)) -> list[AlertOut]:
    alerts = db.scalars(
        select(Alert).where(Alert.organization_id == organization_id).order_by(Alert.id.desc())
    ).all()
    results: list[AlertOut] = []
    for alert in alerts:
        action_id = None
        recommendation_id = None
        if alert.recommendations:
            recommendation_id = alert.recommendations[0].id
            action = db.scalar(
                select(Action).where(Action.recommendation_id == recommendation_id).order_by(Action.id.desc())
            )
            action_id = action.id if action else None
        results.append(
            AlertOut(
                id=alert.id,
                organization_id=alert.organization_id,
                title=alert.title,
                description=alert.description,
                type=alert.type.value,
                severity=alert.severity.value,
                status=alert.status.value,
                projected_impact=alert.projected_impact,
                confidence_score=alert.confidence_score,
                created_at=alert.created_at,
                recommendation_id=recommendation_id,
                action_id=action_id,
            )
        )
    return results


@router.post("/alerts/{organization_id}/scan", response_model=list[AlertOut])
def rescan_alerts(organization_id: int, db: Session = Depends(get_db)) -> list[AlertOut]:
    scan_organization_alerts(db, organization_id)
    return list_alerts(organization_id, db)


@router.get("/resources/{organization_id}", response_model=ResourceOverview)
def get_resources(organization_id: int, db: Session = Depends(get_db)) -> ResourceOverview:
    try:
        payload = resource_overview(db, organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ResourceOverview(
        organization=OrganizationOut.model_validate(payload["organization"], from_attributes=True),
        rows=payload["rows"],
    )


@router.get("/audit/{organization_id}", response_model=list[AuditFeedItem])
def get_audit_feed(organization_id: int, db: Session = Depends(get_db)) -> list[AuditFeedItem]:
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.organization_id == organization_id).order_by(AuditEvent.id.desc())
    ).all()
    return [AuditFeedItem.model_validate(item, from_attributes=True) for item in events[:40]]


@router.post("/investigate/preview", response_model=InvestigationResponse)
def preview_investigation(
    payload: InvestigationRequest, db: Session = Depends(get_db)
) -> InvestigationResponse:
    return InvestigationResponse.model_validate(run_investigation(db, **payload.model_dump()))


@router.post("/investigate/query", response_model=InvestigationResponse)
def execute_investigation(
    payload: InvestigationRequest, db: Session = Depends(get_db)
) -> InvestigationResponse:
    return InvestigationResponse.model_validate(run_investigation(db, **payload.model_dump()))


@router.post("/recommendations/{recommendation_id}/approve")
def approve_recommendation(
    recommendation_id: int,
    payload: RecommendationDecisionIn,
    db: Session = Depends(get_db),
) -> dict:
    try:
        recommendation = decide_recommendation(
            db,
            recommendation_id=recommendation_id,
            approver_name=payload.approver_name,
            approved=True,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"recommendation_id": recommendation.id, "status": "approved"}


@router.post("/recommendations/{recommendation_id}/reject")
def reject_recommendation(
    recommendation_id: int,
    payload: RecommendationDecisionIn,
    db: Session = Depends(get_db),
) -> dict:
    try:
        recommendation = decide_recommendation(
            db,
            recommendation_id=recommendation_id,
            approver_name=payload.approver_name,
            approved=False,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"recommendation_id": recommendation.id, "status": "rejected"}


@router.post("/actions/{action_id}/execute")
def run_action(action_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        action = execute_action(db, action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"action_id": action.id, "status": action.status.value, "summary": action.result_summary}


@router.post("/reports/generate")
def create_report(payload: ReportRequest, db: Session = Depends(get_db)) -> dict:
    try:
        report = generate_pdf_report(db, organization_id=payload.organization_id, title=payload.title)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"report_id": report.id, "status": report.status.value, "storage_path": report.storage_path}


@router.get("/reports/{organization_id}")
def get_reports(organization_id: int, db: Session = Depends(get_db)) -> list[dict]:
    reports = list_reports(db, organization_id)
    return [
        {
            "id": report.id,
            "title": report.title,
            "status": report.status.value,
            "storage_path": report.storage_path,
            "summary": report.summary,
        }
        for report in reports
    ]
