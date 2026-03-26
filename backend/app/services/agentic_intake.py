from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Alert, AlertType, Department, Severity, Vendor, Workflow
from app.services.agents import ApprovalSuggestionPayload, get_agent
from app.services.alerts.detector import create_recommendation_bundle
from app.services.auto_mode import get_auto_mode_settings
from app.services.sla.runtime import build_live_work_item, evaluate_runtime_sla


class IntakeClassification(BaseModel):
    workflow_type: str
    workflow_category: str
    issue_type: str
    priority: str
    customer_tier: str
    business_unit: str
    department_name: str
    vendor_name: str | None = None
    suggested_backlog_hours: float
    confidence: float = 0.7
    rationale: list[str] = Field(default_factory=list)


def _severity_from_risk(risk_level: str) -> Severity:
    mapping = {
        "critical": Severity.critical,
        "high": Severity.high,
        "medium": Severity.medium,
        "low": Severity.low,
    }
    return mapping.get(risk_level.lower(), Severity.medium)


def _select_department(
    departments: list[Department], preferred_name: str | None, text: str, *, fallback: str | None = None
) -> Department:
    lowered = text.lower()
    if preferred_name:
        for department in departments:
            if department.name.lower() == preferred_name.lower():
                return department
    for department in departments:
        if department.name.lower() in lowered:
            return department
    if fallback:
        for department in departments:
            if fallback in department.category.lower() or fallback in department.name.lower():
                return department
    return departments[0]


def _select_vendor(vendors: list[Vendor], preferred_name: str | None, text: str) -> Vendor | None:
    lowered = text.lower()
    if preferred_name:
        for vendor in vendors:
            if vendor.name.lower() == preferred_name.lower():
                return vendor
    for vendor in vendors:
        if vendor.name.lower() in lowered:
            return vendor
    return None


def _heuristic_ticket_classification(
    *, departments: list[Department], vendors: list[Vendor], title: str, description: str, department_name: str | None, vendor_name: str | None
) -> IntakeClassification:
    text = f"{title}\n{description}".lower()
    rationale: list[str] = []
    priority = "P1" if any(token in text for token in ("urgent", "sev1", "p1", "outage", "down")) else "standard"
    customer_tier = "premium" if any(token in text for token in ("premium", "vip", "enterprise")) else "standard"
    workflow_type = "support_ticket"
    workflow_category = "support"
    issue_type = "support_ticket"
    business_unit = "support"
    department_fallback = "operations"
    if any(token in text for token in ("vendor", "dispute", "invoice", "reconciliation")):
        workflow_type = "vendor_dispute"
        workflow_category = "finance"
        issue_type = "discrepancy_case"
        business_unit = "procurement"
        department_fallback = "finance"
        rationale.append("Detected vendor or finance discrepancy language.")
    elif any(token in text for token in ("warehouse", "inventory", "putaway")):
        workflow_type = "warehouse_request"
        workflow_category = "warehouse"
        issue_type = "ops_task"
        business_unit = "warehouse"
        department_fallback = "operations"
        rationale.append("Detected warehouse operations language.")
    elif any(token in text for token in ("delivery", "rider", "shipment")):
        workflow_type = "delivery_issue"
        workflow_category = "delivery"
        issue_type = "ops_task"
        business_unit = "delivery"
        department_fallback = "operations"
        rationale.append("Detected delivery support language.")
    else:
        rationale.append("Defaulted to support ticket classification from ticket-like content.")
    if priority == "P1":
        rationale.append("Urgency markers promoted the ticket to P1.")
    if customer_tier == "premium":
        rationale.append("Premium markers enabled premium customer tier matching.")

    department = _select_department(departments, department_name, text, fallback=department_fallback)
    vendor = _select_vendor(vendors, vendor_name, text)
    backlog_hours = 60.0 if priority == "P1" and customer_tier == "premium" else (30.0 if priority == "P1" else 12.0)
    return IntakeClassification(
        workflow_type=workflow_type,
        workflow_category=workflow_category,
        issue_type=issue_type,
        priority=priority,
        customer_tier=customer_tier,
        business_unit=business_unit,
        department_name=department.name,
        vendor_name=vendor.name if vendor else None,
        suggested_backlog_hours=backlog_hours,
        confidence=0.68,
        rationale=rationale,
    )


