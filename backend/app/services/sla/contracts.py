from datetime import datetime

from pydantic import BaseModel, Field


class AgentRunMetadata(BaseModel):
    provider: str
    model: str
    mode: str = "deterministic_fallback"
    prompt_version: str = "sla-extraction-v1"
    latency_ms: int = 0
    confidence: float = 0.0
    notes: list[str] = Field(default_factory=list)


class DocumentIntake(BaseModel):
    source_document_name: str
    document_type: str
    content_type: str
    file_extension: str | None = None
    extraction_source: str
    raw_text: str | None = None


class BusinessContractDocument(BaseModel):
    executive_summary: str = ""
    service_scope: list[str] = Field(default_factory=list)
    service_level_commitments: list[str] = Field(default_factory=list)
    operational_obligations: list[str] = Field(default_factory=list)
    exclusions_and_assumptions: list[str] = Field(default_factory=list)
    commercial_terms: list[str] = Field(default_factory=list)
    escalation_path: list[str] = Field(default_factory=list)
    approval_and_governance: list[str] = Field(default_factory=list)
    risk_watchouts: list[str] = Field(default_factory=list)


class SlaCandidateContract(BaseModel):
    name: str
    applies_to: dict = Field(default_factory=dict)
    conditions: str
    response_deadline_hours: int
    resolution_deadline_hours: int
    penalty_amount: float
    escalation_owner: str
    escalation_policy: dict = Field(default_factory=dict)
    business_hours_logic: str
    business_hours_definition: dict = Field(default_factory=dict)
    auto_action_allowed: bool = False
    auto_action_policy: dict = Field(default_factory=dict)
    confidence_score: float = 0.0
    parsing_notes: list[str] = Field(default_factory=list)
    extraction_source: str
    business_document: BusinessContractDocument = Field(default_factory=BusinessContractDocument)
    candidate_metadata: dict = Field(default_factory=dict)


class ExtractionOutput(BaseModel):
    intake: DocumentIntake
    candidates: list[SlaCandidateContract]
    run_metadata: AgentRunMetadata


class LiveWorkItemContract(BaseModel):
    id: int
    organization_id: int
    department_id: int | None = None
    department_name: str | None = None
    workflow_type: str
    status: str
    opened_at: datetime
    expected_by: datetime | None = None
    estimated_value: float = 0.0
    backlog_hours: float = 0.0
    attributes: dict = Field(default_factory=dict)
    owner_name: str | None = None


class RuleMatchResult(BaseModel):
    rule_id: int | None = None
    rule_name: str | None = None
    match_score: float = 0.0
    rationale: list[str] = Field(default_factory=list)
    match_source: str = "none"
    response_deadline_hours: int | None = None
    resolution_deadline_hours: int | None = None
    penalty_amount: float = 0.0
    escalation_owner: str | None = None
    auto_action_allowed: bool = False


class RiskEvaluation(BaseModel):
    response_deadline: datetime | None = None
    resolution_deadline: datetime | None = None
    time_remaining_minutes: int | None = None
    predicted_breach_risk: str | None = None
    projected_penalty: float = 0.0
    projected_business_impact: float = 0.0
    suggested_intervention: str


class RuntimeSlaEvaluation(BaseModel):
    live_item: LiveWorkItemContract
    rule_match: RuleMatchResult
    risk: RiskEvaluation
