from datetime import datetime

from pydantic import BaseModel, Field


class SeedResponse(BaseModel):
    organizations_created: int
    alerts_created: int
    reports_generated: int


class OrganizationOut(BaseModel):
    id: int
    name: str
    industry: str
    geography: str


class CreateOrganizationIn(BaseModel):
    name: str = Field(min_length=1)
    industry: str = Field(min_length=1)
    geography: str = Field(min_length=1)


class AlertOut(BaseModel):
    id: int
    organization_id: int
    title: str
    description: str
    type: str
    severity: str
    status: str
    projected_impact: float
    confidence_score: float
    created_at: datetime
    recommendation_id: int | None = None
    action_id: int | None = None


class RecommendationDecisionIn(BaseModel):
    approver_name: str
    notes: str | None = None


class InvestigationRequest(BaseModel):
    organization_id: int
    question: str


class InvestigationResponse(BaseModel):
    query_label: str
    sql: str
    rows: list[dict]
    explanation: str


class ReportRequest(BaseModel):
    organization_id: int
    title: str


class DashboardMetric(BaseModel):
    label: str
    value: float
    delta: float | None = None


class DashboardOverview(BaseModel):
    organization: OrganizationOut
    metrics: list[DashboardMetric]
    alert_mix: list[dict]
    resource_heatmap: list[dict]
    top_alerts: list[AlertOut]
    reports: list[dict]


class ResourceOverview(BaseModel):
    organization: OrganizationOut
    rows: list[dict]


class AuditFeedItem(BaseModel):
    id: int
    event_type: str
    entity_type: str
    entity_id: int
    created_at: datetime
    payload: dict


class TopVendorRiskOut(BaseModel):
    vendor: str
    risk_score: float
    projected_impact: float


class TopTeamOverloadOut(BaseModel):
    team: str
    open_items: int
    sla_breach_risk: str


class RealizedProjectedOut(BaseModel):
    periods: list[str]
    projected_savings: list[float]
    realized_savings: list[float]
    capture_rate_pct: float


class ApprovalExecutionFunnelOut(BaseModel):
    pending_approval: int
    approved: int
    rejected: int
    executed: int


class CaseSummaryOut(BaseModel):
    id: int
    organization_id: int
    module: str
    title: str
    summary: str
    case_type: str
    severity: str
    status: str
    team: str | None = None
    vendor: str | None = None
    detector_name: str
    owner_name: str
    approver_name: str | None = None
    projected_impact: float
    realized_impact: float | None = None
    approval_state: str
    action_state: str
    sla_countdown_minutes: int | None = None
    sla_risk_level: str | None = None
    recommended_action_label: str | None = None
    created_at: datetime
    updated_at: datetime


class ImpactOverviewOut(BaseModel):
    organization: OrganizationOut
    metrics: list[DashboardMetric]
    top_vendors_by_risk: list[TopVendorRiskOut]
    top_teams_by_overload: list[TopTeamOverloadOut]
    realized_vs_projected: RealizedProjectedOut
    recent_cases: list[CaseSummaryOut]
    approval_execution_funnel: ApprovalExecutionFunnelOut


class CaseEvidenceOut(BaseModel):
    label: str
    value: str | float | int | bool | None
    source: str


class RelatedEntityOut(BaseModel):
    entity_type: str
    entity_id: int | None = None
    label: str


class CaseSlaOut(BaseModel):
    name: str
    response_deadline_hours: int | None = None
    resolution_deadline_hours: int | None = None
    penalty_amount: float
    countdown_minutes: int | None = None
    risk_level: str | None = None
    match_rationale: list[str] = Field(default_factory=list)


class CaseFinancialImpactOut(BaseModel):
    projected_impact: float
    realized_impact: float | None = None
    estimated_savings: float
    avoided_loss: float
    confidence: float
    currency: str = "INR"


class CaseFormulaOut(BaseModel):
    expression: str
    description: str
    assumptions: list[str]
    confidence: float


class RecommendedActionOut(BaseModel):
    title: str
    rationale: str
    action_type: str | None = None
    approval_state: str
    execution_state: str
    expected_savings: float
    required_approver: str
    evidence_pack_summary: list[str]


class ApprovalStepOut(BaseModel):
    approver_name: str
    decision: str
    notes: str | None = None
    decided_at: datetime | None = None