def _heuristic_approval_classification(
    *, departments: list[Department], vendors: list[Vendor], title: str, description: str, department_name: str | None, vendor_name: str | None
) -> IntakeClassification:
    text = f"{title}\n{description}".lower()
    rationale = ["Defaulted approval intake to approval workflow."]
    workflow_type = "approval_chain"
    workflow_category = "operations"
    issue_type = "ops_task"
    business_unit = "operations"
    department_fallback = "operations"
    if any(token in text for token in ("procure", "po", "vendor", "commercial")):
        workflow_type = "procurement_approval"
        workflow_category = "finance"
        business_unit = "procurement"
        department_fallback = "finance"
        rationale.append("Detected procurement approval language.")
    priority = "P1" if any(token in text for token in ("urgent", "blocker", "today", "immediate")) else "standard"
    customer_tier = "premium" if any(token in text for token in ("premium", "vip", "executive")) else "standard"
    department = _select_department(departments, department_name, text, fallback=department_fallback)
    vendor = _select_vendor(vendors, vendor_name, text)
    backlog_hours = 50.0 if priority == "P1" else 16.0
    return IntakeClassification(
        workflow_type=workflow_type,
        workflow_category=workflow_category,
        issue_type=issue_type,
        priority=priority,
        customer_tier=customer_tier,
        business_unit=business_unit,
        department_name=department.name,
        vendor_name=vendor.name if vendor else None,
        suggested_backlog_hours=backlog_hours,
        confidence=0.66,
        rationale=rationale,
    )


def _classify_with_model(
    *, title: str, description: str, departments: list[Department], vendors: list[Vendor], mode: str
) -> IntakeClassification | None:
    if not settings.cerebras_api_key:
        return None
    from langchain_openai import ChatOpenAI

    model = ChatOpenAI(
        model=settings.cerebras_model,
        api_key=settings.cerebras_api_key,
        base_url=settings.cerebras_base_url,
        temperature=0.1,
    ).with_structured_output(IntakeClassification)
    prompt = (
        f"You classify new {mode} requests for SLA routing.\n"
        "Choose department_name only from the provided list.\n"
        "Choose vendor_name only from the provided list or null.\n"
        "Use workflow_category from: support, operations, finance, delivery, warehouse.\n"
        "Use issue_type from: support_ticket, ops_task, discrepancy_case.\n"
        "Use priority from: P1, standard.\n"
        "Use customer_tier from: premium, standard.\n"
        "Set suggested_backlog_hours high enough only when urgency is explicit.\n\n"
        f"Departments: {[item.name for item in departments]}\n"
        f"Vendors: {[item.name for item in vendors]}\n"
        f"Title: {title}\n"
        f"Description: {description}"
    )
    payload = model.invoke(prompt)
    return payload if isinstance(payload, IntakeClassification) else IntakeClassification.model_validate(payload)


