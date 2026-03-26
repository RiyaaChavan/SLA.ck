from __future__ import annotations

import csv
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.domain import (
    ApprovalPolicy,
    Contract,
    Department,
    DetectorDefinition,
    Invoice,
    Organization,
    ResourceSnapshot,
    SchemaMapping,
    SLA,
    SlaExtractionBatch,
    SlaExtractionCandidate,
    SlaRulebookEntry,
    SourceUpload,
    Vendor,
    Workflow,
)
from app.services.alerts.detector import scan_organization_alerts
from app.services.reporting.reporter import generate_pdf_report
from app.services.seed.generator import DETECTOR_SEEDS
from app.utils.audit import log_event


TEAM_SLA_DEFAULTS = {
    "fleet_ops": {"target_hours": 2, "penalty_per_breach": 65000},
    "customer_escalations": {"target_hours": 1, "penalty_per_breach": 90000},
    "inventory_control": {"target_hours": 3, "penalty_per_breach": 70000},
    "dark_store_ops": {"target_hours": 4, "penalty_per_breach": 50000},
    "city_ops": {"target_hours": 6, "penalty_per_breach": 45000},
    "procurement": {"target_hours": 12, "penalty_per_breach": 30000},
    "finance_control": {"target_hours": 24, "penalty_per_breach": 25000},
    "regional_command": {"target_hours": 24, "penalty_per_breach": 20000},
}

RESOURCE_TEAM_MAP = {
    "picker_capacity": "dark_store_ops",
    "packer_capacity": "dark_store_ops",
    "driver_capacity": "fleet_ops",
    "dispatch_bays": "dark_store_ops",
    "cold_storage": "inventory_control",
    "saas_licenses": "procurement",
}

SOURCE_FILES = [
    "organizations.csv",
    "cities.csv",
    "dark_stores.csv",
    "teams.csv",
    "employees.csv",
    "drivers.csv",
    "vendors.csv",
    "contracts.csv",
    "orders.csv",
    "order_items.csv",
    "delivery_events.csv",
    "inventory_snapshots.csv",
    "work_items.csv",
    "invoices.csv",
    "ground_truth_anomalies.csv",
    "approval_playbooks.csv",
]


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _to_bool(value: str | None) -> bool:
    return str(value).lower() in {"1", "true", "yes", "y"}


def _to_int(value: str | None, default: int = 0) -> int:
    if value in {None, ""}:
        return default
    return int(float(value))


def _to_float(value: str | None, default: float = 0.0) -> float:
    if value in {None, ""}:
        return default
    return float(value)


def _to_datetime(value: str | None) -> datetime | None:
    if value in {None, ""}:
        return None
    return datetime.fromisoformat(value)


def _to_date_start(value: str) -> datetime:
    return datetime.fromisoformat(f"{value}T00:00:00+05:30")


def _team_capacity_score(team_type: str, manager_count: int, employee_count: int) -> int:
    base = {
        "fleet_ops": 108,
        "customer_escalations": 96,
        "inventory_control": 101,
        "dark_store_ops": 104,
        "city_ops": 100,
        "procurement": 98,
        "finance_control": 97,
        "regional_command": 95,
    }.get(team_type, 100)
    if employee_count > 15:
        base += 4
    if manager_count > 1:
        base += 2
    return base


def _load_sources(bundle_dir: Path) -> dict[str, list[dict[str, str]]]:
    return {name: _read_csv(bundle_dir / name) for name in SOURCE_FILES}


