from datetime import UTC, datetime, timedelta
import re
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
    inferred_estimated_value: float
    risk_flags: list[str] = Field(default_factory=list)
    detected_sla_signals: list[str] = Field(default_factory=list)
    should_raise_alert: bool = False
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


_CURRENCY_PATTERN = re.compile(
    r"(?P<prefix>₹|rs\.?|inr|\$)?\s*(?P<amount>\d+(?:[,\d]*\d)?(?:\.\d+)?)\s*(?P<suffix>cr|crore|lakh|lakhs|k|m)?",
    re.IGNORECASE,
)
_TIME_PATTERN = re.compile(
    r"(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>min|mins|minute|minutes|hour|hours|hr|hrs|day|days)\b",
    re.IGNORECASE,
)

_DELIVERY_TOKENS = (
    "delivery",
    "pickup",
    "pick-up",
    "rider",
    "shipment",
    "dispatch",
    "fleet",
    "hub",
    "dark store",
    "last mile",
    "last-mile",
    "drop",
    "courier",
)

_FINANCE_DISPUTE_TOKENS = (
    "invoice",
    "reconciliation",
    "payment",
    "billing",
    "overbilling",
    "rate mismatch",
    "commercial dispute",
    "vendor dispute",
    "purchase order",
    "accounts payable",
)


def _hours_from_text(value: float, unit: str) -> float:
    lowered = unit.lower()
    if lowered.startswith("min"):
        return value / 60.0
    if lowered.startswith("day"):
        return value * 24.0
    return value


def _extract_sla_signals(text: str, mode: str) -> tuple[list[str], float | None]:
    signals: list[str] = []
    explicit_deadlines_hours: list[float] = []
    lowered = text.lower()
    for match in _TIME_PATTERN.finditer(text):
        amount = float(match.group("amount"))
        hours = _hours_from_text(amount, match.group("unit"))
        window = lowered[max(match.start() - 24, 0) : min(match.end() + 24, len(lowered))]
        if any(
            token in window
            for token in (
                "response",
                "respond",
                "ack",
                "decision",
                "approve",
                "approval",
                "resolution",
                "resolve",
            )
        ):
            signals.append(f"Explicit SLA cue: {match.group(0)} in '{window.strip()}'.")
            explicit_deadlines_hours.append(hours)
    if "eod" in lowered or "end of day" in lowered:
        signals.append("Explicit SLA cue: end-of-day deadline referenced.")
        explicit_deadlines_hours.append(8.0)
    if mode == "approval" and any(
        token in lowered for token in ("approval pending", "awaiting sign-off", "waiting approval")
    ):
        signals.append("Approval workflow language indicates approval turnaround SLA relevance.")
    return signals, (min(explicit_deadlines_hours) if explicit_deadlines_hours else None)


def _extract_currency_amount(text: str) -> float | None:
    best: float | None = None
    for match in _CURRENCY_PATTERN.finditer(text):
        prefix = (match.group("prefix") or "").lower()
        suffix = (match.group("suffix") or "").lower()
        if not prefix and not suffix:
            continue
        amount = float(match.group("amount").replace(",", ""))
        if suffix in {"k"}:
            amount *= 1_000
        elif suffix in {"m"}:
            amount *= 1_000_000
        elif suffix in {"lakh", "lakhs"}:
            amount *= 100_000
        elif suffix in {"cr", "crore"}:
            amount *= 10_000_000
        if best is None or amount > best:
            best = amount
    return best


def _infer_estimated_value(
    *, text: str, workflow_type: str, priority: str, customer_tier: str
) -> float:
    explicit = _extract_currency_amount(text)
    if explicit is not None:
        return round(explicit, 2)
    baseline = 150000.0
    lowered = text.lower()
    if workflow_type in {"procurement_approval", "vendor_dispute"}:
        baseline = 450000.0
    elif workflow_type in {"support_ticket", "delivery_issue"}:
        baseline = 220000.0
    if customer_tier == "premium":
        baseline = max(baseline, 325000.0)
    if priority == "P1":
        baseline *= 1.35
    if any(
        token in lowered
        for token in ("launch", "go live", "rollout", "checkout", "payments", "revenue")
    ):
        baseline *= 1.3
    if any(
        token in lowered
        for token in ("contract", "renewal", "vendor onboarding", "po", "purchase order")
    ):
        baseline *= 1.2
    return round(baseline, 2)


