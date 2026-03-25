from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.domain import (
    Action,
    ActionStatus,
    Alert,
    AlertType,
    Contract,
    Invoice,
    Recommendation,
    ResourceSnapshot,
    SLA,
    Severity,
    Workflow,
)
from app.utils.audit import log_event


PLAYBOOKS = {
    AlertType.duplicate_spend: [
        "Validate duplicate invoice references",
        "Hold the next payment batch",
        "Create vendor review case",
    ],
    AlertType.rate_mismatch: [
        "Compare billed rate against contract",
        "Open commercial review",
        "Escalate rate dispute to procurement",
    ],
    AlertType.sla_risk: [
        "Escalate queue to operations manager",
        "Reassign impacted workload",
        "Track outcome over the next business cycle",
    ],
    AlertType.resource_overload: [
        "Rebalance work to the lowest-load peer team",
        "Increase temporary staffing coverage",
        "Review capacity plan",
    ],
    AlertType.resource_waste: [
        "Downsize unused capacity",
        "Reclaim idle licenses",
        "Validate renewal schedule",
    ],
    AlertType.vendor_discrepancy: [
        "Match billed units against service logs",
        "Create discrepancy case",
        "Recommend vendor audit if issue repeats",
    ],
}


def _severity(score: float) -> Severity:
    if score >= 300_000:
        return Severity.critical
    if score >= 150_000:
        return Severity.high
    if score >= 50_000:
        return Severity.medium
    return Severity.low


def create_recommendation_bundle(
    db: Session, *, alert: Alert, rationale: str, action_type: str
) -> tuple[Recommendation, Action]:
    recommendation = Recommendation(
        alert=alert,
        category=alert.type.value,
        title=f"Recommended action for {alert.title}",
        rationale=rationale,
        playbook={"steps": PLAYBOOKS[alert.type]},
    )
    db.add(recommendation)
    db.flush()
    action = Action(
        recommendation_id=recommendation.id,
        action_type=action_type,
        status=ActionStatus.pending,
        payload={"alert_id": alert.id, "suggested_steps": PLAYBOOKS[alert.type]},
    )
    db.add(action)
    return recommendation, action


