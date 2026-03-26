from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Department, SLA, SlaRulebookEntry, Vendor, Workflow
from app.services.sla.contracts import (
    LiveWorkItemContract,
    RiskEvaluation,
    RuleMatchResult,
    RuntimeSlaEvaluation,
)


def severity_from_minutes(minutes: int | None, backlog_hours: float) -> str:
    if minutes is None:
        return "low"
    if minutes <= 0:
        return "critical"
    if minutes <= 60 or backlog_hours >= 48:
        return "high"
    if minutes <= 240 or backlog_hours >= 24:
        return "medium"
    return "low"


def _normalized_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text.lower() if text else None


def workflow_category_for_type(workflow_type: str) -> str:
    lowered = workflow_type.lower()
    if "vendor" in lowered or "finance" in lowered or "discrepancy" in lowered:
        return "finance"
    if "delivery" in lowered:
        return "delivery"
    if "warehouse" in lowered:
        return "warehouse"
    if "support" in lowered or "ticket" in lowered:
        return "support"
    return "operations"


def build_live_work_item(
    workflow: Workflow, department: Department | None, vendor: Vendor | None
) -> LiveWorkItemContract:
    category = workflow_category_for_type(workflow.workflow_type)
    priority = "P1" if workflow.backlog_hours >= 48 else "standard"
    return LiveWorkItemContract(
        id=workflow.id,
        organization_id=workflow.organization_id,
        department_id=workflow.department_id,
        department_name=department.name if department else None,
        workflow_type=workflow.workflow_type,
        status=workflow.status,
        opened_at=workflow.opened_at,
        expected_by=workflow.expected_by,
        estimated_value=workflow.estimated_value,
        backlog_hours=workflow.backlog_hours,
        owner_name=f"{department.name} Queue Owner" if department else "Operations Queue Owner",
        attributes={
            "department": department.name if department else None,
            "team": department.name if department else None,
            "workflow": workflow.workflow_type,
            "workflow_category": category,
            "priority": priority,
            "business_unit": category if category != "finance" else "procurement",
            "issue_type": "support_ticket" if category == "support" else "ops_task",
            "vendor_name": vendor.name if vendor else None,
            "customer_tier": "premium" if workflow.backlog_hours >= 60 else "standard",
            "region": "default",
        },
    )


def _score_rule(rule: SlaRulebookEntry, item: LiveWorkItemContract) -> RuleMatchResult:
    rationale: list[str] = []
    applies_to = rule.applies_to or {}
    if rule.status != "active":
        return RuleMatchResult(match_source="rulebook", rationale=["Rule is not active and cannot be matched."])
    if not applies_to:
        rationale.append("Rule has no applies_to dimensions; treated as broad fallback.")
        return RuleMatchResult(
            rule_id=rule.id,
            rule_name=rule.name,
            match_score=0.2,
            rationale=rationale,
            match_source="rulebook",
            response_deadline_hours=rule.response_deadline_hours,
            resolution_deadline_hours=rule.resolution_deadline_hours,
            penalty_amount=rule.penalty_amount,
            escalation_owner=rule.escalation_owner,
            auto_action_allowed=rule.auto_action_allowed,
        )

    score = 0.0
    for key, expected in applies_to.items():
        actual = item.attributes.get(key)
        if _normalized_string(actual) == _normalized_string(expected):
            score += 1.0
            rationale.append(f"Matched {key}={expected}.")
        else:
            rationale.append(f"Did not match {key}; expected {expected}, got {actual}.")
    weighted_score = score / max(len(applies_to), 1)
    return RuleMatchResult(
        rule_id=rule.id if score > 0 else None,
        rule_name=rule.name if score > 0 else None,
        match_score=round(weighted_score, 3),
        rationale=rationale,
        match_source="rulebook",
        response_deadline_hours=rule.response_deadline_hours if score > 0 else None,
        resolution_deadline_hours=rule.resolution_deadline_hours if score > 0 else None,
        penalty_amount=rule.penalty_amount if score > 0 else 0.0,
        escalation_owner=rule.escalation_owner if score > 0 else None,
        auto_action_allowed=rule.auto_action_allowed if score > 0 else False,
    )