def _reset_database(db: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()


def import_quick_commerce_sources(
    db: Session,
    *,
    sources: dict[str, list[dict[str, str]]],
    source_label: str,
    source_kind: str,
    reset: bool = True,
) -> dict[str, Any]:
    if not sources["organizations.csv"]:
        raise ValueError("Bundle is missing organizations.csv")

    if reset:
        _reset_database(db)

    organization_row = sources["organizations.csv"][0]
    organization = Organization(
        name=organization_row["org_name"],
        industry=organization_row["industry"],
        geography=organization_row["country"],
    )
    db.add(organization)
    db.flush()

    teams = sources["teams.csv"]
    employees = sources["employees.csv"]
    vendors = sources["vendors.csv"]
    contracts = sources["contracts.csv"]
    work_items = sources["work_items.csv"]
    invoices = sources["invoices.csv"]
    resource_rows = sources["inventory_snapshots.csv"]
    anomalies = sources["ground_truth_anomalies.csv"]

    employees_by_team: dict[str, list[dict[str, str]]] = defaultdict(list)
    for employee in employees:
        employees_by_team[employee["team_id"]].append(employee)

    department_id_by_team_id: dict[str, int] = {}
    for team in teams:
        team_id = team["team_id"]
        team_employees = employees_by_team.get(team_id, [])
        manager_count = sum(1 for row in team_employees if row["role"].endswith("manager") or row["role"].endswith("head"))
        department = Department(
            organization_id=organization.id,
            name=team["team_name"],
            category=team["team_type"],
            capacity_score=_team_capacity_score(team["team_type"], manager_count, len(team_employees)),
        )
        db.add(department)
        db.flush()
        department_id_by_team_id[team_id] = department.id
        sla_defaults = TEAM_SLA_DEFAULTS.get(team["team_type"], TEAM_SLA_DEFAULTS["dark_store_ops"])
        db.add(
            SLA(
                organization_id=organization.id,
                department_id=department.id,
                name=f"{team['team_name']} SLA",
                target_hours=sla_defaults["target_hours"],
                penalty_per_breach=sla_defaults["penalty_per_breach"],
            )
        )

    vendor_id_map: dict[str, int] = {}
    for vendor_row in vendors:
        vendor = Vendor(
            organization_id=organization.id,
            name=vendor_row["vendor_name"],
            category=vendor_row["vendor_category"],
            risk_rating=_to_float(vendor_row["risk_rating"]),
        )
        db.add(vendor)
        db.flush()
        vendor_id_map[vendor_row["vendor_id"]] = vendor.id

    contract_id_map: dict[str, int] = {}
    for contract_row in contracts:
        contract = Contract(
            organization_id=organization.id,
            vendor_id=vendor_id_map[contract_row["vendor_id"]],
            service_unit=contract_row["service_unit"],
            contracted_rate=_to_float(contract_row["contracted_rate_inr"]),
            start_date=_to_date_start(contract_row["start_date"]),
            end_date=_to_date_start(contract_row["end_date"]),
        )
        db.add(contract)
        db.flush()
        contract_id_map[contract_row["contract_id"]] = contract.id
        db.add(
            SlaRulebookEntry(
                organization_id=organization.id,
                name=contract_row["sla_name"],
                status="active",
                applies_to={
                    "contract_type": contract_row["contract_type"],
                    "service_unit": contract_row["service_unit"],
                },
                conditions=f"Apply for vendor contract {contract_row['contract_type']}.",
                response_deadline_hours=_to_int(contract_row["response_deadline_hours"], 4),
                resolution_deadline_hours=_to_int(contract_row["resolution_deadline_hours"], 24),
                penalty_amount=_to_float(contract_row["penalty_per_breach_inr"]),
                escalation_owner="Operations Director",
                business_hours_logic="Business hours",
                auto_action_allowed=_to_bool(contract_row["auto_action_allowed"]),
                source_document_name=f"{contract_row['sla_name']}.pdf",
                last_reviewed_at=datetime.now(UTC),
            )
        )

    extraction_batch = SlaExtractionBatch(
        organization_id=organization.id,
        source_document_name=f"{organization.name} Service Agreements.pdf",
        status="pending_review",
        uploaded_at=datetime.now(UTC),
    )
    db.add(extraction_batch)
    db.flush()
    for rule in contract_rows[:2] if (contract_rows := contracts) else []:
        db.add(
            SlaExtractionCandidate(
                batch_id=extraction_batch.id,
                name=rule["sla_name"],
                applies_to={"contract_type": rule["contract_type"]},
                conditions=f"Candidate extraction from {rule['sla_name']}.",
                response_deadline_hours=_to_int(rule["response_deadline_hours"], 4),
                resolution_deadline_hours=_to_int(rule["resolution_deadline_hours"], 24),
                penalty_amount=_to_float(rule["penalty_per_breach_inr"]),
                escalation_owner="Operations Director",
                business_hours_logic="Business hours",
                auto_action_allowed=_to_bool(rule["auto_action_allowed"]),
                status="pending",
            )
        )

    team_type_to_department_ids: dict[tuple[str, str], int] = {}
    for team in teams:
        team_type_to_department_ids[(team["store_id"], team["team_type"])] = department_id_by_team_id[team["team_id"]]

    procurement_department_id = next(
        (
            department_id_by_team_id[team["team_id"]]
            for team in teams
            if team["team_type"] == "procurement"
        ),
        next(iter(department_id_by_team_id.values())),
    )

    for invoice_row in invoices:
        store_ref = invoice_row["store_id"]
        department_id = procurement_department_id
        invoice = Invoice(
            organization_id=organization.id,
            vendor_id=vendor_id_map[invoice_row["vendor_id"]],
            contract_id=contract_id_map[invoice_row["contract_id"]],
            department_id=department_id,
            invoice_ref=invoice_row["invoice_ref"],
            amount=_to_float(invoice_row["amount_inr"]),
            billed_units=_to_int(invoice_row["service_unit_count"]),
            delivered_units=_to_int(invoice_row["validated_unit_count"]),
            billed_rate=_to_float(invoice_row["billed_rate_inr"]),
            invoice_date=_to_date_start(invoice_row["invoice_date"]),
            status=invoice_row["status"],
        )
        db.add(invoice)

    anomaly_index: dict[tuple[str, str], dict[str, str]] = {}
    for anomaly in anomalies:
        anomaly_index[(anomaly["entity_type"], anomaly["entity_id"])] = anomaly

    for work_item_row in work_items:
        department_id = department_id_by_team_id[work_item_row["team_id"]]
        workflow = Workflow(
            organization_id=organization.id,
            department_id=department_id,
            vendor_id=vendor_id_map.get(work_item_row["linked_vendor_id"]) if work_item_row["linked_vendor_id"] else None,
            workflow_type=work_item_row["item_type"],
            status=work_item_row["status"],
            opened_at=_to_datetime(work_item_row["opened_at"]) or datetime.now(UTC),
            expected_by=_to_datetime(work_item_row["expected_by"]) or datetime.now(UTC),
            resolved_at=_to_datetime(work_item_row["resolved_at"]),
            estimated_value=_to_float(work_item_row["estimated_value_inr"]),
            backlog_hours=_to_float(work_item_row["backlog_hours"]),
        )
        db.add(workflow)

    for resource_row in resource_rows:
        store_ref = resource_row["store_id"]
        team_type = RESOURCE_TEAM_MAP.get(resource_row["resource_type"], "dark_store_ops")
        department_id = team_type_to_department_ids.get((store_ref, team_type), procurement_department_id)
        snapshot = ResourceSnapshot(
            organization_id=organization.id,
            department_id=department_id,
            resource_type=resource_row["resource_type"],
            resource_name=resource_row["resource_name"],
            utilization_pct=_to_float(resource_row["utilization_pct"]),
            active_units=_to_int(resource_row["active_units"]),
            provisioned_units=_to_int(resource_row["provisioned_units"]),
            monthly_cost=_to_float(resource_row["monthly_cost_inr"]),
            snapshot_at=_to_datetime(resource_row["snapshot_ts"]) or datetime.now(UTC),
        )
        db.add(snapshot)

    for detector_seed in DETECTOR_SEEDS:
        db.add(DetectorDefinition(organization_id=organization.id, **detector_seed))

    playbooks = sources["approval_playbooks.csv"]
    if playbooks:
        for playbook in playbooks:
            db.add(
                ApprovalPolicy(
                    organization_id=organization.id,
                    name=f"{playbook['anomaly_type']} policy",
                    module="ProcureWatch" if "invoice" in playbook["anomaly_type"] or "rate" in playbook["anomaly_type"] else "SLA Sentinel",
                    scope=playbook["required_team_type"],
                    risk_level=playbook["risk_level"],
                    enabled=_to_bool(playbook["auto_mode_allowed"]),
                    approver_name=playbook["approver_role"].replace("_", " ").title(),
                    allowed_actions=[playbook["recommended_action"]],
                    condition_summary=f"Route {playbook['anomaly_type']} to {playbook['required_team_type']}.",
                    expires_at=None,
                )
            )

    source_files = [name for name, rows in sources.items() if rows]
    for source_name in source_files:
        rows = sources[source_name]
        columns = list(rows[0].keys()) if rows else []
        source_upload = SourceUpload(
            organization_id=organization.id,
            name=source_name,
            source_kind=source_kind,
            record_count=len(rows),
            file_path=f"{source_label}::{source_name}",
        )
        db.add(source_upload)
        db.add(
            SchemaMapping(
                organization_id=organization.id,
                source_name=source_name,
                source_type=source_kind,
                raw_schema={"columns": columns},
                mapped_schema={"columns": columns},
                confidence_score=0.96,
                status="confirmed",
            )
        )

    db.commit()

    alerts = scan_organization_alerts(db, organization.id)
    generate_pdf_report(db, organization_id=organization.id, title=f"{organization.name} Operations Intelligence Brief")
    log_event(
        db,
        organization_id=organization.id,
        entity_type="synthetic_bundle",
        entity_id=organization.id,
        event_type="imported",
        payload={
            "source_label": source_label,
            "files": len(source_files),
            "raw_anomaly_count": len(anomalies),
            "generated_alert_count": len(alerts),
        },
    )
    db.commit()

    return {
        "organization_id": organization.id,
        "organization_name": organization.name,
        "source_label": source_label,
        "departments_created": len(teams),
        "vendors_created": len(vendors),
        "contracts_created": len(contracts),
        "workflows_created": len(work_items),
        "invoices_created": len(invoices),
        "resource_snapshots_created": len(resource_rows),
        "source_uploads_created": len(source_files),
        "raw_anomalies_available": len(anomalies),
        "alerts_generated": len(alerts),
    }


def import_quick_commerce_bundle(
    db: Session,
    *,
    bundle_dir: Path,
    reset: bool = True,
    random_seed: int = 20260329,
) -> dict[str, Any]:
    if not bundle_dir.exists():
        raise ValueError(f"Bundle directory not found: {bundle_dir}")

    sources = _load_sources(bundle_dir)
    result = import_quick_commerce_sources(
        db,
        sources=sources,
        source_label=str(bundle_dir),
        source_kind="csv_bundle",
        reset=reset,
    )
    result["bundle_dir"] = str(bundle_dir)
    return result
