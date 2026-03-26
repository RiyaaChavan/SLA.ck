from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Alert, DetectorDefinition
from app.utils.audit import log_event


def _detector_key(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def _default_expected_fields(module: str) -> list[str]:
    if module == "SLA Sentinel":
        return ["workflow_id", "department", "delay_hours", "projected_penalty"]
    return ["invoice_id", "vendor", "variance_amount", "projected_leakage"]


def _module_from_prompt(prompt: str, module: str | None) -> str:
    if module:
        return module
    lowered = prompt.lower()
    if "sla" in lowered or "queue" in lowered or "ticket" in lowered:
        return "SLA Sentinel"
    return "ProcureWatch"


def list_detectors(db: Session, organization_id: int) -> list[dict]:
    detectors = db.scalars(
        select(DetectorDefinition)
        .where(DetectorDefinition.organization_id == organization_id)
        .order_by(DetectorDefinition.created_at.asc())
    ).all()
    alerts = db.scalars(select(Alert).where(Alert.organization_id == organization_id)).all()
    issue_counter = Counter(alert.type.value for alert in alerts)
    latest_triggered: dict[str, datetime] = {}
    for alert in alerts:
        current = latest_triggered.get(alert.type.value)
        if current is None or alert.created_at > current:
            latest_triggered[alert.type.value] = alert.created_at

    return [
        {
            "id": detector.id,
            "detector_key": detector.detector_key,
            "name": detector.name,
            "description": detector.description,
            "module": detector.module,
            "business_domain": detector.business_domain,
            "severity": detector.severity,
            "owner_name": detector.owner_name,
            "enabled": detector.enabled,
            "logic_type": detector.logic_type,
            "logic_summary": detector.logic_summary,
            "query_logic": detector.query_logic,
            "expected_output_fields": detector.expected_output_fields,
            "linked_action_template": detector.linked_action_template,
            "linked_cost_formula": detector.linked_cost_formula,
            "last_triggered_at": latest_triggered.get(detector.detector_key, detector.last_triggered_at),
            "issue_count": issue_counter.get(detector.detector_key, detector.issue_count),
        }
        for detector in detectors
    ]


def create_detector(db: Session, organization_id: int, payload: dict) -> dict:
    detector = DetectorDefinition(
        organization_id=organization_id,
        detector_key=payload.get("detector_key") or _detector_key(payload["name"]),
        name=payload["name"],
        description=payload["description"],
        module=payload["module"],
        business_domain=payload["business_domain"],
        severity=payload["severity"],
        owner_name=payload["owner_name"],
        enabled=payload.get("enabled", True),
        logic_type=payload["logic_type"],
        logic_summary=payload["logic_summary"],
        query_logic=payload["query_logic"],
        expected_output_fields=payload.get("expected_output_fields", []),
        linked_action_template=payload["linked_action_template"],
        linked_cost_formula=payload["linked_cost_formula"],
    )
    db.add(detector)
    db.flush()
    log_event(
        db,
        organization_id=organization_id,
        entity_type="detector",
        entity_id=detector.id,
        event_type="created",
        payload={"name": detector.name, "module": detector.module},
    )
    db.commit()
    return next(item for item in list_detectors(db, organization_id) if item["id"] == detector.id)


def build_prompt_draft(organization_id: int, prompt: str, module: str | None) -> dict:
    resolved_module = _module_from_prompt(prompt, module)
    business_domain = "sla_operations" if resolved_module == "SLA Sentinel" else "procurement"
    lowered = prompt.lower()
    severity = "high" if any(token in lowered for token in ["breach", "duplicate", "over", "drift"]) else "medium"
    name = (
        "Prompt Draft SLA Detector" if resolved_module == "SLA Sentinel" else "Prompt Draft Procurement Detector"
    )
    return {
        "detector_key": _detector_key(name),
        "name": name,
        "description": f"Draft detector generated from prompt: {prompt}",
        "module": resolved_module,
        "business_domain": business_domain,
        "severity": severity,
        "owner_name": "AI Drafting Assistant",
        "enabled": False,
        "logic_type": "prompt_draft",
        "logic_summary": f"Prompt-derived detector for: {prompt}",
        "query_logic": (
            "SELECT * FROM operational_events WHERE anomaly_score > threshold"
            if resolved_module == "SLA Sentinel"
            else "SELECT * FROM invoices WHERE billed_amount > expected_amount"
        ),
        "expected_output_fields": _default_expected_fields(resolved_module),
        "linked_action_template": (
            "Escalate queue and reroute owner review"
            if resolved_module == "SLA Sentinel"
            else "Open procurement review and hold release if approved"
        ),
        "linked_cost_formula": (
            "SLA penalty = likely breaches x penalty per breach"
            if resolved_module == "SLA Sentinel"
            else "Invoice leakage = billed amount - expected amount"
        ),
        "draft_source": f"organization:{organization_id}:prompt",
        "warnings": ["Draft uses deterministic demo logic and should be reviewed before saving."],
    }


def patch_detector(db: Session, detector_id: int, *, enabled: bool) -> dict:
    detector = db.get(DetectorDefinition, detector_id)
    if detector is None:
        raise ValueError("Detector not found")
    detector.enabled = enabled
    db.add(detector)
    log_event(
        db,
        organization_id=detector.organization_id,
        entity_type="detector",
        entity_id=detector.id,
        event_type="updated",
        payload={"enabled": enabled},
    )
    db.commit()
    return next(item for item in list_detectors(db, detector.organization_id) if item["id"] == detector.id)


def test_detector(db: Session, detector_id: int) -> dict:
    detector = db.get(DetectorDefinition, detector_id)
    if detector is None:
        raise ValueError("Detector not found")
    alerts = [
        alert
        for alert in db.scalars(
            select(Alert)
            .where(Alert.organization_id == detector.organization_id)
            .order_by(Alert.created_at.desc())
        ).all()
        if alert.type.value == detector.detector_key
    ]
    sample_rows = [
        {
            "alert_id": alert.id,
            "title": alert.title,
            "projected_impact": round(alert.projected_impact, 2),
            "status": alert.status.value,
        }
        for alert in alerts[:3]
    ]
    detector.last_triggered_at = alerts[0].created_at if alerts else detector.last_triggered_at
    detector.issue_count = len(alerts)
    db.add(detector)
    db.commit()
    return {
        "detector_id": detector.id,
        "detector_name": detector.name,
        "issue_count": len(alerts),
        "sample_rows": sample_rows,
        "explanation": f"Detector matched {len(alerts)} case(s) in the current demo dataset.",
    }