def _evaluate_workflow(db: Session, workflow: Workflow) -> tuple[dict[str, Any], Any]:
    from app.models.domain import SLA, SlaRulebookEntry

    department = db.get(Department, workflow.department_id)
    vendor = db.get(Vendor, workflow.vendor_id) if workflow.vendor_id else None
    rulebook_entries = db.scalars(
        select(SlaRulebookEntry)
        .where(SlaRulebookEntry.organization_id == workflow.organization_id, SlaRulebookEntry.status == "active")
        .order_by(SlaRulebookEntry.rule_version.desc(), SlaRulebookEntry.created_at.desc())
    ).all()
    legacy_sla = db.scalar(
        select(SLA).where(
            SLA.organization_id == workflow.organization_id,
            SLA.department_id == workflow.department_id,
        )
    )
    evaluation = evaluate_runtime_sla(
        item=build_live_work_item(workflow, department, vendor),
        rulebook_entries=rulebook_entries,
        legacy_sla=legacy_sla,
    )
    live_item = {
        "id": workflow.id,
        "item_type": workflow.workflow_type,
        "title": workflow.intake_metadata.get("title") or f"{workflow.workflow_type.replace('_', ' ').title()} work item",
        "team": department.name if department else None,
        "owner_name": evaluation.live_item.owner_name or "Operations Queue Owner",
        "status": workflow.status,
        "current_stage": "escalation" if (evaluation.risk.time_remaining_minutes or 0) <= 0 else "monitoring",
        "assigned_sla_name": evaluation.rule_match.rule_name,
        "response_deadline": evaluation.risk.response_deadline,
        "resolution_deadline": evaluation.risk.resolution_deadline,
        "time_remaining_minutes": evaluation.risk.time_remaining_minutes or 0,
        "predicted_breach_risk": evaluation.risk.predicted_breach_risk or "low",
        "projected_penalty": evaluation.risk.projected_penalty,
        "projected_business_impact": evaluation.risk.projected_business_impact,
        "linked_case_id": None,
        "suggested_action": evaluation.risk.suggested_intervention,
        "match_rationale": evaluation.rule_match.rationale,
        "workflow_category": evaluation.live_item.attributes.get("workflow_category"),
    }
    return live_item, evaluation


def _create_sla_alert_for_workflow(
    db: Session,
    *,
    workflow: Workflow,
    classification: IntakeClassification,
    evaluation: Any,
    title: str,
    description: str,
) -> tuple[int | None, int | None]:
    if evaluation.risk.predicted_breach_risk not in {"high", "critical"}:
        return None, None
    alert = Alert(
        organization_id=workflow.organization_id,
        department_id=workflow.department_id,
        vendor_id=workflow.vendor_id,
        workflow_id=workflow.id,
        type=AlertType.sla_risk,
        severity=_severity_from_risk(evaluation.risk.predicted_breach_risk or "medium"),
        title=f"SLA risk on {title}",
        description=(
            f"{description[:240]} "
            f"Matched SLA {evaluation.rule_match.rule_name or 'unmatched'} with "
            f"{evaluation.risk.predicted_breach_risk} risk."
        ).strip(),
        projected_impact=evaluation.risk.projected_business_impact,
        confidence_score=classification.confidence,
        payload={
            "intake_title": title,
            "classification": classification.model_dump(),
            "matched_sla_name": evaluation.rule_match.rule_name,
            "time_remaining_minutes": evaluation.risk.time_remaining_minutes,
            "risk_level": evaluation.risk.predicted_breach_risk,
        },
    )
    db.add(alert)
    db.flush()
    recommendation, _ = create_recommendation_bundle(
        db,
        alert=alert,
        rationale="New intake item is already close to or past its SLA threshold.",
        action_type="reroute_queue",
    )
    return alert.id, recommendation.id


def ingest_ticket(
    db: Session,
    *,
    organization_id: int,
    title: str,
    description: str,
    department_name: str | None,
    vendor_name: str | None,
    estimated_value: float,
    backlog_hours: float | None,
    status: str,
    region: str,
) -> dict[str, Any]:
    departments = db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    vendors = db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    classification = _classify_with_model(
        title=title, description=description, departments=departments, vendors=vendors, mode="ticket"
    ) or _heuristic_ticket_classification(
        departments=departments,
        vendors=vendors,
        title=title,
        description=description,
        department_name=department_name,
        vendor_name=vendor_name,
    )
    department = _select_department(departments, classification.department_name, title + description)
    vendor = _select_vendor(vendors, classification.vendor_name, title + description)
    workflow = Workflow(
        organization_id=organization_id,
        department_id=department.id,
        vendor_id=vendor.id if vendor else None,
        workflow_type=classification.workflow_type,
        status=status,
        opened_at=datetime.now(UTC),
        expected_by=datetime.now(UTC) + timedelta(hours=max(int(backlog_hours or classification.suggested_backlog_hours), 4)),
        resolved_at=None,
        estimated_value=estimated_value,
        backlog_hours=backlog_hours if backlog_hours is not None else classification.suggested_backlog_hours,
        intake_metadata={
            "title": title,
            "description": description,
            "department": department.name,
            "team": department.name,
            "vendor_name": vendor.name if vendor else None,
            "priority": classification.priority,
            "customer_tier": classification.customer_tier,
            "workflow_category": classification.workflow_category,
            "business_unit": classification.business_unit,
            "issue_type": classification.issue_type,
            "workflow": classification.workflow_type,
            "region": region,
            "source_type": "ticket",
        },
    )
    db.add(workflow)
    db.flush()
    live_item, evaluation = _evaluate_workflow(db, workflow)
    alert_id, recommendation_id = _create_sla_alert_for_workflow(
        db,
        workflow=workflow,
        classification=classification,
        evaluation=evaluation,
        title=title,
        description=description,
    )
    db.commit()
    return {
        "workflow_id": workflow.id,
        "classification": classification.model_dump(),
        "live_item": live_item,
        "alert_id": alert_id,
        "recommendation_id": recommendation_id,
        "approval_preview": None,
    }


