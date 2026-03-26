import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import (
    Alert,
    Contract,
    Department,
    Invoice,
    Organization,
    Recommendation,
    ResourceSnapshot,
    Vendor,
    Workflow,
)


def _make_rng(seed: int) -> random.Random:
    return random.Random(seed)


def load_profiles() -> list[dict]:
    profiles_dir: Path = settings.seed_profiles_dir
    if not profiles_dir.exists():
        return []
    profiles: list[dict] = []
    for path in sorted(profiles_dir.glob("*.yaml")):
        with open(path, encoding="utf-8") as fh:
            profiles.append(yaml.safe_load(fh))
    return profiles


def _random_datetime(rng: random.Random, days_back: int = 90) -> datetime:
    offset = rng.uniform(0, days_back * 86400)
    return datetime.now(UTC) - timedelta(seconds=offset)


def reset_database(db: Session) -> None:
    for model in (
        Recommendation,
        Alert,
        Invoice,
        Contract,
        Workflow,
        ResourceSnapshot,
        Department,
        Vendor,
        Organization,
    ):
        db.execute(delete(model))
    db.commit()


def seed_database(db: Session, *, reset: bool = False) -> dict:
    from app.services.alerts.detector import scan_organization_alerts

    if reset:
        reset_database(db)

    profiles = load_profiles()
    if not profiles:
        return {"organizations_created": 0, "alerts_created": 0, "reports_generated": 0}

    orgs_created = 0
    total_alerts = 0

    for profile in profiles:
        seed_value = profile.get("seed", 42)
        rng = _make_rng(seed_value)
        org_cfg = profile["organization"]

        existing = db.scalar(select(Organization).where(Organization.name == org_cfg["name"]))
        if existing:
            continue

        org = Organization(
            name=org_cfg["name"],
            industry=org_cfg["industry"],
            geography=org_cfg["geography"],
        )
        db.add(org)
        db.flush()

        departments: list[Department] = []
        for dept_cfg in profile.get("departments", []):
            dept = Department(
                organization_id=org.id,
                name=dept_cfg["name"],
                category=dept_cfg["category"],
                capacity_score=dept_cfg.get("capacity_score", 100),
            )
            db.add(dept)
            departments.append(dept)
        db.flush()

        vendors: list[Vendor] = []
        for vendor_cfg in profile.get("vendors", []):
            vendor = Vendor(
                organization_id=org.id,
                name=vendor_cfg["name"],
                category=vendor_cfg["category"],
                risk_rating=vendor_cfg.get("risk_rating", 0.3),
            )
            db.add(vendor)
            vendors.append(vendor)
        db.flush()

        for vendor in vendors:
            dept = rng.choice(departments)
            contract = Contract(
                organization_id=org.id,
                vendor_id=vendor.id,
                service_unit=f"{vendor.category}_unit",
                contracted_rate=round(rng.uniform(80, 250), 2),
                start_date=datetime.now(UTC) - timedelta(days=rng.randint(180, 540)),
                end_date=datetime.now(UTC) + timedelta(days=rng.randint(90, 365)),
            )
            db.add(contract)
        db.flush()

        contracts = list(
            db.scalars(select(Contract).where(Contract.organization_id == org.id)).all()
        )

        workload = profile.get("workload", {})
        workflow_count = workload.get("workflow_count", 80)
        workflow_types = workload.get("workflow_types", ["general_workflow"])
        sla_delay_prob = profile.get("anomalies", {}).get("sla_delay_probability", 0.2)

        for _ in range(workflow_count):
            dept = rng.choice(departments)
            vendor = rng.choice(vendors) if vendors else None
            wf_type = rng.choice(workflow_types)
            opened = _random_datetime(rng, days_back=120)
            expected_hours = rng.randint(8, 168)
            expected_by = opened + timedelta(hours=expected_hours)

            if rng.random() < sla_delay_prob:
                resolved = None
                status = "open"
            else:
                resolved = expected_by + timedelta(hours=rng.randint(-12, 24))
                status = "resolved"

            wf = Workflow(
                organization_id=org.id,
                department_id=dept.id,
                vendor_id=vendor.id if vendor else None,
                workflow_type=wf_type,
                status=status,
                opened_at=opened,
                expected_by=expected_by,
                resolved_at=resolved,
                estimated_value=round(rng.uniform(5_000, 250_000), 2),
                backlog_hours=round(rng.uniform(0, 200), 1),
            )
            db.add(wf)
        db.flush()

        invoice_count = workload.get("invoice_count", 60)
        duplicate_prob = profile.get("anomalies", {}).get("duplicate_invoice_probability", 0.1)

        invoice_pool: list[dict] = []
        for i in range(invoice_count):
            vendor = rng.choice(vendors) if vendors else None
            dept = rng.choice(departments)
            contract = rng.choice(contracts) if contracts else None
            billed_rate = round(rng.uniform(80, 300), 2)
            if contract and rng.random() < 0.15:
                billed_rate = round(contract.contracted_rate * rng.uniform(1.09, 1.35), 2)

            billed_units = rng.randint(40, 500)
            delivered_units = billed_units - rng.randint(0, max(int(billed_units * 0.2), 1))

            invoice_data = dict(
                organization_id=org.id,
                vendor_id=vendor.id if vendor else None,
                contract_id=contract.id if contract else None,
                department_id=dept.id,
                invoice_ref=f"INV-{org.id}-{i + 1:04d}",
                amount=round(billed_rate * billed_units, 2),
                billed_units=billed_units,
                delivered_units=delivered_units,
                billed_rate=billed_rate,
                invoice_date=_random_datetime(rng, days_back=90),
                status="posted",
            )
            invoice_pool.append(invoice_data)

            if rng.random() < duplicate_prob:
                dup = {**invoice_data}
                dup["invoice_ref"] = f"INV-{org.id}-{i + 1:04d}-DUP"
                dup["invoice_date"] = _random_datetime(rng, days_back=30)
                invoice_pool.append(dup)

        for inv_data in invoice_pool:
            db.add(Invoice(**inv_data))
        db.flush()

        resources = profile.get("resources", [])
        for dept in departments:
            for res in resources:
                util = rng.uniform(res.get("utilization_min", 30), res.get("utilization_max", 95))
                provisioned = rng.randint(10, 100)
                active = int(provisioned * util / 100)
                snapshot = ResourceSnapshot(
                    organization_id=org.id,
                    department_id=dept.id,
                    resource_type=res["resource_type"],
                    resource_name=f"{dept.name} - {res['resource_type']}",
                    utilization_pct=round(util, 1),
                    active_units=active,
                    provisioned_units=provisioned,
                    monthly_cost=round(rng.uniform(5_000, 120_000), 2),
                    snapshot_at=datetime.now(UTC),
                )
                db.add(snapshot)
        db.flush()

        db.commit()

        alerts = scan_organization_alerts(db, org.id)
        total_alerts += len(alerts)
        orgs_created += 1

    return {
        "organizations_created": orgs_created,
        "alerts_created": total_alerts,
        "reports_generated": 0,
    }
