from datetime import datetime

from pydantic import BaseModel, Field


class SeedResponse(BaseModel):
    organizations_created: int
    alerts_created: int
    reports_generated: int


class SyntheticBundleImportIn(BaseModel):
    bundle_name: str | None = "delivra_india"
    bundle_path: str | None = None
    reset: bool = True


class SyntheticBundleImportOut(BaseModel):
    organization_id: int
    organization_name: str
    bundle_dir: str
    departments_created: int
    vendors_created: int
    contracts_created: int
    workflows_created: int
    invoices_created: int
    resource_snapshots_created: int
    source_uploads_created: int
    raw_anomalies_available: int
    alerts_generated: int


class RelationalSourceImportIn(BaseModel):
    database_url: str
    schema_name: str = Field(default="public", validation_alias="schema", serialization_alias="schema")
    reset: bool = True


class RelationalSourceImportOut(BaseModel):
    organization_id: int
    organization_name: str
    source_database: str
    schema_name: str = Field(validation_alias="schema", serialization_alias="schema")
    departments_created: int
    vendors_created: int
    contracts_created: int
    workflows_created: int
    invoices_created: int
    resource_snapshots_created: int
    source_uploads_created: int
    raw_anomalies_available: int
    alerts_generated: int


class OrganizationOut(BaseModel):
    id: int
    name: str
    industry: str
    geography: str


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
    vendor_name: str
    projected_impact: float
    case_count: int


class TopTeamOverloadOut(BaseModel):
    team_name: str
    overload_hours: float
    projected_impact: float


class RealizedProjectedOut(BaseModel):
    projected_savings: float
    realized_savings: float
    capture_rate_pct: float


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
    name: str
    source_type: str
    status: str
    freshness_status: str
    last_synced_at: datetime
    record_count: int
    schema_preview: list[str]
    health: str
    upload_history: list[DataSourceHistoryOut]


class DataSourceUploadIn(BaseModel):
    name: str
    source_type: str
    record_count: int = 0
    file_name: str | None = None
    sample_columns: list[str] = Field(default_factory=list)


class DataSourceConnectIn(BaseModel):
    database_url: str
    schema_name: str = Field(default="public", validation_alias="schema", serialization_alias="schema")
    schema_notes: str | None = None
    reset: bool = True


class DataSourceConnectOut(BaseModel):
    organization_id: int
    organization_name: str
    source_database: str
    schema_name: str = Field(validation_alias="schema", serialization_alias="schema")
    source_uploads_created: int
    alerts_generated: int


class DatasetSummaryOut(BaseModel):
    name: str
    record_count: int
    columns: list[str]
    source_uri: str
    schema_name: str = Field(validation_alias="schema", serialization_alias="schema")


class DatasetPreviewOut(BaseModel):
    name: str
    columns: list[str]
    rows: list[dict]
    row_count: int
    source_uri: str
    schema_name: str = Field(validation_alias="schema", serialization_alias="schema")


class SourceAgentMemoryOut(BaseModel):
    id: int
    status: str
    engine_name: str
    summary_text: str
    dashboard_brief: str
    schema_notes: str | None = None
    memory_path: str | None = None
    context_snapshot: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SavedAnomalyQueryOut(BaseModel):
    id: int
    name: str
    description: str
    sql_text: str
    category: str
    enabled: bool
    created_at: datetime


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


class DetectorDefinitionCreateIn(DetectorDefinitionBase):
    pass


class DetectorDefinitionPatchIn(BaseModel):
    enabled: bool


class DetectorDefinitionOut(DetectorDefinitionBase):
    id: int
    last_triggered_at: datetime | None = None
    issue_count: int = 0


class DetectorPromptDraftIn(BaseModel):
    organization_id: int
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
    candidate_metadata: dict = Field(default_factory=dict)


class SlaExtractionBatchOut(BaseModel):
    id: int
    source_document_name: str
    document_type: str
    status: str
    uploaded_at: datetime
    extraction_source: str
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
