from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Action,
    Alert,
    AlertType,
    Approval,
    Contract,
    Department,
    DetectorDefinition,
    Invoice,
    Recommendation,
    ResourceSnapshot,
    SLA,
    SlaRulebookEntry,
    Vendor,
    Workflow,
)
from app.services.sla.runtime import build_live_work_item, evaluate_runtime_sla


SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1}

DETECTOR_FALLBACKS = {
    AlertType.duplicate_spend.value: "Duplicate Spend Cluster",
    AlertType.rate_mismatch.value: "Contract Rate Drift Monitor",
    AlertType.sla_risk.value: "Queue Breach Forecaster",
    AlertType.resource_overload.value: "Operational Overload Monitor",
    AlertType.resource_waste.value: "Underused Capacity Sweep",
    AlertType.vendor_discrepancy.value: "Vendor Reconciliation Watch",
}

MODULE_BY_ALERT_TYPE = {
    AlertType.duplicate_spend.value: "ProcureWatch",
    AlertType.rate_mismatch.value: "ProcureWatch",
    AlertType.vendor_discrepancy.value: "ProcureWatch",
    AlertType.sla_risk.value: "SLA Sentinel",
    AlertType.resource_overload.value: "SLA Sentinel",
    AlertType.resource_waste.value: "SLA Sentinel",
}


def humanize(value: str) -> str:
    return value.replace("_", " ").strip().title()


def module_for_alert_type(alert_type: str) -> str:
    return MODULE_BY_ALERT_TYPE.get(alert_type, "SLA.ck")


def default_owner_name(module: str, team: str | None) -> str:
    if module == "ProcureWatch":
        return "Procurement Lead"
    if team:
        return f"{team} Manager"
    return "Operations Manager"


def required_approver(module: str, severity: str) -> str:
    if module == "ProcureWatch":
        return "Finance Controller" if severity in {"critical", "high"} else "Procurement Approver"
    return "Operations Director" if severity in {"critical", "high"} else "Operations Approver"


def action_state(action: Action | None, approval: Approval | None) -> str:
    if action and action.status.value == "executed":
        return "executed"
    if approval and approval.decision.value == "rejected":
        return "blocked"
    if approval and approval.decision.value == "approved":
        return "ready"
    if action:
        return "pending_approval"
    return "proposed"