def _infer_risk_flags(
    *, text: str, mode: str, explicit_sla_hours: float | None
) -> tuple[list[str], bool]:
    lowered = text.lower()
    risk_flags: list[str] = []
    high_risk_tokens = {
        "outage": "Production outage language detected.",
        "blocked": "Blocked workflow language detected.",
        "blocker": "Blocker language detected.",
        "breach": "Potential breach language detected.",
        "urgent": "Urgency marker detected.",
        "critical": "Critical impact language detected.",
        "launch": "Launch-sensitive language detected.",
    }
    for token, label in high_risk_tokens.items():
        if token in lowered:
            risk_flags.append(label)
    if mode == "approval" and any(
        token in lowered for token in ("approval", "sign-off", "approve")
    ):
        risk_flags.append("Approval-gated workflow detected.")
    if explicit_sla_hours is not None and explicit_sla_hours <= 4:
        risk_flags.append("Short explicit SLA window detected from request text.")
    should_raise_alert = len(risk_flags) >= 2 or any(
        token in lowered for token in ("outage", "breach", "launch-critical", "sev1", "p1")
    )
    return risk_flags, should_raise_alert


def _suggested_backlog_hours(
    priority: str, customer_tier: str, explicit_sla_hours: float | None, *, mode: str
) -> float:
    if explicit_sla_hours is not None:
        if explicit_sla_hours <= 1:
            return 60.0
        if explicit_sla_hours <= 4:
            return 48.0
        if explicit_sla_hours <= 8:
            return 30.0
        return 18.0 if mode == "approval" else 16.0
    if priority == "P1" and customer_tier == "premium":
        return 60.0
    if priority == "P1":
        return 48.0
    return 24.0 if mode == "approval" else 12.0


def _ensure_departments(db: Session, organization_id: int) -> list[Department]:
    departments = list(
        db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    )
    if not departments:
        default = Department(
            organization_id=organization_id,
            name="General",
            category="operations",
            capacity_score=100,
        )
        db.add(default)
        db.flush()
        departments.append(default)
    return departments