class TimelineEventOut(BaseModel):
    event_type: str
    title: str
    created_at: datetime
    payload: dict = Field(default_factory=dict)


class CaseDetailOut(BaseModel):
    id: int
    organization_id: int
    module: str
    title: str
    summary: str
    why_flagged: str
    root_cause: str
    baseline_comparison: str
    evidence: list[CaseEvidenceOut]
    related_entities: list[RelatedEntityOut]
    sla: CaseSlaOut | None = None
    financial_impact: CaseFinancialImpactOut
    formula: CaseFormulaOut
    recommended_action: RecommendedActionOut
    approval_chain: list[ApprovalStepOut]
    timeline: list[TimelineEventOut]
    created_at: datetime
    updated_at: datetime


class LiveWorkItemOut(BaseModel):
    id: int
    item_type: str
    title: str
    team: str | None = None
    owner_name: str
    status: str
    current_stage: str
    assigned_sla_name: str | None = None
    response_deadline: datetime | None = None
    resolution_deadline: datetime | None = None
    time_remaining_minutes: int
    predicted_breach_risk: str
    projected_penalty: float
    projected_business_impact: float = 0.0
    linked_case_id: int | None = None
    suggested_action: str
    match_rationale: list[str] = Field(default_factory=list)
    workflow_category: str | None = None


class DataSourceHistoryOut(BaseModel):
    uploaded_at: datetime
    record_count: int
    file_path: str


class DataSourceSummaryOut(BaseModel):
    id: int
    connector_id: int
    name: str
    schema: str
    qualified_name: str
    source_type: str
    status: str
    freshness_status: str
    last_synced_at: datetime
    record_count: int
    schema_preview: list[str]
    health: str
    upload_history: list[DataSourceHistoryOut]
    size_bytes: int = 0
    preview_row_count: int = 0


class CreateConnectorIn(BaseModel):
    name: str = Field(min_length=1)
    uri: str = Field(min_length=1)
    included_schemas: list[str] = Field(default_factory=lambda: ["public"])


class UpdateConnectorIn(BaseModel):
    name: str | None = None
    uri: str | None = None
    included_schemas: list[str] | None = None


class DataConnectorOut(BaseModel):
    id: int
    organization_id: int
    name: str
    dialect: str
    status: str
    last_sync_at: datetime | None = None
    last_error: str | None = None
    included_schemas: list[str] = Field(default_factory=list)


class RelationPreviewOut(BaseModel):
    id: int
    name: str
    schema: str
    source_uri: str
    row_count: int
    columns: list[str]
    rows: list[dict]
    column_stats: dict = Field(default_factory=dict)
    relation_type: str


class SourceAgentMemoryOut(BaseModel):
    id: int
    organization_id: int
    connector_id: int
    status: str
    engine_name: str
    summary_text: str
    dashboard_brief: str
    schema_notes: str
    raw_payload: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ArtifactEventIn(BaseModel):
    connector_id: int
    kind: str
    message: str
    stage: str | None = None
    agent: str | None = None
    status: str | None = None
    level: str = "info"
    detail: dict = Field(default_factory=dict)


class DataSourceUploadIn(BaseModel):
    name: str
    source_type: str
    record_count: int = 0
    file_name: str | None = None
    sample_columns: list[str] = Field(default_factory=list)


class DetectorDefinitionBase(BaseModel):
    detector_key: str | None = None
    name: str
    description: str
    module: str
    business_domain: str
    severity: str
    owner_name: str
    enabled: bool = True
    logic_type: str
    logic_summary: str
    query_logic: str
    expected_output_fields: list[str] = Field(default_factory=list)
    linked_action_template: str
    linked_cost_formula: str
    schedule_minutes: int = 60


class DetectorDefinitionCreateIn(DetectorDefinitionBase):
    connector_id: int | None = None


class DetectorDefinitionOut(DetectorDefinitionBase):
    id: int
    connector_id: int | None = None
    generation_source: str = "manual"
    validation_status: str = "pending"
    last_triggered_at: datetime | None = None
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    issue_count: int = 0


class DetectorPromptDraftIn(BaseModel):
    organization_id: int = 0
    prompt: str
    module: str | None = None


