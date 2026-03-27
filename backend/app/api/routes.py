from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.domain import Action, Alert, AuditEvent, Organization
from app.schemas.api import (
    AgenticIntakeResultOut,
    ActionDecisionIn,
    ActionRequestOut,
    AlertOut,
    ApprovalIntakeIn,
    AutoModeSettingsOut,
    AutoModeUpdateIn,
    AuditFeedItem,
    CaseDetailOut,
    CaseSummaryOut,
    CreateConnectorIn,
    CreateOrganizationIn,
    DashboardRenderOut,
    DataSourceSummaryOut,
    DataSourceUploadIn,
    DataConnectorOut,
    DashboardOverview,
    DetectorDefinitionCreateIn,
    DetectorDefinitionOut,
    DetectorDraftOut,
    DetectorRunOut,
    DetectorPromptDraftIn,
    DetectorTestOut,
    ImpactOverviewOut,
    InvestigationRequest,
    InvestigationResponse,
    LiveWorkItemOut,
    OrganizationOut,
    RecommendationDecisionIn,
    RelationPreviewOut,
    ReportRequest,
    ResourceOverview,
    SeedResponse,
    SlaExtractionApproveIn,
    SlaExtractionBatchOut,
    SlaExtractionReviewResult,
    SlaExtractionUploadIn,
    SourceAgentMemoryOut,
    SlaRulebookArchiveIn,
    SlaRulebookEntryCreateIn,
    SlaRulebookEntryOut,
    SlaRulebookEntryUpdateIn,
    TicketIntakeIn,
    UpdateConnectorIn,
)
from app.services.action_center import (
    approve_action_request,
    execute_action_request,
    list_action_requests,
    reject_action_request,
)
from app.services.agent_artifacts import persist_connector_artifacts
from app.services.connectors import (
    create_connector,
    get_relation_preview,
    get_source_memory,
    list_connectors,
    list_relation_summaries,
    refresh_connector,
    update_connector,
)
from app.services.organizations import create_organization
from app.services.auto_mode import get_auto_mode_settings, update_auto_mode_settings
from app.services.alerts.detector import scan_organization_alerts
from app.services.cases import get_case_detail, list_cases
from app.services.data_sources import create_data_source
from app.services.dashboard_render import build_dashboard_render_payload, list_detector_run_history
from app.services.dashboard import dashboard_overview, resource_overview
from app.services.detectors import (
    build_prompt_draft,
    create_detector as create_detector_definition,
    list_detectors,
    test_detector,
    update_detector,
)
from app.services.impact import impact_overview
from app.services.agentic_intake import ingest_approval, ingest_ticket
from app.services.live_ops import list_live_ops
from app.services.query.investigator import run_investigation
from app.services.reporting.reporter import generate_pdf_report, list_reports
from app.services.seed.generator import seed_database
from app.services.sla_rulebook import (
    approve_extraction_batch,
    create_extraction_batch,
    create_extraction_batch_from_file,
    discard_extraction_batch,
    discard_extraction_candidate,
    get_extraction_batch,
    list_extraction_batches,
    list_rulebook_entries,
)
from app.services.sla.extraction import contract_pdf_path_for_batch
from app.services.sla.rulebook import archive_rulebook_entry, create_rulebook_entry, update_rulebook_entry
from app.services.workflow.approval import decide_recommendation
from app.utils.logging import get_logger


router = APIRouter(prefix="/api")
logger = get_logger("app.api.connectors")


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


@router.post("/organizations", response_model=OrganizationOut, status_code=201)
def create_organization_route(
    payload: CreateOrganizationIn, db: Session = Depends(get_db)
) -> OrganizationOut:
    try:
        organization = create_organization(db, **payload.model_dump())
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "already exists" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return OrganizationOut.model_validate(organization, from_attributes=True)