def _select_department(
    departments: list[Department],
    preferred_name: str | None,
    text: str,
    *,
    fallback: str | None = None,
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


def _apply_ticket_text_overrides(
    classification: IntakeClassification,
    *,
    title: str,
    description: str,
    departments: list[Department],
    vendors: list[Vendor],
) -> IntakeClassification:
    text = f"{title}\n{description}".lower()
    rationale = list(classification.rationale)
    department_name = classification.department_name
    vendor = _select_vendor(vendors, classification.vendor_name, text)

    if any(token in text for token in _DELIVERY_TOKENS) and not any(
        token in text for token in _FINANCE_DISPUTE_TOKENS
    ):
        department = _select_department(departments, None, text, fallback="operations")
        department_name = department.name
        rationale.append(
            "Overrode classification to delivery from explicit last-mile or pickup signals in the ticket."
        )
        return classification.model_copy(
            update={
                "workflow_type": "delivery_issue",
                "workflow_category": "delivery",
                "issue_type": "ops_task",
                "business_unit": "delivery",
                "department_name": department_name,
                "vendor_name": vendor.name if vendor else classification.vendor_name,
                "rationale": rationale,
            }
        )

    if any(token in text for token in _FINANCE_DISPUTE_TOKENS):
        department = _select_department(departments, None, text, fallback="finance")
        department_name = department.name
        rationale.append(
            "Confirmed finance or procurement discrepancy routing from explicit commercial dispute signals."
        )
        return classification.model_copy(
            update={
                "workflow_type": "vendor_dispute",
                "workflow_category": "finance",
                "issue_type": "discrepancy_case",
                "business_unit": "procurement",
                "department_name": department_name,
                "vendor_name": vendor.name if vendor else classification.vendor_name,
                "rationale": rationale,
            }
        )

    return classification.model_copy(
        update={"vendor_name": vendor.name if vendor else classification.vendor_name}
    )


def _heuristic_ticket_classification(
    *,
    departments: list[Department],
    vendors: list[Vendor],
    title: str,
    description: str,
    department_name: str | None,
    vendor_name: str | None,
) -> IntakeClassification:
    text = f"{title}\n{description}".lower()
    rationale: list[str] = []
    priority = (
        "P1"
        if any(token in text for token in ("urgent", "sev1", "p1", "outage", "down"))
        else "standard"
    )
    customer_tier = (
        "premium"
        if any(token in text for token in ("premium", "vip", "enterprise"))
        else "standard"
    )
    workflow_type = "support_ticket"
    workflow_category = "support"
    issue_type = "support_ticket"
    business_unit = "support"
    department_fallback = "operations"
    if any(token in text for token in _DELIVERY_TOKENS):
        workflow_type = "delivery_issue"
        workflow_category = "delivery"
        issue_type = "ops_task"
        business_unit = "delivery"
        department_fallback = "operations"
        rationale.append("Detected delivery or last-mile operations language.")
    elif any(token in text for token in _FINANCE_DISPUTE_TOKENS):
        workflow_type = "vendor_dispute"
        workflow_category = "finance"
        issue_type = "discrepancy_case"
        business_unit = "procurement"
        department_fallback = "finance"
        rationale.append("Detected finance or procurement discrepancy language.")
    elif any(token in text for token in ("warehouse", "inventory", "putaway")):
        workflow_type = "warehouse_request"
        workflow_category = "warehouse"
        issue_type = "ops_task"
        business_unit = "warehouse"
        department_fallback = "operations"
        rationale.append("Detected warehouse operations language.")
    else:
        rationale.append("Defaulted to support ticket classification from ticket-like content.")
    if priority == "P1":
        rationale.append("Urgency markers promoted the ticket to P1.")
    if customer_tier == "premium":
        rationale.append("Premium markers enabled premium customer tier matching.")
    sla_signals, explicit_sla_hours = _extract_sla_signals(f"{title}\n{description}", "ticket")
    risk_flags, should_raise_alert = _infer_risk_flags(
        text=f"{title}\n{description}",
        mode="ticket",
        explicit_sla_hours=explicit_sla_hours,
    )
    if sla_signals:
        rationale.append("Detected explicit SLA language from ticket title/description.")

    department = _select_department(
        departments, department_name, text, fallback=department_fallback
    )
    vendor = _select_vendor(vendors, vendor_name, text)
    backlog_hours = _suggested_backlog_hours(
        priority, customer_tier, explicit_sla_hours, mode="ticket"
    )
    inferred_estimated_value = _infer_estimated_value(
        text=f"{title}\n{description}",
        workflow_type=workflow_type,
        priority=priority,
        customer_tier=customer_tier,
    )
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
        inferred_estimated_value=inferred_estimated_value,
        risk_flags=risk_flags,
        detected_sla_signals=sla_signals,
        should_raise_alert=should_raise_alert,
        confidence=0.68,
        rationale=rationale,
    )


def _heuristic_approval_classification(
    *,
    departments: list[Department],
    vendors: list[Vendor],
    title: str,
    description: str,
    department_name: str | None,
    vendor_name: str | None,
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
    priority = (
        "P1"
        if any(token in text for token in ("urgent", "blocker", "today", "immediate"))
        else "standard"
    )
    customer_tier = (
        "premium" if any(token in text for token in ("premium", "vip", "executive")) else "standard"
    )
    sla_signals, explicit_sla_hours = _extract_sla_signals(f"{title}\n{description}", "approval")
    risk_flags, should_raise_alert = _infer_risk_flags(
        text=f"{title}\n{description}",
        mode="approval",
        explicit_sla_hours=explicit_sla_hours,
    )
    if sla_signals:
        rationale.append("Detected approval-turnaround or deadline language in the request.")
    department = _select_department(
        departments, department_name, text, fallback=department_fallback
    )
    vendor = _select_vendor(vendors, vendor_name, text)
    backlog_hours = _suggested_backlog_hours(
        priority, customer_tier, explicit_sla_hours, mode="approval"
    )
    inferred_estimated_value = _infer_estimated_value(
        text=f"{title}\n{description}",
        workflow_type=workflow_type,
        priority=priority,
        customer_tier=customer_tier,
    )
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
        inferred_estimated_value=inferred_estimated_value,
        risk_flags=risk_flags,
        detected_sla_signals=sla_signals,
        should_raise_alert=should_raise_alert,
        confidence=0.66,
        rationale=rationale,
    )