class DetectorDraftOut(DetectorDefinitionBase):
    draft_source: str
    warnings: list[str] = Field(default_factory=list)


class DetectorTestOut(BaseModel):
    detector_id: int
    detector_name: str
    issue_count: int
    sample_rows: list[dict] = Field(default_factory=list)
    explanation: str


class DetectorRunOut(BaseModel):
    id: int
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    row_count: int
    sample_rows: list[dict] = Field(default_factory=list)
    summary: str
    error: str | None = None


class SlaRulebookEntryOut(BaseModel):
    id: int
    name: str
    status: str
    applies_to: dict
    conditions: str
    response_deadline_hours: int
    resolution_deadline_hours: int
    penalty_amount: float
    escalation_owner: str
    escalation_policy: dict = Field(default_factory=dict)
    business_hours_logic: str
    business_hours_definition: dict = Field(default_factory=dict)
    auto_action_allowed: bool
    auto_action_policy: dict = Field(default_factory=dict)
    source_document_name: str
    rule_version: int = 1
    reviewed_by: str | None = None
    review_notes: str | None = None
    last_reviewed_at: datetime | None = None
    supersedes_rule_id: int | None = None
    source_batch_id: int | None = None


class SlaRulebookEntryBaseIn(BaseModel):
    name: str
    status: str = "draft"
    applies_to: dict = Field(default_factory=dict)
    conditions: str
    response_deadline_hours: int
    resolution_deadline_hours: int
    penalty_amount: float = 0.0
    escalation_owner: str
    escalation_policy: dict = Field(default_factory=dict)
    business_hours_logic: str = "business_hours"
    business_hours_definition: dict = Field(default_factory=dict)
    auto_action_allowed: bool = False
    auto_action_policy: dict = Field(default_factory=dict)
    source_document_name: str = "manual_rule"
    reviewed_by: str | None = None
    review_notes: str | None = None
    supersedes_rule_id: int | None = None
    source_batch_id: int | None = None


class SlaRulebookEntryCreateIn(SlaRulebookEntryBaseIn):
    pass


class SlaRulebookEntryUpdateIn(BaseModel):
    name: str | None = None
    status: str | None = None
    applies_to: dict | None = None
    conditions: str | None = None
    response_deadline_hours: int | None = None
    resolution_deadline_hours: int | None = None
    penalty_amount: float | None = None
    escalation_owner: str | None = None
    escalation_policy: dict | None = None
    business_hours_logic: str | None = None
    business_hours_definition: dict | None = None
    auto_action_allowed: bool | None = None
    auto_action_policy: dict | None = None
    source_document_name: str | None = None
    reviewed_by: str | None = None
    review_notes: str | None = None
    supersedes_rule_id: int | None = None


class SlaRulebookArchiveIn(BaseModel):
    reviewed_by: str | None = None


class BusinessContractDocumentOut(BaseModel):
    executive_summary: str = ""
    service_scope: list[str] = Field(default_factory=list)
    service_level_commitments: list[str] = Field(default_factory=list)
    operational_obligations: list[str] = Field(default_factory=list)
    exclusions_and_assumptions: list[str] = Field(default_factory=list)
    commercial_terms: list[str] = Field(default_factory=list)
    escalation_path: list[str] = Field(default_factory=list)
    approval_and_governance: list[str] = Field(default_factory=list)
    risk_watchouts: list[str] = Field(default_factory=list)


class SlaExtractionCandidateOut(BaseModel):
    id: int
    name: str
    applies_to: dict
    conditions: str
    response_deadline_hours: int
    resolution_deadline_hours: int
    penalty_amount: float
    escalation_owner: str
    escalation_policy: dict = Field(default_factory=dict)
    business_hours_logic: str
    business_hours_definition: dict = Field(default_factory=dict)
    auto_action_allowed: bool
    auto_action_policy: dict = Field(default_factory=dict)
    status: str
    confidence_score: float = 0.0
    parsing_notes: list[str] = Field(default_factory=list)
    extraction_source: str
    business_document: BusinessContractDocumentOut = Field(default_factory=BusinessContractDocumentOut)
    candidate_metadata: dict = Field(default_factory=dict)