def ingest_approval(
    db: Session,
    *,
    organization_id: int,
    title: str,
    description: str,
    requested_action_type: str,
    department_name: str | None,
    vendor_name: str | None,
    estimated_value: float,
    backlog_hours: float | None,
    status: str,
    region: str,
) -> dict[str, Any]:
    departments = db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    vendors = db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    classification = _classify_with_model(
        title=title, description=description, departments=departments, vendors=vendors, mode="approval"
    ) or _heuristic_approval_classification(
        departments=departments,
        vendors=vendors,
        title=title,
        description=description,
        department_name=department_name,
        vendor_name=vendor_name,
    )
    department = _select_department(departments, classification.department_name, title + description)
    vendor = _select_vendor(vendors, classification.vendor_name, title + description)
    workflow = Workflow(
        organization_id=organization_id,
        department_id=department.id,
        vendor_id=vendor.id if vendor else None,
        workflow_type=classification.workflow_type,
        status=status,
        opened_at=datetime.now(UTC),
        expected_by=datetime.now(UTC) + timedelta(hours=max(int(backlog_hours or classification.suggested_backlog_hours), 4)),
        resolved_at=None,
        estimated_value=estimated_value,
        backlog_hours=backlog_hours if backlog_hours is not None else classification.suggested_backlog_hours,
        intake_metadata={
            "title": title,
            "description": description,
            "department": department.name,
            "team": department.name,
            "vendor_name": vendor.name if vendor else None,
            "priority": classification.priority,
            "customer_tier": classification.customer_tier,
            "workflow_category": classification.workflow_category,
            "business_unit": classification.business_unit,
            "issue_type": classification.issue_type,
            "workflow": classification.workflow_type,
            "region": region,
            "source_type": "approval",
            "requested_action_type": requested_action_type,
        },
    )
    db.add(workflow)
    db.flush()
    live_item, evaluation = _evaluate_workflow(db, workflow)
    alert_id, recommendation_id = _create_sla_alert_for_workflow(
        db,
        workflow=workflow,
        classification=classification,
        evaluation=evaluation,
        title=title,
        description=description,
    )
    auto_mode = get_auto_mode_settings(db, organization_id)
    matching_policies = [
        policy for policy in auto_mode["policies"] if policy["enabled"] and requested_action_type in policy["allowed_actions"]
    ]
    approval_preview: ApprovalSuggestionPayload = get_agent().suggest_approval(
        {
            "risk_level": evaluation.risk.predicted_breach_risk,
            "action_type": requested_action_type,
            "allowed_actions": matching_policies[0]["allowed_actions"] if matching_policies else [],
            "default_approver": matching_policies[0]["approver_name"] if matching_policies else "Operations Director",
            "policies": matching_policies,
            "classification": classification.model_dump(),
        }
    )
    db.commit()
    return {
        "workflow_id": workflow.id,
        "classification": classification.model_dump(),
        "live_item": live_item,
        "alert_id": alert_id,
        "recommendation_id": recommendation_id,
        "approval_preview": approval_preview.model_dump(),
    }
