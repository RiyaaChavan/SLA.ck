from datetime import datetime

from pydantic import BaseModel


class SeedResponse(BaseModel):
    organizations_created: int
    alerts_created: int
    reports_generated: int


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