def _classify_with_model(
    *, title: str, description: str, departments: list[Department], vendors: list[Vendor], mode: str
) -> IntakeClassification | None:
    if not settings.gemini_api_key:
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI

        model = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
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
            "Treat last-mile, pickup, rider, fleet, dispatch, dark-store, courier, and delivery delays as delivery operations, not finance.\n"
            "Treat invoice, billing, payment, reconciliation, PO, rate mismatch, and commercial dispute language as finance or procurement discrepancies.\n"
            "Infer estimated value from the title/description if not explicit; do not ask the user for it.\n"
            "Detect SLA cues, deadline language, and approval turnaround clues from the text.\n"
            "Set should_raise_alert when the text implies blocker/critical/breach-sensitive handling.\n"
            "Set suggested_backlog_hours high enough only when urgency is explicit.\n\n"
            f"Departments: {[item.name for item in departments]}\n"
            f"Vendors: {[item.name for item in vendors]}\n"
            f"Title: {title}\n"
            f"Description: {description}"
        )
        payload = model.invoke(prompt)
        return (
            payload
            if isinstance(payload, IntakeClassification)
            else IntakeClassification.model_validate(payload)
        )
    except Exception:
        return None


def _evaluate_workflow(db: Session, workflow: Workflow) -> tuple[dict[str, Any], Any]:
    from app.models.domain import SLA, SlaRulebookEntry

    department = db.get(Department, workflow.department_id)
    vendor = db.get(Vendor, workflow.vendor_id) if workflow.vendor_id else None
    rulebook_entries = db.scalars(
        select(SlaRulebookEntry)
        .where(
            SlaRulebookEntry.organization_id == workflow.organization_id,
            SlaRulebookEntry.status == "active",
        )
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
        "title": workflow.intake_metadata.get("title")
        or f"{workflow.workflow_type.replace('_', ' ').title()} work item",
        "team": department.name if department else None,
        "owner_name": evaluation.live_item.owner_name or "Operations Queue Owner",
        "status": workflow.status,
        "current_stage": "escalation"
        if (evaluation.risk.time_remaining_minutes or 0) <= 0
        else "monitoring",
        "assigned_sla_name": evaluation.rule_match.rule_name,
        "response_deadline": evaluation.risk.response_deadline,
        "resolution_deadline": evaluation.risk.resolution_deadline,
        "time_remaining_minutes": evaluation.risk.time_remaining_minutes or 0,
        "predicted_breach_risk": evaluation.risk.predicted_breach_risk or "low",
        "contract_penalty": evaluation.risk.contract_penalty,
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
    if (
        evaluation.risk.predicted_breach_risk not in {"high", "critical"}
        and not classification.should_raise_alert
    ):
        return None, None
    alert_risk = evaluation.risk.predicted_breach_risk or "medium"
    if classification.should_raise_alert and alert_risk not in {"high", "critical"}:
        alert_risk = "high"
    alert = Alert(
        organization_id=workflow.organization_id,
        department_id=workflow.department_id,
        vendor_id=workflow.vendor_id,
        workflow_id=workflow.id,
        type=AlertType.sla_risk,
        severity=_severity_from_risk(alert_risk),
        title=f"SLA risk on {title}",
        description=(
            f"{description[:240]} "
            f"Matched SLA {evaluation.rule_match.rule_name or 'unmatched'} with "
            f"{alert_risk} risk."
        ).strip(),
        projected_impact=evaluation.risk.projected_business_impact,
        confidence_score=classification.confidence,
        payload={
            "intake_title": title,
            "classification": classification.model_dump(),
            "matched_sla_name": evaluation.rule_match.rule_name,
            "time_remaining_minutes": evaluation.risk.time_remaining_minutes,
            "risk_level": alert_risk,
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
    estimated_value: float | None,
    backlog_hours: float | None,
    status: str,
    region: str,
) -> dict[str, Any]:
    departments = _ensure_departments(db, organization_id)
    vendors = db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    classification = _classify_with_model(
        title=title,
        description=description,
        departments=departments,
        vendors=vendors,
        mode="ticket",
    ) or _heuristic_ticket_classification(
        departments=departments,
        vendors=vendors,
        title=title,
        description=description,
        department_name=department_name,
        vendor_name=vendor_name,
    )
    classification = _apply_ticket_text_overrides(
        classification,
        title=title,
        description=description,
        departments=departments,
        vendors=vendors,
    )
    department = _select_department(
        departments, classification.department_name, title + description
    )
    vendor = _select_vendor(vendors, classification.vendor_name, title + description)
    resolved_estimated_value = (
        estimated_value if estimated_value is not None else classification.inferred_estimated_value
    )
    workflow = Workflow(
        organization_id=organization_id,
        department_id=department.id,
        vendor_id=vendor.id if vendor else None,
        workflow_type=classification.workflow_type,
        status=status,
        opened_at=datetime.now(UTC),
        expected_by=datetime.now(UTC)
        + timedelta(hours=max(int(backlog_hours or classification.suggested_backlog_hours), 4)),
        resolved_at=None,
        estimated_value=resolved_estimated_value,
        backlog_hours=backlog_hours
        if backlog_hours is not None
        else classification.suggested_backlog_hours,
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
            "risk_flags": classification.risk_flags,
            "detected_sla_signals": classification.detected_sla_signals,
            "should_raise_alert": classification.should_raise_alert,
            "inferred_estimated_value": classification.inferred_estimated_value,
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
    estimated_value: float | None,
    backlog_hours: float | None,
    status: str,
    region: str,
) -> dict[str, Any]:
    departments = _ensure_departments(db, organization_id)
    vendors = db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    classification = _classify_with_model(
        title=title,
        description=description,
        departments=departments,
        vendors=vendors,
        mode="approval",
    ) or _heuristic_approval_classification(
        departments=departments,
        vendors=vendors,
        title=title,
        description=description,
        department_name=department_name,
        vendor_name=vendor_name,
    )
    department = _select_department(
        departments, classification.department_name, title + description
    )
    vendor = _select_vendor(vendors, classification.vendor_name, title + description)
    resolved_estimated_value = (
        estimated_value if estimated_value is not None else classification.inferred_estimated_value
    )
    workflow = Workflow(
        organization_id=organization_id,
        department_id=department.id,
        vendor_id=vendor.id if vendor else None,
        workflow_type=classification.workflow_type,
        status=status,
        opened_at=datetime.now(UTC),
        expected_by=datetime.now(UTC)
        + timedelta(hours=max(int(backlog_hours or classification.suggested_backlog_hours), 4)),
        resolved_at=None,
        estimated_value=resolved_estimated_value,
        backlog_hours=backlog_hours
        if backlog_hours is not None
        else classification.suggested_backlog_hours,
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
            "risk_flags": classification.risk_flags,
            "detected_sla_signals": classification.detected_sla_signals,
            "should_raise_alert": classification.should_raise_alert,
            "inferred_estimated_value": classification.inferred_estimated_value,
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
        policy
        for policy in auto_mode["policies"]
        if policy["enabled"] and requested_action_type in policy["allowed_actions"]
    ]
    approval_preview: ApprovalSuggestionPayload = get_agent().suggest_approval(
        {
            "risk_level": evaluation.risk.predicted_breach_risk,
            "action_type": requested_action_type,
            "allowed_actions": matching_policies[0]["allowed_actions"] if matching_policies else [],
            "default_approver": matching_policies[0]["approver_name"]
            if matching_policies
            else "Operations Director",
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
