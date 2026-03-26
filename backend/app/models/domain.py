import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AlertType(str, enum.Enum):
    duplicate_spend = "duplicate_spend"
    rate_mismatch = "rate_mismatch"
    sla_risk = "sla_risk"
    resource_overload = "resource_overload"
    resource_waste = "resource_waste"
    vendor_discrepancy = "vendor_discrepancy"


class Severity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    open = "open"
    approved = "approved"
    rejected = "rejected"
    actioned = "actioned"


class ApprovalDecision(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ActionStatus(str, enum.Enum):
    pending = "pending"
    executed = "executed"
    skipped = "skipped"


class ReportStatus(str, enum.Enum):
    queued = "queued"
    generated = "generated"


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    industry: Mapped[str] = mapped_column(String(120))
    geography: Mapped[str] = mapped_column(String(80))

    departments: Mapped[list["Department"]] = relationship(back_populates="organization")
    vendors: Mapped[list["Vendor"]] = relationship(back_populates="organization")
    workflows: Mapped[list["Workflow"]] = relationship(back_populates="organization")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="organization")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="organization")


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(80))
    capacity_score: Mapped[int] = mapped_column(Integer, default=100)

    organization: Mapped["Organization"] = relationship(back_populates="departments")


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    risk_rating: Mapped[float] = mapped_column(Float, default=0.0)

    organization: Mapped["Organization"] = relationship(back_populates="vendors")


class Contract(Base, TimestampMixin):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    service_unit: Mapped[str] = mapped_column(String(60))
    contracted_rate: Mapped[float] = mapped_column(Float)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SLA(Base, TimestampMixin):
    __tablename__ = "slas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    name: Mapped[str] = mapped_column(String(120))
    target_hours: Mapped[int] = mapped_column(Integer)
    penalty_per_breach: Mapped[float] = mapped_column(Float)


class Workflow(Base, TimestampMixin):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)
    workflow_type: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expected_by: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_value: Mapped[float] = mapped_column(Float)
    backlog_hours: Mapped[float] = mapped_column(Float)

    organization: Mapped["Organization"] = relationship(back_populates="workflows")


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id"))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    invoice_ref: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float)
    billed_units: Mapped[int] = mapped_column(Integer)
    delivered_units: Mapped[int] = mapped_column(Integer)
    billed_rate: Mapped[float] = mapped_column(Float)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40))

    organization: Mapped["Organization"] = relationship(back_populates="invoices")


class ResourceSnapshot(Base, TimestampMixin):
    __tablename__ = "resource_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    resource_type: Mapped[str] = mapped_column(String(80))
    resource_name: Mapped[str] = mapped_column(String(120))
    utilization_pct: Mapped[float] = mapped_column(Float)
    active_units: Mapped[int] = mapped_column(Integer)
    provisioned_units: Mapped[int] = mapped_column(Integer)
    monthly_cost: Mapped[float] = mapped_column(Float)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SchemaMapping(Base, TimestampMixin):
    __tablename__ = "schema_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    source_name: Mapped[str] = mapped_column(String(120))
    source_type: Mapped[str] = mapped_column(String(40))
    raw_schema: Mapped[dict] = mapped_column(JSON)
    mapped_schema: Mapped[dict] = mapped_column(JSON)
    confidence_score: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(40))


class SourceUpload(Base, TimestampMixin):
    __tablename__ = "source_uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(120))
    source_kind: Mapped[str] = mapped_column(String(40))
    record_count: Mapped[int] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String(255))


class DetectorDefinition(Base, TimestampMixin):
    __tablename__ = "detector_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    detector_key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    module: Mapped[str] = mapped_column(String(80))
    business_domain: Mapped[str] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(20))
    owner_name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    logic_type: Mapped[str] = mapped_column(String(40))
    logic_summary: Mapped[str] = mapped_column(Text)
    query_logic: Mapped[str] = mapped_column(Text)
    expected_output_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    linked_action_template: Mapped[str] = mapped_column(Text)
    linked_cost_formula: Mapped[str] = mapped_column(Text)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issue_count: Mapped[int] = mapped_column(Integer, default=0)