def match_rule_for_live_item(
    *,
    item: LiveWorkItemContract,
    rulebook_entries: list[SlaRulebookEntry],
    legacy_sla: SLA | None,
) -> RuleMatchResult:
    scored = [_score_rule(rule, item) for rule in rulebook_entries]
    scored = [result for result in scored if result.rule_id is not None]
    if scored:
        best = sorted(scored, key=lambda result: (result.match_score, result.penalty_amount), reverse=True)[0]
        if best.match_score >= 0.5:
            best.rationale.append("Selected highest scoring active rulebook entry.")
            return best
    if legacy_sla:
        return RuleMatchResult(
            rule_name=legacy_sla.name,
            match_score=0.1,
            rationale=["No strong rulebook match found; fell back to legacy department SLA."],
            match_source="legacy_sla",
            response_deadline_hours=max(legacy_sla.target_hours // 2, 1),
            resolution_deadline_hours=legacy_sla.target_hours,
            penalty_amount=legacy_sla.penalty_per_breach,
            auto_action_allowed=False,
        )
    return RuleMatchResult(
        match_source="none",
        rationale=["No active rulebook or legacy SLA matched this work item."],
    )


def _time_remaining_minutes(deadline: datetime | None) -> int | None:
    if deadline is None:
        return None
    if deadline.tzinfo is None:
        current = datetime.now(UTC).replace(tzinfo=None)
    else:
        current = datetime.now(UTC)
    return int((deadline - current).total_seconds() // 60)


def suggest_intervention(risk_level: str, match: RuleMatchResult, item: LiveWorkItemContract) -> str:
    category = item.attributes.get("workflow_category", "operations")
    if risk_level == "critical":
        return "Escalate immediately, reroute workload, and trigger breach review"
    if risk_level == "high":
        if match.auto_action_allowed:
            return "Escalate manager and trigger approved auto-action"
        return "Escalate manager and rebalance workload"
    if category == "finance":
        return "Open discrepancy review and monitor deadline"
    return "Monitor queue and rebalance if backlog grows"


def evaluate_runtime_sla(
    *,
    item: LiveWorkItemContract,
    rulebook_entries: list[SlaRulebookEntry],
    legacy_sla: SLA | None,
) -> RuntimeSlaEvaluation:
    match = match_rule_for_live_item(item=item, rulebook_entries=rulebook_entries, legacy_sla=legacy_sla)
    response_deadline = (
        item.opened_at + timedelta(hours=match.response_deadline_hours)
        if match.response_deadline_hours is not None
        else None
    )
    resolution_deadline = (
        item.opened_at + timedelta(hours=match.resolution_deadline_hours)
        if match.resolution_deadline_hours is not None
        else item.expected_by
    )
    time_remaining_minutes = _time_remaining_minutes(resolution_deadline)
    risk_level = severity_from_minutes(time_remaining_minutes, item.backlog_hours)
    penalty_multiplier = 1.0
    if risk_level == "critical":
        penalty_multiplier = 1.35
    elif risk_level == "high":
        penalty_multiplier = 1.1
    projected_penalty = round(match.penalty_amount * penalty_multiplier, 2) if match.penalty_amount else 0.0
    projected_business_impact = round(projected_penalty + item.estimated_value * 0.03, 2)
    return RuntimeSlaEvaluation(
        live_item=item,
        rule_match=match,
        risk=RiskEvaluation(
            response_deadline=response_deadline,
            resolution_deadline=resolution_deadline,
            time_remaining_minutes=time_remaining_minutes,
            predicted_breach_risk=risk_level,
            projected_penalty=projected_penalty,
            projected_business_impact=projected_business_impact,
            suggested_intervention=suggest_intervention(risk_level, match, item),
        ),
    )


def runtime_context_for_organization(db: Session, organization_id: int) -> dict:
    departments = {
        item.id: item
        for item in db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    }
    vendors = {
        item.id: item
        for item in db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    }
    workflows = db.scalars(
        select(Workflow).where(Workflow.organization_id == organization_id).order_by(Workflow.expected_by.asc())
    ).all()
    legacy_slas = {
        item.department_id: item
        for item in db.scalars(select(SLA).where(SLA.organization_id == organization_id)).all()
    }
    rulebook_entries = db.scalars(
        select(SlaRulebookEntry)
        .where(SlaRulebookEntry.organization_id == organization_id, SlaRulebookEntry.status == "active")
        .order_by(SlaRulebookEntry.rule_version.desc(), SlaRulebookEntry.created_at.desc())
    ).all()
    return {
        "departments": departments,
        "vendors": vendors,
        "workflows": workflows,
        "legacy_slas": legacy_slas,
        "rulebook_entries": rulebook_entries,
    }


def list_live_ops(
    db: Session,
    organization_id: int,
    *,
    status: str | None = None,
    team: str | None = None,
    risk: str | None = None,
    workflow_category: str | None = None,
    sort: str = "deadline",
) -> list[dict]:
    context = runtime_context_for_organization(db, organization_id)
    items: list[dict] = []
    for workflow in context["workflows"]:
        department = context["departments"].get(workflow.department_id)
        vendor = context["vendors"].get(workflow.vendor_id)
        live_item = build_live_work_item(workflow, department, vendor)
        evaluation = evaluate_runtime_sla(
            item=live_item,
            rulebook_entries=context["rulebook_entries"],
            legacy_sla=context["legacy_slas"].get(workflow.department_id),
        )
        row = {
            "id": workflow.id,
            "item_type": workflow.workflow_type,
            "title": f"{workflow.workflow_type.replace('_', ' ').title()} work item",
            "team": department.name if department else None,
            "owner_name": live_item.owner_name or "Operations Queue Owner",
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
            "workflow_category": live_item.attributes.get("workflow_category"),
        }
        if status and row["status"].lower() != status.lower():
            continue
        if team and (row["team"] or "").lower() != team.lower():
            continue
        if risk and row["predicted_breach_risk"].lower() != risk.lower():
            continue
        if workflow_category and (row["workflow_category"] or "").lower() != workflow_category.lower():
            continue
        items.append(row)

    if sort == "impact":
        items.sort(key=lambda item: (item["projected_business_impact"], -item["time_remaining_minutes"]), reverse=True)
    elif sort == "risk":
        ranking = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        items.sort(
            key=lambda item: (ranking.get(item["predicted_breach_risk"], 0), item["time_remaining_minutes"]),
            reverse=True,
        )
    else:
        items.sort(key=lambda item: (item["time_remaining_minutes"], -item["projected_business_impact"]))
    return items