def scan_organization_alerts(db: Session, organization_id: int) -> list[Alert]:
    recommendation_ids = db.scalars(
        select(Recommendation.id).join(Alert).where(Alert.organization_id == organization_id)
    ).all()
    if recommendation_ids:
        db.execute(delete(Action).where(Action.recommendation_id.in_(recommendation_ids)))
        db.execute(delete(Recommendation).where(Recommendation.id.in_(recommendation_ids)))
    db.execute(delete(Alert).where(Alert.organization_id == organization_id))
    db.flush()

    alerts: list[Alert] = []
    invoices = db.scalars(select(Invoice).where(Invoice.organization_id == organization_id)).all()
    contracts = {
        contract.id: contract
        for contract in db.scalars(select(Contract).where(Contract.organization_id == organization_id)).all()
    }
    duplicate_groups: dict[tuple[int, float, int], list[Invoice]] = defaultdict(list)

    for invoice in invoices:
        duplicate_groups[(invoice.vendor_id, round(invoice.amount, 2), invoice.department_id)].append(
            invoice
        )
        contract = contracts.get(invoice.contract_id)
        if contract and invoice.billed_rate > contract.contracted_rate * 1.08:
            impact = max((invoice.billed_rate - contract.contracted_rate) * invoice.billed_units, 0)
            alert = Alert(
                organization_id=organization_id,
                department_id=invoice.department_id,
                vendor_id=invoice.vendor_id,
                invoice_id=invoice.id,
                type=AlertType.rate_mismatch,
                severity=_severity(impact),
                title="Billed rate exceeds contracted rate",
                description=(
                    f"Invoice {invoice.invoice_ref} was billed above the contracted rate "
                    f"for {contract.service_unit}."
                ),
                projected_impact=round(impact, 2),
                confidence_score=0.9,
                payload={"invoice_ref": invoice.invoice_ref},
            )
            db.add(alert)
            db.flush()
            create_recommendation_bundle(
                db,
                alert=alert,
                rationale="The billed rate is outside the contract tolerance threshold.",
                action_type="open_rate_review",
            )
            alerts.append(alert)

        discrepancy = max(invoice.billed_units - invoice.delivered_units, 0) * invoice.billed_rate
        if discrepancy > 0:
            alert = Alert(
                organization_id=organization_id,
                department_id=invoice.department_id,
                vendor_id=invoice.vendor_id,
                invoice_id=invoice.id,
                type=AlertType.vendor_discrepancy,
                severity=_severity(discrepancy),
                title="Vendor billed more units than validated",
                description=f"Invoice {invoice.invoice_ref} is not supported by delivered unit logs.",
                projected_impact=round(discrepancy, 2),
                confidence_score=0.83,
                payload={"billed_units": invoice.billed_units, "delivered_units": invoice.delivered_units},
            )
            db.add(alert)
            db.flush()
            create_recommendation_bundle(
                db,
                alert=alert,
                rationale="Delivered service volume trails billed volume.",
                action_type="open_vendor_dispute",
            )
            alerts.append(alert)

    for group in duplicate_groups.values():
        if len(group) < 2:
            continue
        base = group[0]
        impact = sum(item.amount for item in group[1:])
        alert = Alert(
            organization_id=organization_id,
            department_id=base.department_id,
            vendor_id=base.vendor_id,
            invoice_id=base.id,
            type=AlertType.duplicate_spend,
            severity=_severity(impact),
            title="Potential duplicate invoice cluster",
            description=f"{len(group)} invoices share the same amount and vendor signature.",
            projected_impact=round(impact, 2),
            confidence_score=0.78,
            payload={"invoice_ids": [item.id for item in group]},
        )
        db.add(alert)
        db.flush()
        create_recommendation_bundle(
            db,
            alert=alert,
            rationale="Repeated invoice patterns indicate potential duplicate spend.",
            action_type="hold_duplicate_payment",
        )
        alerts.append(alert)

    slas = {
        sla.department_id: sla
        for sla in db.scalars(select(SLA).where(SLA.organization_id == organization_id)).all()
    }
    now = datetime.now(UTC)
    workflows = db.scalars(select(Workflow).where(Workflow.organization_id == organization_id)).all()
    for workflow in workflows:
        expected_by = workflow.expected_by
        current_time = now
        if expected_by.tzinfo is None:
            current_time = datetime.utcnow()
        delay_hours = max((current_time - expected_by).total_seconds() / 3600, 0)
        if delay_hours <= 0:
            continue
        sla = slas.get(workflow.department_id)
        penalty = (delay_hours / max(sla.target_hours if sla else 8, 1)) * (
            sla.penalty_per_breach if sla else 35_000
        )
        impact = penalty + workflow.estimated_value * 0.03
        alert = Alert(
            organization_id=organization_id,
            department_id=workflow.department_id,
            vendor_id=workflow.vendor_id,
            workflow_id=workflow.id,
            type=AlertType.sla_risk,
            severity=_severity(impact),
            title="Department delay is putting SLA at risk",
            description=(
                f"Workflow {workflow.id} is delayed by {delay_hours:.1f} hours "
                f"and needs intervention."
            ),
            projected_impact=round(impact, 2),
            confidence_score=0.86,
            payload={"delay_hours": round(delay_hours, 2), "workflow_type": workflow.workflow_type},
        )
        db.add(alert)
        db.flush()
        create_recommendation_bundle(
            db,
            alert=alert,
            rationale="The delay trend points to likely penalty exposure without rerouting.",
            action_type="reroute_queue",
        )
        alerts.append(alert)

    resources = db.scalars(
        select(ResourceSnapshot).where(ResourceSnapshot.organization_id == organization_id)
    ).all()
    for snapshot in resources:
        if snapshot.utilization_pct > 110:
            impact = snapshot.monthly_cost * (snapshot.utilization_pct - 100) / 100 + 40_000
            alert = Alert(
                organization_id=organization_id,
                department_id=snapshot.department_id,
                resource_snapshot_id=snapshot.id,
                type=AlertType.resource_overload,
                severity=_severity(impact),
                title="Resource capacity is overloaded",
                description=f"{snapshot.resource_name} is running above sustainable utilization.",
                projected_impact=round(impact, 2),
                confidence_score=0.8,
                payload={"utilization_pct": snapshot.utilization_pct},
            )
            db.add(alert)
            db.flush()
            create_recommendation_bundle(
                db,
                alert=alert,
                rationale="Capacity saturation is likely to cause SLA breach and rework.",
                action_type="rebalance_capacity",
            )
            alerts.append(alert)
        if snapshot.utilization_pct < 35:
            impact = snapshot.monthly_cost * (1 - snapshot.utilization_pct / 100)
            alert = Alert(
                organization_id=organization_id,
                department_id=snapshot.department_id,
                resource_snapshot_id=snapshot.id,
                type=AlertType.resource_waste,
                severity=_severity(impact),
                title="Resource spend appears underutilized",
                description=f"{snapshot.resource_name} is materially underused versus provisioned cost.",
                projected_impact=round(impact, 2),
                confidence_score=0.74,
                payload={"utilization_pct": snapshot.utilization_pct},
            )
            db.add(alert)
            db.flush()
            create_recommendation_bundle(
                db,
                alert=alert,
                rationale="Capacity can be reclaimed or downsized.",
                action_type="downsize_capacity",
            )
            alerts.append(alert)

    for alert in alerts:
        log_event(
            db,
            organization_id=organization_id,
            entity_type="alert",
            entity_id=alert.id,
            event_type="generated",
            payload={"type": alert.type.value, "impact": alert.projected_impact},
        )
    db.commit()
    return alerts