@router.get("/impact/{organization_id}", response_model=ImpactOverviewOut)
def get_impact(organization_id: int, db: Session = Depends(get_db)) -> ImpactOverviewOut:
    try:
        payload = impact_overview(db, organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ImpactOverviewOut(
        organization=OrganizationOut.model_validate(payload["organization"], from_attributes=True),
        metrics=payload["metrics"],
        top_vendors_by_risk=payload["top_vendors_by_risk"],
        top_teams_by_overload=payload["top_teams_by_overload"],
        realized_vs_projected=payload["realized_vs_projected"],
        recent_cases=payload["recent_cases"],
        approval_execution_funnel=payload["approval_execution_funnel"],
    )


@router.get("/cases/{organization_id}", response_model=list[CaseSummaryOut])
def get_cases(
    organization_id: int,
    sort: str = "cost_impact",
    severity: str | None = None,
    status: str | None = None,
    module: str | None = None,
    team: str | None = None,
    vendor: str | None = None,
    detector: str | None = None,
    approver: str | None = None,
    action_state: str | None = None,
    db: Session = Depends(get_db),
) -> list[CaseSummaryOut]:
    return [
        CaseSummaryOut.model_validate(item)
        for item in list_cases(
            db,
            organization_id,
            sort=sort,
            severity=severity,
            status=status,
            module=module,
            team=team,
            vendor=vendor,
            detector=detector,
            approver=approver,
            action_state=action_state,
        )
    ]


@router.get("/cases/detail/{case_id}", response_model=CaseDetailOut)
def get_case(case_id: int, db: Session = Depends(get_db)) -> CaseDetailOut:
    try:
        return CaseDetailOut.model_validate(get_case_detail(db, case_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/live-ops/{organization_id}", response_model=list[LiveWorkItemOut])
def get_live_ops(
    organization_id: int,
    status: str | None = None,
    team: str | None = None,
    risk: str | None = None,
    workflow_category: str | None = None,
    sort: str = "deadline",
    db: Session = Depends(get_db),
) -> list[LiveWorkItemOut]:
    return [
        LiveWorkItemOut.model_validate(item)
        for item in list_live_ops(
            db,
            organization_id,
            status=status,
            team=team,
            risk=risk,
            workflow_category=workflow_category,
            sort=sort,
        )
    ]


@router.post("/intake/tickets/{organization_id}", response_model=AgenticIntakeResultOut)
def create_ticket_intake(
    organization_id: int, payload: TicketIntakeIn, db: Session = Depends(get_db)
) -> AgenticIntakeResultOut:
    return AgenticIntakeResultOut.model_validate(
        ingest_ticket(db, organization_id=organization_id, **payload.model_dump())
    )


@router.post("/intake/approvals/{organization_id}", response_model=AgenticIntakeResultOut)
def create_approval_intake(
    organization_id: int, payload: ApprovalIntakeIn, db: Session = Depends(get_db)
) -> AgenticIntakeResultOut:
    return AgenticIntakeResultOut.model_validate(
        ingest_approval(db, organization_id=organization_id, **payload.model_dump())
    )


@router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    from sqlalchemy import delete
    from app.models.domain import Workflow, Alert

    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    db.execute(delete(Alert).where(Alert.workflow_id == workflow_id))
    db.execute(delete(Workflow).where(Workflow.id == workflow_id))
    db.commit()
    return {"message": f"Workflow {workflow_id} deleted"}


@router.get("/connectors/{organization_id}", response_model=list[DataConnectorOut])
def get_connectors(organization_id: int, db: Session = Depends(get_db)) -> list[DataConnectorOut]:
    return [DataConnectorOut.model_validate(item) for item in list_connectors(db, organization_id)]


@router.post("/connectors/{organization_id}", response_model=DataConnectorOut)
def create_connector_route(
    organization_id: int, payload: CreateConnectorIn, db: Session = Depends(get_db)
) -> DataConnectorOut:
    try:
        logger.info("api_connector_create organization_id=%s", organization_id)
        connector = create_connector(
            db,
            organization_id=organization_id,
            name=payload.name,
            uri=payload.uri,
            included_schemas=payload.included_schemas,
        )
        persist_connector_artifacts(db, connector["id"])
        refreshed = next(item for item in list_connectors(db, organization_id) if item["id"] == connector["id"])
        return DataConnectorOut.model_validate(refreshed)
    except ValueError as exc:
        logger.warning("api_connector_create_failed organization_id=%s detail=%s", organization_id, str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/connectors/{connector_id}", response_model=DataConnectorOut)
def update_connector_route(
    connector_id: int, payload: UpdateConnectorIn, db: Session = Depends(get_db)
) -> DataConnectorOut:
    try:
        logger.info("api_connector_update connector_id=%s", connector_id)
        connector = update_connector(
            db,
            connector_id=connector_id,
            name=payload.name,
            uri=payload.uri,
            included_schemas=payload.included_schemas,
        )
        persist_connector_artifacts(db, connector_id)
        return DataConnectorOut.model_validate(connector)
    except ValueError as exc:
        logger.warning("api_connector_update_failed connector_id=%s detail=%s", connector_id, str(exc))
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("api_connector_update_error connector_id=%s error_type=%s", connector_id, exc.__class__.__name__)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/connectors/refresh/{connector_id}", response_model=DataConnectorOut)
def refresh_connector_route(connector_id: int, db: Session = Depends(get_db)) -> DataConnectorOut:
    try:
        logger.info("api_connector_refresh connector_id=%s", connector_id)
        connector = refresh_connector(db, connector_id)
        persist_connector_artifacts(db, connector_id)
        return DataConnectorOut.model_validate(connector)
    except ValueError as exc:
        logger.warning("api_connector_refresh_failed connector_id=%s detail=%s", connector_id, str(exc))
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("api_connector_refresh_error connector_id=%s error_type=%s", connector_id, exc.__class__.__name__)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/data-sources/{organization_id}", response_model=list[DataSourceSummaryOut])
def get_data_sources(
    organization_id: int, db: Session = Depends(get_db)
) -> list[DataSourceSummaryOut]:
    return [
        DataSourceSummaryOut.model_validate(item)
        for item in list_relation_summaries(db, organization_id)
    ]


@router.get("/data-sources/preview/{relation_id}", response_model=RelationPreviewOut)
def get_data_source_preview(relation_id: int, db: Session = Depends(get_db)) -> RelationPreviewOut:
    try:
        return RelationPreviewOut.model_validate(get_relation_preview(db, relation_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/data-sources/memory/{organization_id}", response_model=SourceAgentMemoryOut | None)
def get_data_source_memory(
    organization_id: int, db: Session = Depends(get_db)
) -> SourceAgentMemoryOut | None:
    payload = get_source_memory(db, organization_id)
    return None if payload is None else SourceAgentMemoryOut.model_validate(payload)


@router.post("/data-sources/{organization_id}/upload", response_model=DataSourceSummaryOut)
def upload_data_source(
    organization_id: int, payload: DataSourceUploadIn, db: Session = Depends(get_db)
) -> DataSourceSummaryOut:
    return DataSourceSummaryOut.model_validate(
        create_data_source(db, organization_id=organization_id, **payload.model_dump())
    )


@router.get("/detectors/{organization_id}", response_model=list[DetectorDefinitionOut])
def get_detectors(
    organization_id: int, db: Session = Depends(get_db)
) -> list[DetectorDefinitionOut]:
    return [DetectorDefinitionOut.model_validate(item) for item in list_detectors(db, organization_id)]


@router.post("/detectors/prompt-draft", response_model=DetectorDraftOut)
def draft_detector(payload: DetectorPromptDraftIn) -> DetectorDraftOut:
    return DetectorDraftOut.model_validate(
        build_prompt_draft(payload.organization_id, payload.prompt, payload.module)
    )


@router.post("/detectors/{organization_id}", response_model=DetectorDefinitionOut)
def create_detector(
    organization_id: int, payload: DetectorDefinitionCreateIn, db: Session = Depends(get_db)
) -> DetectorDefinitionOut:
    return DetectorDefinitionOut.model_validate(
        create_detector_definition(db, organization_id, payload.model_dump())
    )


@router.patch("/detectors/{detector_id}", response_model=DetectorDefinitionOut)
def patch_detector(
    detector_id: int, payload: dict, db: Session = Depends(get_db)
) -> DetectorDefinitionOut:
    try:
        return DetectorDefinitionOut.model_validate(update_detector(db, detector_id, payload))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/detectors/{detector_id}/test", response_model=DetectorTestOut)
def run_detector_test(detector_id: int, db: Session = Depends(get_db)) -> DetectorTestOut:
    try:
        return DetectorTestOut.model_validate(test_detector(db, detector_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/detectors/{detector_id}/runs", response_model=list[DetectorRunOut])
def get_detector_runs(detector_id: int, db: Session = Depends(get_db)) -> list[DetectorRunOut]:
    return [DetectorRunOut.model_validate(item) for item in list_detector_run_history(db, detector_id)]


@router.get("/sla/rules/{organization_id}", response_model=list[SlaRulebookEntryOut])
def get_sla_rules(
    organization_id: int,
    status: str | None = None,
    search: str | None = None,
    workflow_category: str | None = None,
    priority: str | None = None,
    business_unit: str | None = None,
    db: Session = Depends(get_db),
) -> list[SlaRulebookEntryOut]:
    return [
        SlaRulebookEntryOut.model_validate(item)
        for item in list_rulebook_entries(
            db,
            organization_id,
            status=status,
            search=search,
            workflow_category=workflow_category,
            priority=priority,
            business_unit=business_unit,
        )
    ]


@router.post("/sla/rules/{organization_id}", response_model=SlaRulebookEntryOut)
def create_sla_rule(
    organization_id: int, payload: SlaRulebookEntryCreateIn, db: Session = Depends(get_db)
) -> SlaRulebookEntryOut:
    return SlaRulebookEntryOut.model_validate(
        create_rulebook_entry(db, organization_id=organization_id, payload=payload.model_dump())
    )


@router.put("/sla/rules/entry/{rule_id}", response_model=SlaRulebookEntryOut)
def update_sla_rule(
    rule_id: int, payload: SlaRulebookEntryUpdateIn, db: Session = Depends(get_db)
) -> SlaRulebookEntryOut:
    try:
        return SlaRulebookEntryOut.model_validate(
            update_rulebook_entry(db, rule_id=rule_id, payload=payload.model_dump(exclude_none=True))
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sla/rules/entry/{rule_id}/archive", response_model=SlaRulebookEntryOut)
def archive_sla_rule(
    rule_id: int, payload: SlaRulebookArchiveIn, db: Session = Depends(get_db)
) -> SlaRulebookEntryOut:
    try:
        return SlaRulebookEntryOut.model_validate(
            archive_rulebook_entry(db, rule_id=rule_id, reviewed_by=payload.reviewed_by)
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/sla/extractions/{organization_id}", response_model=list[SlaExtractionBatchOut])
def get_sla_extractions(
    organization_id: int, db: Session = Depends(get_db)
) -> list[SlaExtractionBatchOut]:
    return [
        SlaExtractionBatchOut.model_validate(item)
        for item in list_extraction_batches(db, organization_id)
    ]


@router.get("/sla/extractions/batch/{batch_id}/contract-pdf")
def get_sla_contract_pdf(batch_id: int, db: Session = Depends(get_db)) -> FileResponse:
    try:
        batch = get_extraction_batch(db, batch_id=batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    path = contract_pdf_path_for_batch(batch.id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Contract PDF not generated for this extraction batch")
    return FileResponse(str(path), media_type="application/pdf", filename=path.name)


@router.post("/sla/extractions/{organization_id}/upload", response_model=SlaExtractionBatchOut)
def upload_sla_extraction(
    organization_id: int, payload: SlaExtractionUploadIn, db: Session = Depends(get_db)
) -> SlaExtractionBatchOut:
    return SlaExtractionBatchOut.model_validate(
        create_extraction_batch(
            db,
            organization_id=organization_id,
            source_document_name=payload.source_document_name,
            document_type=payload.document_type,
            sample_text=payload.sample_text,
        )
    )


@router.post("/sla/extractions/{organization_id}/upload-file", response_model=SlaExtractionBatchOut)
async def upload_sla_extraction_file(
    organization_id: int,
    file: UploadFile = File(...),
    document_type: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> SlaExtractionBatchOut:
    resolved_type = (document_type or Path(file.filename or "").suffix.lstrip(".") or "txt").lower()
    try:
        return SlaExtractionBatchOut.model_validate(
            create_extraction_batch_from_file(
                db,
                organization_id=organization_id,
                source_document_name=file.filename or f"uploaded_document.{resolved_type}",
                document_type=resolved_type,
                file_bytes=await file.read(),
            )
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sla/extractions/{batch_id}/approve", response_model=SlaExtractionReviewResult)
def approve_sla_extraction(
    batch_id: int, payload: SlaExtractionApproveIn, db: Session = Depends(get_db)
) -> SlaExtractionReviewResult:
    try:
        return SlaExtractionReviewResult.model_validate(
            approve_extraction_batch(
                db, batch_id=batch_id, edits=[item.model_dump(exclude_none=True) for item in payload.candidate_rules]
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sla/extractions/{batch_id}/discard", response_model=SlaExtractionReviewResult)
def discard_sla_extraction(batch_id: int, db: Session = Depends(get_db)) -> SlaExtractionReviewResult:
    try:
        return SlaExtractionReviewResult.model_validate(discard_extraction_batch(db, batch_id=batch_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sla/extractions/candidates/{candidate_id}/discard", response_model=SlaExtractionBatchOut)
def discard_sla_extraction_candidate(candidate_id: int, db: Session = Depends(get_db)) -> SlaExtractionBatchOut:
    try:
        return SlaExtractionBatchOut.model_validate(discard_extraction_candidate(db, candidate_id=candidate_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/actions/{organization_id}", response_model=list[ActionRequestOut])
def get_actions(
    organization_id: int, db: Session = Depends(get_db)
) -> list[ActionRequestOut]:
    return [
        ActionRequestOut.model_validate(item)
        for item in list_action_requests(db, organization_id)
    ]


@router.post("/actions/{action_id}/approve", response_model=ActionRequestOut)
def approve_action(
    action_id: int, payload: ActionDecisionIn, db: Session = Depends(get_db)
) -> ActionRequestOut:
    try:
        return ActionRequestOut.model_validate(
            approve_action_request(
                db, action_id=action_id, approver_name=payload.approver_name, notes=payload.notes
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/actions/{action_id}/reject", response_model=ActionRequestOut)
def reject_action(
    action_id: int, payload: ActionDecisionIn, db: Session = Depends(get_db)
) -> ActionRequestOut:
    try:
        return ActionRequestOut.model_validate(
            reject_action_request(
                db, action_id=action_id, approver_name=payload.approver_name, notes=payload.notes
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/auto-mode/{organization_id}", response_model=AutoModeSettingsOut)
def get_auto_mode(organization_id: int, db: Session = Depends(get_db)) -> AutoModeSettingsOut:
    return AutoModeSettingsOut.model_validate(get_auto_mode_settings(db, organization_id))


@router.put("/auto-mode/{organization_id}", response_model=AutoModeSettingsOut)
def update_auto_mode(
    organization_id: int, payload: AutoModeUpdateIn, db: Session = Depends(get_db)
) -> AutoModeSettingsOut:
    return AutoModeSettingsOut.model_validate(
        update_auto_mode_settings(
            db,
            organization_id,
            [item.model_dump(exclude_none=False) for item in payload.policies],
        )
    )


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


@router.get("/dashboard/render/{organization_id}", response_model=DashboardRenderOut)
def get_dashboard_render(
    organization_id: int, db: Session = Depends(get_db)
) -> DashboardRenderOut:
    try:
        payload = build_dashboard_render_payload(db, organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DashboardRenderOut.model_validate(payload)


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


@router.post("/actions/{action_id}/execute", response_model=ActionRequestOut)
def run_action(action_id: int, db: Session = Depends(get_db)) -> ActionRequestOut:
    try:
        return ActionRequestOut.model_validate(execute_action_request(db, action_id=action_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