def countdown_minutes(target: datetime | None) -> int | None:
    if target is None:
        return None
    if target.tzinfo is None:
        current = datetime.now(UTC).replace(tzinfo=None)
    else:
        current = datetime.now(UTC)
    return int((target - current).total_seconds() // 60)


def sla_risk_level(minutes: int | None, severity: str) -> str | None:
    if minutes is None:
        return None
    if minutes <= 0:
        return "critical"
    if minutes <= 60:
        return "high"
    if minutes <= 240:
        return "medium"
    return severity


def realized_impact(alert: Alert, action: Action | None) -> float | None:
    if alert.realized_impact is not None:
        return round(alert.realized_impact, 2)
    if action and action.status.value == "executed":
        return round(alert.projected_impact * 0.68, 2)
    return None


def latest_timestamp(*timestamps: datetime | None) -> datetime:
    non_null = [item for item in timestamps if item is not None]
    if not non_null:
        return datetime.now(UTC)
    return max(non_null)


def load_case_context(db: Session, organization_id: int) -> dict[str, Any]:
    departments = {
        item.id: item
        for item in db.scalars(select(Department).where(Department.organization_id == organization_id)).all()
    }
    vendors = {
        item.id: item
        for item in db.scalars(select(Vendor).where(Vendor.organization_id == organization_id)).all()
    }
    workflows = {
        item.id: item
        for item in db.scalars(select(Workflow).where(Workflow.organization_id == organization_id)).all()
    }
    invoices = {
        item.id: item
        for item in db.scalars(select(Invoice).where(Invoice.organization_id == organization_id)).all()
    }
    contracts = {
        item.id: item
        for item in db.scalars(select(Contract).where(Contract.organization_id == organization_id)).all()
    }
    resources = {
        item.id: item
        for item in db.scalars(
            select(ResourceSnapshot).where(ResourceSnapshot.organization_id == organization_id)
        ).all()
    }
    slas = {
        item.department_id: item
        for item in db.scalars(select(SLA).where(SLA.organization_id == organization_id)).all()
    }
    rulebook_entries = db.scalars(
        select(SlaRulebookEntry).where(
            SlaRulebookEntry.organization_id == organization_id,
            SlaRulebookEntry.status == "active",
        )
    ).all()
    detectors = {
        item.detector_key: item
        for item in db.scalars(
            select(DetectorDefinition).where(DetectorDefinition.organization_id == organization_id)
        ).all()
    }

    recommendations = db.scalars(
        select(Recommendation).join(Alert).where(Alert.organization_id == organization_id)
    ).all()
    recommendation_by_alert_id = {item.alert_id: item for item in recommendations}

    actions = db.scalars(select(Action).join(Recommendation).join(Alert).where(Alert.organization_id == organization_id)).all()
    latest_action_by_recommendation_id: dict[int, Action] = {}
    for item in actions:
        current = latest_action_by_recommendation_id.get(item.recommendation_id)
        if current is None or item.id > current.id:
            latest_action_by_recommendation_id[item.recommendation_id] = item

    approvals = db.scalars(
        select(Approval).join(Recommendation).join(Alert).where(Alert.organization_id == organization_id)
    ).all()
    latest_approval_by_recommendation_id: dict[int, Approval] = {}
    approval_history_by_recommendation_id: dict[int, list[Approval]] = defaultdict(list)
    for item in approvals:
        approval_history_by_recommendation_id[item.recommendation_id].append(item)
        current = latest_approval_by_recommendation_id.get(item.recommendation_id)
        if current is None or item.id > current.id:
            latest_approval_by_recommendation_id[item.recommendation_id] = item
    for item in approval_history_by_recommendation_id.values():
        item.sort(key=lambda approval: approval.decided_at or approval.created_at)

    return {
        "departments": departments,
        "vendors": vendors,
        "workflows": workflows,
        "invoices": invoices,
        "contracts": contracts,
        "resources": resources,
        "slas": slas,
        "rulebook_entries": rulebook_entries,
        "detectors": detectors,
        "recommendation_by_alert_id": recommendation_by_alert_id,
        "latest_action_by_recommendation_id": latest_action_by_recommendation_id,
        "latest_approval_by_recommendation_id": latest_approval_by_recommendation_id,
        "approval_history_by_recommendation_id": approval_history_by_recommendation_id,
    }


def bundle_for_alert(alert: Alert, context: dict[str, Any]) -> dict[str, Any]:
    department = context["departments"].get(alert.department_id)
    vendor = context["vendors"].get(alert.vendor_id)
    workflow = context["workflows"].get(alert.workflow_id)
    invoice = context["invoices"].get(alert.invoice_id)
    contract = context["contracts"].get(invoice.contract_id) if invoice else None
    resource = context["resources"].get(alert.resource_snapshot_id)
    sla = context["slas"].get(alert.department_id)
    detector = context["detectors"].get(alert.type.value)
    recommendation = context["recommendation_by_alert_id"].get(alert.id)
    action = None
    approval = None
    approval_history: list[Approval] = []
    if recommendation is not None:
        action = context["latest_action_by_recommendation_id"].get(recommendation.id)
        approval = context["latest_approval_by_recommendation_id"].get(recommendation.id)
        approval_history = context["approval_history_by_recommendation_id"].get(recommendation.id, [])
    return {
        "department": department,
        "vendor": vendor,
        "workflow": workflow,
        "invoice": invoice,
        "contract": contract,
        "resource": resource,
        "sla": sla,
        "context": context,
        "detector": detector,
        "recommendation": recommendation,
        "action": action,
        "approval": approval,
        "approval_history": approval_history,
    }


def formula_for_alert(alert: Alert, bundle: dict[str, Any]) -> dict[str, Any]:
    alert_type = alert.type.value
    invoice = bundle["invoice"]
    contract = bundle["contract"]
    workflow = bundle["workflow"]
    resource = bundle["resource"]
    sla = bundle["sla"]
    payload = alert.payload or {}

    if alert_type == AlertType.rate_mismatch.value and invoice and contract:
        return {
            "expression": "(billed_rate - contracted_rate) x billed_units",
            "description": f"Detected leakage from invoice {invoice.invoice_ref} versus contract pricing.",
            "assumptions": [
                f"Contracted rate is {contract.contracted_rate:.2f}",
                f"Billed rate is {invoice.billed_rate:.2f}",
                f"Billed units are {invoice.billed_units}",
            ],
            "confidence": alert.confidence_score,
        }
    if alert_type == AlertType.vendor_discrepancy.value and invoice:
        return {
            "expression": "(billed_units - delivered_units) x billed_rate",
            "description": "Measures billed service volume that is not backed by delivery evidence.",
            "assumptions": [
                f"Billed units are {invoice.billed_units}",
                f"Delivered units are {invoice.delivered_units}",
                f"Billed rate is {invoice.billed_rate:.2f}",
            ],
            "confidence": alert.confidence_score,
        }
    if alert_type == AlertType.duplicate_spend.value:
        duplicate_ids = payload.get("invoice_ids", [])
        return {
            "expression": "sum(duplicate invoice amounts beyond the first matched invoice)",
            "description": "Treats the first invoice as the valid baseline and prices the remaining cluster as spend at risk.",
            "assumptions": [
                f"Detected invoice cluster size: {len(duplicate_ids)}",
                "Only invoices beyond the first matching signature are counted as risk",
            ],
            "confidence": alert.confidence_score,
        }
    if alert_type == AlertType.sla_risk.value and workflow:
        runtime_sla = sla_payload_for_alert(alert, bundle)
        target_hours = runtime_sla["resolution_deadline_hours"] if runtime_sla else (sla.target_hours if sla else 8)
        penalty = runtime_sla["penalty_amount"] if runtime_sla else (sla.penalty_per_breach if sla else 35_000)
        return {
            "expression": "(delay_hours / target_hours) x penalty_per_breach + estimated_value x 0.03",
            "description": "Estimates near-term SLA exposure from queue delay and workflow value.",
            "assumptions": [
                f"Delay hours: {payload.get('delay_hours', 0)}",
                f"Target hours: {target_hours}",
                f"Penalty per breach: {penalty:.2f}",
                f"Workflow value: {workflow.estimated_value:.2f}",
            ],
            "confidence": alert.confidence_score,
        }
    if alert_type == AlertType.resource_overload.value and resource:
        return {
            "expression": "monthly_cost x overload_pct + intervention_buffer",
            "description": "Projects cost of sustained overload plus the likely intervention overhead.",
            "assumptions": [
                f"Resource utilization is {resource.utilization_pct:.1f}%",
                f"Monthly cost is {resource.monthly_cost:.2f}",
                "Intervention buffer is fixed at 40000.00",
            ],
            "confidence": alert.confidence_score,
        }
    if alert_type == AlertType.resource_waste.value and resource:
        return {
            "expression": "monthly_cost x (1 - utilization_pct / 100)",
            "description": "Values the unused share of provisioned capacity.",
            "assumptions": [
                f"Resource utilization is {resource.utilization_pct:.1f}%",
                f"Monthly cost is {resource.monthly_cost:.2f}",
            ],
            "confidence": alert.confidence_score,
        }
    return {
        "expression": "projected_impact",
        "description": "Uses the precomputed projected impact from the detection pipeline.",
        "assumptions": ["Fallback formula used because a more specific baseline was unavailable"],
        "confidence": alert.confidence_score,
    }


def evidence_for_alert(alert: Alert, bundle: dict[str, Any]) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    invoice = bundle["invoice"]
    contract = bundle["contract"]
    workflow = bundle["workflow"]
    resource = bundle["resource"]
    payload = alert.payload or {}

    if invoice:
        evidence.append({"label": "Invoice reference", "value": invoice.invoice_ref, "source": "invoice"})
        evidence.append({"label": "Invoice amount", "value": round(invoice.amount, 2), "source": "invoice"})
        evidence.append({"label": "Billed units", "value": invoice.billed_units, "source": "invoice"})
        evidence.append(
            {"label": "Delivered units", "value": invoice.delivered_units, "source": "validation_log"}
        )
    if contract:
        evidence.append(
            {
                "label": "Contracted rate",
                "value": round(contract.contracted_rate, 2),
                "source": "contract",
            }
        )
    if workflow:
        evidence.append({"label": "Workflow type", "value": workflow.workflow_type, "source": "workflow"})
        evidence.append({"label": "Backlog hours", "value": round(workflow.backlog_hours, 2), "source": "workflow"})
    if resource:
        evidence.append(
            {
                "label": "Utilization percent",
                "value": round(resource.utilization_pct, 2),
                "source": "resource_snapshot",
            }
        )
        evidence.append(
            {
                "label": "Provisioned units",
                "value": resource.provisioned_units,
                "source": "resource_snapshot",
            }
        )
    if "invoice_ids" in payload:
        evidence.append(
            {
                "label": "Duplicate invoice ids",
                "value": ", ".join(str(item) for item in payload["invoice_ids"]),
                "source": "alert_payload",
            }
        )
    if "delay_hours" in payload:
        evidence.append(
            {
                "label": "Delay hours",
                "value": payload["delay_hours"],
                "source": "alert_payload",
            }
        )
    return evidence


def related_entities_for_alert(alert: Alert, bundle: dict[str, Any]) -> list[dict[str, Any]]:
    related: list[dict[str, Any]] = []
    if bundle["department"]:
        related.append(
            {
                "entity_type": "department",
                "entity_id": bundle["department"].id,
                "label": bundle["department"].name,
            }
        )
    if bundle["vendor"]:
        related.append(
            {"entity_type": "vendor", "entity_id": bundle["vendor"].id, "label": bundle["vendor"].name}
        )
    if bundle["workflow"]:
        related.append(
            {
                "entity_type": "workflow",
                "entity_id": bundle["workflow"].id,
                "label": f"Workflow {bundle['workflow'].id}",
            }
        )
    if bundle["invoice"]:
        related.append(
            {
                "entity_type": "invoice",
                "entity_id": bundle["invoice"].id,
                "label": bundle["invoice"].invoice_ref,
            }
        )
    if bundle["resource"]:
        related.append(
            {
                "entity_type": "resource_snapshot",
                "entity_id": bundle["resource"].id,
                "label": bundle["resource"].resource_name,
            }
        )
    return related


def narrative_for_alert(alert: Alert, bundle: dict[str, Any]) -> tuple[str, str, str]:
    alert_type = alert.type.value
    invoice = bundle["invoice"]
    contract = bundle["contract"]
    workflow = bundle["workflow"]
    resource = bundle["resource"]
    payload = alert.payload or {}

    if alert_type == AlertType.rate_mismatch.value and invoice and contract:
        why_flagged = (
            f"Invoice {invoice.invoice_ref} billed {invoice.billed_rate:.2f} against a contracted "
            f"rate of {contract.contracted_rate:.2f}."
        )
        root_cause = "Vendor pricing drift or off-contract billing was detected in the payable record."
        baseline = (
            f"Baseline contract rate is {contract.contracted_rate:.2f}; current billed rate is "
            f"{invoice.billed_rate:.2f}."
        )
        return why_flagged, root_cause, baseline
    if alert_type == AlertType.vendor_discrepancy.value and invoice:
        why_flagged = (
            f"Invoice {invoice.invoice_ref} billed {invoice.billed_units} units while delivery logs "
            f"validated only {invoice.delivered_units}."
        )
        root_cause = "Billed service volume is exceeding the validated delivery baseline."
        baseline = (
            f"Expected delivered units were {invoice.delivered_units}; billed units came in at "
            f"{invoice.billed_units}."
        )
        return why_flagged, root_cause, baseline
    if alert_type == AlertType.duplicate_spend.value:
        cluster = len((alert.payload or {}).get("invoice_ids", []))
        why_flagged = "Multiple invoices share the same vendor, amount, and department signature."
        root_cause = "The payable queue contains a duplicate-spend pattern consistent with repeated invoicing."
        baseline = f"Expected one matched invoice per signature; detected cluster size is {cluster}."
        return why_flagged, root_cause, baseline
    if alert_type == AlertType.sla_risk.value and workflow:
        delay = payload.get("delay_hours", 0)
        why_flagged = (
            f"Workflow {workflow.id} is already drifting by {delay} hours against its expected completion."
        )
        root_cause = "Queue delay and workload pressure indicate an approaching or active SLA breach."
        baseline = (
            f"Expected completion was {workflow.expected_by.isoformat()}; backlog is "
            f"{workflow.backlog_hours:.1f} hours."
        )
        return why_flagged, root_cause, baseline
    if alert_type == AlertType.resource_overload.value and resource:
        why_flagged = f"{resource.resource_name} is operating at {resource.utilization_pct:.1f}% utilization."
        root_cause = "Sustained overload is likely to slow throughput and trigger downstream SLA misses."
        baseline = "Sustainable utilization baseline is 100%; current utilization is materially above that."
        return why_flagged, root_cause, baseline
    if alert_type == AlertType.resource_waste.value and resource:
        why_flagged = f"{resource.resource_name} is only using {resource.utilization_pct:.1f}% of provisioned capacity."
        root_cause = "Provisioned capacity is ahead of actual workload demand."
        baseline = "Efficient utilization baseline is above 65%; current utilization is materially below that."
        return why_flagged, root_cause, baseline
    return alert.description, "Detected variance requires operator review.", "Baseline comparison unavailable."


def sla_payload_for_alert(alert: Alert, bundle: dict[str, Any]) -> dict[str, Any] | None:
    workflow = bundle["workflow"]
    if workflow is None:
        return None
    live_item = build_live_work_item(workflow, bundle["department"], bundle["vendor"])
    evaluation = evaluate_runtime_sla(
        item=live_item,
        rulebook_entries=bundle["context"]["rulebook_entries"],
        legacy_sla=bundle["context"]["slas"].get(workflow.department_id),
    )
    if evaluation.rule_match.rule_name is None:
        return None
    minutes = evaluation.risk.time_remaining_minutes
    return {
        "name": evaluation.rule_match.rule_name,
        "response_deadline_hours": evaluation.rule_match.response_deadline_hours,
        "resolution_deadline_hours": evaluation.rule_match.resolution_deadline_hours,
        "penalty_amount": round(evaluation.rule_match.penalty_amount, 2),
        "countdown_minutes": minutes,
        "risk_level": evaluation.risk.predicted_breach_risk or sla_risk_level(minutes, alert.severity.value),
        "match_rationale": evaluation.rule_match.rationale,
    }


def approval_chain_for_alert(alert: Alert, bundle: dict[str, Any]) -> list[dict[str, Any]]:
    approval_history: list[Approval] = bundle["approval_history"]
    module = module_for_alert_type(alert.type.value)
    required = required_approver(module, alert.severity.value)
    if not approval_history:
        return [{"approver_name": required, "decision": "pending", "notes": None, "decided_at": None}]
    return [
        {
            "approver_name": item.approver_name,
            "decision": item.decision.value,
            "notes": item.notes,
            "decided_at": item.decided_at,
        }
        for item in approval_history
    ]


def recommended_action_for_alert(alert: Alert, bundle: dict[str, Any]) -> dict[str, Any]:
    module = module_for_alert_type(alert.type.value)
    recommendation = bundle["recommendation"]
    action = bundle["action"]
    approval = bundle["approval"]
    evidence = evidence_for_alert(alert, bundle)
    title = recommendation.title if recommendation else f"Respond to {alert.title}"
    rationale = recommendation.rationale if recommendation else alert.description
    required = required_approver(module, alert.severity.value)
    execution_state = action.status.value if action else "pending"
    approval_state = approval.decision.value if approval else "pending"
    return {
        "title": title,
        "rationale": rationale,
        "action_type": action.action_type if action else None,
        "approval_state": approval_state,
        "execution_state": execution_state,
        "expected_savings": round(alert.projected_impact * 0.63, 2),
        "required_approver": approval.approver_name if approval else required,
        "evidence_pack_summary": [f"{item['label']}: {item['value']}" for item in evidence[:3]],
    }


def timeline_for_alert(alert: Alert, bundle: dict[str, Any]) -> list[dict[str, Any]]:
    items = [
        {
            "event_type": "detected",
            "title": "Case detected by monitoring pipeline",
            "created_at": alert.created_at,
            "payload": {"severity": alert.severity.value, "projected_impact": alert.projected_impact},
        }
    ]
    recommendation = bundle["recommendation"]
    action = bundle["action"]
    if recommendation:
        items.append(
            {
                "event_type": "action_proposed",
                "title": recommendation.title,
                "created_at": recommendation.created_at,
                "payload": {"category": recommendation.category},
            }
        )
    for approval in bundle["approval_history"]:
        items.append(
            {
                "event_type": approval.decision.value,
                "title": f"Recommendation {approval.decision.value}",
                "created_at": approval.decided_at or approval.created_at,
                "payload": {"approver_name": approval.approver_name, "notes": approval.notes},
            }
        )
    if action:
        items.append(
            {
                "event_type": action.status.value,
                "title": f"Action {humanize(action.action_type)}",
                "created_at": action.executed_at or action.created_at,
                "payload": {"result_summary": action.result_summary},
            }
        )
    items.sort(key=lambda item: item["created_at"])
    return items


def build_case_summary(alert: Alert, context: dict[str, Any]) -> dict[str, Any]:
    bundle = bundle_for_alert(alert, context)
    module = module_for_alert_type(alert.type.value)
    team = bundle["department"].name if bundle["department"] else None
    vendor = bundle["vendor"].name if bundle["vendor"] else None
    recommendation = bundle["recommendation"]
    action = bundle["action"]
    approval = bundle["approval"]
    sla_info = sla_payload_for_alert(alert, bundle)
    approver = approval.approver_name if approval else required_approver(module, alert.severity.value)

    return {
        "id": alert.id,
        "organization_id": alert.organization_id,
        "module": module,
        "title": alert.title,
        "summary": alert.description,
        "case_type": alert.type.value,
        "severity": alert.severity.value,
        "status": alert.status.value,
        "team": team,
        "vendor": vendor,
        "detector_name": (
            bundle["detector"].name if bundle["detector"] else DETECTOR_FALLBACKS.get(alert.type.value, humanize(alert.type.value))
        ),
        "owner_name": default_owner_name(module, team),
        "approver_name": approver,
        "projected_impact": round(alert.projected_impact, 2),
        "realized_impact": realized_impact(alert, action),
        "approval_state": approval.decision.value if approval else "pending",
        "action_state": action_state(action, approval),
        "sla_countdown_minutes": sla_info["countdown_minutes"] if sla_info else None,
        "sla_risk_level": sla_info["risk_level"] if sla_info else None,
        "recommended_action_label": recommendation.title if recommendation else None,
        "created_at": alert.created_at,
        "updated_at": latest_timestamp(
            alert.updated_at,
            recommendation.updated_at if recommendation else None,
            approval.decided_at if approval else None,
            action.executed_at if action else None,
        ),
    }


def build_case_detail(alert: Alert, context: dict[str, Any]) -> dict[str, Any]:
    bundle = bundle_for_alert(alert, context)
    summary = build_case_summary(alert, context)
    why_flagged, root_cause, baseline = narrative_for_alert(alert, bundle)
    formula = formula_for_alert(alert, bundle)
    recommended_action = recommended_action_for_alert(alert, bundle)
    action = bundle["action"]
    return {
        "id": alert.id,
        "organization_id": alert.organization_id,
        "module": summary["module"],
        "title": alert.title,
        "summary": alert.description,
        "why_flagged": why_flagged,
        "root_cause": root_cause,
        "baseline_comparison": baseline,
        "evidence": evidence_for_alert(alert, bundle),
        "related_entities": related_entities_for_alert(alert, bundle),
        "sla": sla_payload_for_alert(alert, bundle),
        "financial_impact": {
            "projected_impact": round(alert.projected_impact, 2),
            "realized_impact": realized_impact(alert, action),
            "estimated_savings": round(alert.projected_impact * 0.63, 2),
            "avoided_loss": round(alert.projected_impact, 2),
            "confidence": alert.confidence_score,
            "currency": "INR",
        },
        "formula": formula,
        "recommended_action": recommended_action,
        "approval_chain": approval_chain_for_alert(alert, bundle),
        "timeline": timeline_for_alert(alert, bundle),
        "created_at": alert.created_at,
        "updated_at": summary["updated_at"],
    }


def build_action_request(alert: Alert, context: dict[str, Any]) -> dict[str, Any] | None:
    bundle = bundle_for_alert(alert, context)
    recommendation = bundle["recommendation"]
    action = bundle["action"]
    approval = bundle["approval"]
    if recommendation is None or action is None:
        return None
    module = module_for_alert_type(alert.type.value)
    required = required_approver(module, alert.severity.value)
    evidence_pack = recommended_action_for_alert(alert, bundle)["evidence_pack_summary"]
    return {
        "id": action.id,
        "case_id": alert.id,
        "title": recommendation.title,
        "recommended_next_step": humanize(action.action_type),
        "rationale": recommendation.rationale,
        "expected_savings": round(alert.projected_impact * 0.63, 2),
        "avoided_loss": round(alert.projected_impact, 2),
        "risk_level": alert.severity.value,
        "required_approver": approval.approver_name if approval else required,
        "evidence_pack_summary": evidence_pack,
        "approval_state": approval.decision.value if approval else "pending",
        "execution_state": action.status.value,
        "created_at": recommendation.created_at,
        "updated_at": latest_timestamp(
            recommendation.updated_at,
            approval.decided_at if approval else None,
            action.executed_at if action else None,
            action.updated_at,
        ),
    }