class SlaExtractionBatchOut(BaseModel):
    id: int
    source_document_name: str
    document_type: str
    status: str
    uploaded_at: datetime
    extraction_source: str
    contract_pdf_path: str | None = None
    run_metadata: dict = Field(default_factory=dict)
    candidate_rules: list[SlaExtractionCandidateOut]


class SlaExtractionUploadIn(BaseModel):
    source_document_name: str
    document_type: str = "pdf"
    sample_text: str | None = None


class SlaExtractionCandidateEditIn(BaseModel):
    id: int
    name: str | None = None
    applies_to: dict | None = None
    conditions: str | None = None
    response_deadline_hours: int | None = None
    resolution_deadline_hours: int | None = None
    penalty_amount: float | None = None
    escalation_owner: str | None = None
    escalation_policy: dict | None = None
    business_hours_logic: str | None = None
    business_hours_definition: dict | None = None
    auto_action_allowed: bool | None = None
    auto_action_policy: dict | None = None


class SlaExtractionApproveIn(BaseModel):
    candidate_rules: list[SlaExtractionCandidateEditIn] = Field(default_factory=list)


class SlaExtractionReviewResult(BaseModel):
    batch_id: int
    status: str
    rules_created: int = 0


class ActionRequestOut(BaseModel):
    id: int
    case_id: int
    title: str
    recommended_next_step: str
    rationale: str
    expected_savings: float
    avoided_loss: float
    risk_level: str
    required_approver: str
    evidence_pack_summary: list[str]
    approval_state: str
    execution_state: str
    created_at: datetime
    updated_at: datetime
    recommendation_id: int | None = None
    alert_title: str | None = None
    alert_type: str | None = None
    action_type: str | None = None


class ActionDecisionIn(BaseModel):
    approver_name: str
    notes: str | None = None


class AutoModePolicyOut(BaseModel):
    id: int
    name: str
    module: str
    scope: str
    risk_level: str
    enabled: bool
    approver_name: str
    allowed_actions: list[str]
    condition_summary: str
    expires_at: datetime | None = None


class AutoModeSettingsOut(BaseModel):
    organization_id: int
    policies: list[AutoModePolicyOut]


class AutoModePolicyUpdateIn(BaseModel):
    id: int
    enabled: bool | None = None
    approver_name: str | None = None
    condition_summary: str | None = None
    expires_at: datetime | None = None


class AutoModeUpdateIn(BaseModel):
    policies: list[AutoModePolicyUpdateIn]


class AgenticClassificationOut(BaseModel):
    workflow_type: str
    workflow_category: str
    issue_type: str
    priority: str
    customer_tier: str
    business_unit: str
    department_name: str
    vendor_name: str | None = None
    suggested_backlog_hours: float
    inferred_estimated_value: float
    risk_flags: list[str] = Field(default_factory=list)
    detected_sla_signals: list[str] = Field(default_factory=list)
    should_raise_alert: bool = False
    confidence: float
    rationale: list[str] = Field(default_factory=list)


class TicketIntakeIn(BaseModel):
    title: str
    description: str
    department_name: str | None = None
    vendor_name: str | None = None
    estimated_value: float | None = None
    backlog_hours: float | None = None
    status: str = "open"
    region: str = "default"


class ApprovalIntakeIn(BaseModel):
    title: str
    description: str
    requested_action_type: str = "open_review_task"
    department_name: str | None = None
    vendor_name: str | None = None
    estimated_value: float | None = None
    backlog_hours: float | None = None
    status: str = "open"
    region: str = "default"


class AgenticApprovalPreviewOut(BaseModel):
    should_auto_approve: bool
    recommended_approver: str
    reasoning: str
    confidence: float
    metadata: dict = Field(default_factory=dict)


class AgenticIntakeResultOut(BaseModel):
    workflow_id: int
    classification: AgenticClassificationOut
    live_item: LiveWorkItemOut
    alert_id: int | None = None
    recommendation_id: int | None = None
    approval_preview: AgenticApprovalPreviewOut | None = None


class DashboardWidgetOut(BaseModel):
    kind: str
    title: str
    empty_copy: str = ""
    items: list[dict] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)


class DashboardRenderOut(BaseModel):
    organization: OrganizationOut
    title: str
    subtitle: str
    metrics: list[DashboardMetric] = Field(default_factory=list)
    widgets: list[DashboardWidgetOut] = Field(default_factory=list)