class SlaRulebookEntry(Base, TimestampMixin):
    __tablename__ = "sla_rulebook_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(40), default="active")
    applies_to: Mapped[dict] = mapped_column(JSON, default=dict)
    conditions: Mapped[str] = mapped_column(Text)
    response_deadline_hours: Mapped[int] = mapped_column(Integer)
    resolution_deadline_hours: Mapped[int] = mapped_column(Integer)
    penalty_amount: Mapped[float] = mapped_column(Float)
    escalation_owner: Mapped[str] = mapped_column(String(120))
    escalation_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    business_hours_logic: Mapped[str] = mapped_column(String(120))
    business_hours_definition: Mapped[dict] = mapped_column(JSON, default=dict)
    auto_action_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_action_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    source_document_name: Mapped[str] = mapped_column(String(160))
    source_batch_id: Mapped[int | None] = mapped_column(ForeignKey("sla_extraction_batches.id"), nullable=True)
    rule_version: Mapped[int] = mapped_column(Integer, default=1)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    supersedes_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("sla_rulebook_entries.id"), nullable=True
    )
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SlaExtractionBatch(Base, TimestampMixin):
    __tablename__ = "sla_extraction_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    source_document_name: Mapped[str] = mapped_column(String(160))
    document_type: Mapped[str] = mapped_column(String(40), default="pdf")
    status: Mapped[str] = mapped_column(String(40), default="pending_review")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    extraction_source: Mapped[str] = mapped_column(String(80), default="text_parsed")
    run_metadata: Mapped[dict] = mapped_column(JSON, default=dict)

    candidates: Mapped[list["SlaExtractionCandidate"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )


class SlaExtractionCandidate(Base, TimestampMixin):
    __tablename__ = "sla_extraction_candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("sla_extraction_batches.id"))
    name: Mapped[str] = mapped_column(String(160))
    applies_to: Mapped[dict] = mapped_column(JSON, default=dict)
    conditions: Mapped[str] = mapped_column(Text)
    response_deadline_hours: Mapped[int] = mapped_column(Integer)
    resolution_deadline_hours: Mapped[int] = mapped_column(Integer)
    penalty_amount: Mapped[float] = mapped_column(Float)
    escalation_owner: Mapped[str] = mapped_column(String(120))
    escalation_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    business_hours_logic: Mapped[str] = mapped_column(String(120))
    business_hours_definition: Mapped[dict] = mapped_column(JSON, default=dict)
    auto_action_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_action_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="pending")
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    parsing_notes: Mapped[list[str]] = mapped_column(JSON, default=list)
    extraction_source: Mapped[str] = mapped_column(String(80), default="text_parsed")
    candidate_metadata: Mapped[dict] = mapped_column(JSON, default=dict)

    batch: Mapped["SlaExtractionBatch"] = relationship(back_populates="candidates")


class ApprovalPolicy(Base, TimestampMixin):
    __tablename__ = "approval_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(160))
    module: Mapped[str] = mapped_column(String(80))
    scope: Mapped[str] = mapped_column(String(120))
    risk_level: Mapped[str] = mapped_column(String(20))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    approver_name: Mapped[str] = mapped_column(String(120))
    allowed_actions: Mapped[list[str]] = mapped_column(JSON, default=list)
    condition_summary: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Alert(Base, TimestampMixin):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)
    workflow_id: Mapped[int | None] = mapped_column(ForeignKey("workflows.id"), nullable=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    resource_snapshot_id: Mapped[int | None] = mapped_column(
        ForeignKey("resource_snapshots.id"), nullable=True
    )
    type: Mapped[AlertType] = mapped_column(Enum(AlertType))
    severity: Mapped[Severity] = mapped_column(Enum(Severity))
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.open)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    projected_impact: Mapped[float] = mapped_column(Float, default=0.0)
    realized_impact: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    organization: Mapped["Organization"] = relationship(back_populates="alerts")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="alert")


class Recommendation(Base, TimestampMixin):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"))
    category: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255))
    rationale: Mapped[str] = mapped_column(Text)
    playbook: Mapped[dict] = mapped_column(JSON, default=dict)

    alert: Mapped["Alert"] = relationship(back_populates="recommendations")


class Approval(Base, TimestampMixin):
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"))
    approver_name: Mapped[str] = mapped_column(String(120))
    decision: Mapped[ApprovalDecision] = mapped_column(
        Enum(ApprovalDecision), default=ApprovalDecision.pending
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Action(Base, TimestampMixin):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"))
    action_type: Mapped[str] = mapped_column(String(80))
    status: Mapped[ActionStatus] = mapped_column(Enum(ActionStatus), default=ActionStatus.pending)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    title: Mapped[str] = mapped_column(String(200))
    report_type: Mapped[str] = mapped_column(String(80))
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.queued)
    storage_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
