from datetime import UTC, datetime, timedelta
from random import Random

from faker import Faker
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.domain import (
    Contract,
    Department,
    Invoice,
    Organization,
    ResourceSnapshot,
    SchemaMapping,
    SLA,
    SourceUpload,
    Vendor,
    Workflow,
)
from app.services.alerts.detector import scan_organization_alerts
from app.services.etl.normalizer import suggest_mappings
from app.services.reporting.reporter import generate_pdf_report
from app.services.seed.profile_loader import load_profiles


fake = Faker()


def reset_database(db: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()


def seed_database(db: Session, *, reset: bool = False) -> dict:
    if reset:
        reset_database(db)
    if db.scalar(select(Organization.id).limit(1)):
        return {"organizations_created": 0, "alerts_created": 0, "reports_generated": 0}

    profiles = load_profiles()
    organizations_created = 0
    total_alerts = 0
    reports_generated = 0
    now = datetime.now(UTC)

    for profile in profiles:
        random = Random(profile["seed"])
        org = Organization(
            name=profile["organization"]["name"],
            industry=profile["organization"]["industry"],
            geography=profile["organization"]["geography"],
        )
        db.add(org)
        db.flush()
        organizations_created += 1

        departments: list[Department] = []
        for department_profile in profile["departments"]:
            department = Department(
                organization_id=org.id,
                name=department_profile["name"],
                category=department_profile["category"],
                capacity_score=department_profile["capacity_score"],
            )
            db.add(department)
            departments.append(department)
        db.flush()

        vendors: list[Vendor] = []
        for vendor_profile in profile["vendors"]:
            vendor = Vendor(
                organization_id=org.id,
                name=vendor_profile["name"],
                category=vendor_profile["category"],
                risk_rating=vendor_profile["risk_rating"],
            )
            db.add(vendor)
            vendors.append(vendor)
        db.flush()

        contracts: list[Contract] = []
        for vendor in vendors:
            contract = Contract(
                organization_id=org.id,
                vendor_id=vendor.id,
                service_unit="service_unit",
                contracted_rate=random.randint(700, 1600),
                start_date=now - timedelta(days=180),
                end_date=now + timedelta(days=365),
            )
            db.add(contract)
            contracts.append(contract)
        db.flush()

        for department in departments:
            db.add(
                SLA(
                    organization_id=org.id,
                    department_id=department.id,
                    name=f"{department.name} Primary SLA",
                    target_hours=random.randint(8, 24),
                    penalty_per_breach=random.randint(25_000, 90_000),
                )
            )
        db.flush()

        workflow_count = profile["workload"]["workflow_count"]
        invoice_count = profile["workload"]["invoice_count"]
        resource_profiles = profile["resources"]

        for _ in range(workflow_count):
            department = random.choice(departments)
            vendor = random.choice(vendors)
            opened_at = now - timedelta(hours=random.randint(8, 140))
            expected_by = opened_at + timedelta(hours=random.randint(8, 36))
            delayed = random.random() < profile["anomalies"]["sla_delay_probability"]
            if delayed:
                expected_by = now - timedelta(hours=random.randint(2, 48))
            db.add(
                Workflow(
                    organization_id=org.id,
                    department_id=department.id,
                    vendor_id=vendor.id,
                    workflow_type=random.choice(profile["workload"]["workflow_types"]),
                    status="open",
                    opened_at=opened_at,
                    expected_by=expected_by,
                    resolved_at=None,
                    estimated_value=random.randint(150_000, 1_200_000),
                    backlog_hours=random.uniform(4, 72),
                )
            )

        for invoice_index in range(invoice_count):
            department = random.choice(departments)
            vendor = random.choice(vendors)
            vendor_index = vendors.index(vendor)
            contract = contracts[vendor_index]
            billed_units = random.randint(80, 550)
            delivered_units = max(billed_units - random.randint(0, 45), 0)
            billed_rate = contract.contracted_rate * random.uniform(0.95, 1.2)
            duplicate_cluster = random.random() < profile["anomalies"]["duplicate_invoice_probability"]
            invoice_ref = fake.bothify(text=f"{org.name[:3].upper()}-INV-#####")
            amount = billed_units * billed_rate
            invoice_date = now - timedelta(days=random.randint(1, 90))
            db.add(
                Invoice(
                    organization_id=org.id,
                    vendor_id=vendor.id,
                    contract_id=contract.id,
                    department_id=department.id,
                    invoice_ref=invoice_ref,
                    amount=round(amount, 2),
                    billed_units=billed_units,
                    delivered_units=delivered_units,
                    billed_rate=round(billed_rate, 2),
                    invoice_date=invoice_date,
                    status="open",
                )
            )
            if duplicate_cluster and invoice_index % 5 == 0:
                db.add(
                    Invoice(
                        organization_id=org.id,
                        vendor_id=vendor.id,
                        contract_id=contract.id,
                        department_id=department.id,
                        invoice_ref=f"{invoice_ref}-DUP",
                        amount=round(amount, 2),
                        billed_units=billed_units,
                        delivered_units=delivered_units,
                        billed_rate=round(billed_rate, 2),
                        invoice_date=invoice_date,
                        status="open",
                    )
                )

        for resource_profile in resource_profiles:
            for department in departments:
                utilization = random.uniform(
                    resource_profile["utilization_min"], resource_profile["utilization_max"]
                )
                if random.random() < profile["anomalies"]["resource_overload_probability"]:
                    utilization = random.uniform(112, 145)
                if random.random() < profile["anomalies"]["resource_underuse_probability"]:
                    utilization = random.uniform(12, 32)
                provisioned_units = random.randint(20, 200)
                active_units = max(int(provisioned_units * min(utilization, 100) / 100), 1)
                db.add(
                    ResourceSnapshot(
                        organization_id=org.id,
                        department_id=department.id,
                        resource_type=resource_profile["resource_type"],
                        resource_name=f"{department.name} {resource_profile['resource_type']}",
                        utilization_pct=round(utilization, 2),
                        active_units=active_units,
                        provisioned_units=provisioned_units,
                        monthly_cost=random.randint(75_000, 450_000),
                        snapshot_at=now,
                    )
                )

        sample_columns = profile["source_schema"]["sample_columns"]
        db.add(
            SchemaMapping(
                organization_id=org.id,
                source_name=profile["source_schema"]["name"],
                source_type=profile["source_schema"]["type"],
                raw_schema={"columns": sample_columns},
                mapped_schema=suggest_mappings(sample_columns),
                confidence_score=0.87,
                status="confirmed",
            )
        )
        db.add(
            SourceUpload(
                organization_id=org.id,
                name=profile["source_schema"]["name"],
                source_kind=profile["source_schema"]["type"],
                record_count=workflow_count + invoice_count,
                file_path=f"/synthetic/{profile['file_name']}",
            )
        )
        db.commit()

        alerts = scan_organization_alerts(db, org.id)
        total_alerts += len(alerts)
        generate_pdf_report(db, organization_id=org.id, title=f"{org.name} Weekly Cost Intelligence Brief")
        reports_generated += 1

    return {
        "organizations_created": organizations_created,
        "alerts_created": total_alerts,
        "reports_generated": reports_generated,
    }
