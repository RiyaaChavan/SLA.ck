from datetime import UTC, datetime, timedelta
from random import Random

from faker import Faker
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.domain import (
    ApprovalPolicy,
    Contract,
    DetectorDefinition,
    Department,
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
from app.services.etl.normalizer import suggest_mappings
from app.services.reporting.reporter import generate_pdf_report
from app.services.seed.profile_loader import load_profiles


fake = Faker()


DETECTOR_SEEDS = [
    {
        "detector_key": "duplicate_spend",
        "name": "Duplicate Spend Cluster",
        "description": "Detect invoice clusters with the same vendor, amount, and department signature.",
        "module": "ProcureWatch",
        "business_domain": "procurement",
        "severity": "high",
        "owner_name": "Procurement Analytics Lead",
        "logic_type": "rule_sql",
        "logic_summary": "Groups invoice signatures and flags duplicates beyond the first matched record.",
        "query_logic": "SELECT vendor_id, amount, department_id FROM invoices GROUP BY 1,2,3 HAVING COUNT(*) > 1",
        "expected_output_fields": ["invoice_id", "vendor_id", "amount", "duplicate_cluster_size"],
        "linked_action_template": "Hold duplicate payment after approval",
        "linked_cost_formula": "Duplicate spend = overlapping paid amount",
    },
    {
        "detector_key": "rate_mismatch",
        "name": "Contract Rate Drift Monitor",
        "description": "Compare billed rate against contracted rate and tolerance bands.",
        "module": "ProcureWatch",
        "business_domain": "procurement",
        "severity": "high",
        "owner_name": "Procurement Analytics Lead",
        "logic_type": "rule_sql",
        "logic_summary": "Flags invoices billed more than 8 percent above the contracted rate.",
        "query_logic": "SELECT * FROM invoices WHERE billed_rate > contracted_rate * 1.08",
        "expected_output_fields": ["invoice_id", "vendor_id", "billed_rate", "contracted_rate"],
        "linked_action_template": "Open commercial rate review",
        "linked_cost_formula": "Invoice leakage = (billed_rate - contracted_rate) x billed_units",
    },
    {
        "detector_key": "vendor_discrepancy",
        "name": "Vendor Reconciliation Watch",
        "description": "Detect mismatches between billed and delivered vendor units.",
        "module": "ProcureWatch",
        "business_domain": "procurement",
        "severity": "medium",
        "owner_name": "Finance Reconciliation Lead",
        "logic_type": "reconciliation",
        "logic_summary": "Compares invoice units to validated delivery units for each payable record.",
        "query_logic": "SELECT * FROM invoices WHERE billed_units > delivered_units",
        "expected_output_fields": ["invoice_id", "billed_units", "delivered_units", "variance_amount"],
        "linked_action_template": "Create discrepancy review and vendor dispute",
        "linked_cost_formula": "Reconciliation mismatch = (billed_units - delivered_units) x billed_rate",
    },
    {
        "detector_key": "sla_risk",
        "name": "Queue Breach Forecaster",
        "description": "Predict live queue items that are likely to breach SLA.",
        "module": "SLA Sentinel",
        "business_domain": "operations",
        "severity": "high",
        "owner_name": "Operations Command Lead",
        "logic_type": "threshold",
        "logic_summary": "Flags delayed workflows when backlog and countdown imply likely penalty exposure.",
        "query_logic": "SELECT * FROM workflows WHERE expected_by < NOW() OR backlog_hours > 24",
        "expected_output_fields": ["workflow_id", "delay_hours", "projected_penalty", "department_id"],
        "linked_action_template": "Reroute queue and escalate manager approval",
        "linked_cost_formula": "SLA penalty = likely breaches x penalty per breach",
    },
    {
        "detector_key": "resource_overload",
        "name": "Operational Overload Monitor",
        "description": "Catch team or resource overload that can trigger service delays.",
        "module": "SLA Sentinel",
        "business_domain": "operations",
        "severity": "high",
        "owner_name": "Operations Command Lead",
        "logic_type": "threshold",
        "logic_summary": "Flags resources running materially above sustainable utilization.",
        "query_logic": "SELECT * FROM resource_snapshots WHERE utilization_pct > 110",
        "expected_output_fields": ["resource_snapshot_id", "utilization_pct", "monthly_cost"],
        "linked_action_template": "Rebalance work to a lower-load peer team",
        "linked_cost_formula": "Overload loss = monthly_cost x overload_pct + intervention buffer",
    },
    {
        "detector_key": "resource_waste",
        "name": "Underused Capacity Sweep",
        "description": "Detect underutilized infrastructure, seats, or capacity pools.",
        "module": "SLA Sentinel",
        "business_domain": "operations",
        "severity": "medium",
        "owner_name": "Platform Efficiency Lead",
        "logic_type": "threshold",
        "logic_summary": "Flags resources operating materially below target utilization.",
        "query_logic": "SELECT * FROM resource_snapshots WHERE utilization_pct < 35",
        "expected_output_fields": ["resource_snapshot_id", "utilization_pct", "monthly_cost"],
        "linked_action_template": "Reclaim or downsize unused capacity",
        "linked_cost_formula": "Unused capacity = monthly_cost x (1 - utilization_pct/100)",
    },
]


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

        for detector_seed in DETECTOR_SEEDS:
            db.add(DetectorDefinition(organization_id=org.id, **detector_seed))
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
        db.add(
            SourceUpload(
                organization_id=org.id,
                name=f"{org.name} SLA Library",
                source_kind="document_bundle",
                record_count=len(departments),
                file_path=f"/synthetic/{org.name.lower().replace(' ', '-')}-sla-library.pdf",
            )
        )
        db.add(
            SchemaMapping(
                organization_id=org.id,
                source_name=f"{org.name} Live Ops Feed",
                source_type="workflow_export",
                raw_schema={"columns": ["workflow_id", "department", "status", "expected_by", "backlog_hours"]},
                mapped_schema=suggest_mappings(
                    ["workflow_id", "department", "status", "expected_by", "backlog_hours"]
                ),
                confidence_score=0.82,
                status="preview_ready",
            )
        )

        for department in departments:
            team_sla = db.scalar(
                select(SLA).where(
                    SLA.organization_id == org.id,
                    SLA.department_id == department.id,
                )
            )
            if team_sla is None:
                continue
            db.add(
                SlaRulebookEntry(
                    organization_id=org.id,
                    name=f"{department.name} Operational Rule",
                    status="active",
                    applies_to={"department": department.name, "priority": "standard"},
                    conditions=f"Apply when {department.name} owned work enters the monitored queue.",
                    response_deadline_hours=max(team_sla.target_hours // 2, 1),
                    resolution_deadline_hours=team_sla.target_hours,
                    penalty_amount=team_sla.penalty_per_breach,
                    escalation_owner=f"{department.name} Director",
                    business_hours_logic="Business hours",
                    auto_action_allowed=department.category.lower() != "finance",
                    source_document_name=f"{department.name} SLA Schedule.pdf",
                    last_reviewed_at=now - timedelta(days=random.randint(2, 15)),
                )
            )

        extraction_batch = SlaExtractionBatch(
            organization_id=org.id,
            source_document_name=f"{org.name} Master Services Agreement.pdf",
            status="pending_review",
            uploaded_at=now - timedelta(days=random.randint(1, 3)),
        )
        db.add(extraction_batch)
        db.flush()
        db.add(
            SlaExtractionCandidate(
                batch_id=extraction_batch.id,
                name="Premium Escalation SLA",
                applies_to={"priority": "P1", "customer_tier": "premium"},
                conditions="Apply for premium or penalty-bearing incidents.",
                response_deadline_hours=1,
                resolution_deadline_hours=6,
                penalty_amount=random.randint(60_000, 120_000),
                escalation_owner="Operations Director",
                business_hours_logic="24x7",
                auto_action_allowed=True,
                status="pending",
            )
        )
        db.add(
            SlaExtractionCandidate(
                batch_id=extraction_batch.id,
                name="Vendor Dispute Follow-up SLA",
                applies_to={"workflow": "vendor_dispute"},
                conditions="Apply to procurement or finance discrepancy cases.",
                response_deadline_hours=8,
                resolution_deadline_hours=24,
                penalty_amount=random.randint(20_000, 50_000),
                escalation_owner="Procurement Head",
                business_hours_logic="Business hours",
                auto_action_allowed=False,
                status="pending",
            )
        )

        db.add(
            ApprovalPolicy(
                organization_id=org.id,
                name="Auto reroute medium-risk queues",
                module="SLA Sentinel",
                scope="queue:live-ops",
                risk_level="medium",
                enabled=True,
                approver_name="Operations Director",
                allowed_actions=["notify_owner", "reroute_queue", "open_review_task"],
                condition_summary="Allow auto-reroute for SLA Sentinel queues for the next two hours.",
                expires_at=now + timedelta(hours=2),
            )
        )
        db.add(
            ApprovalPolicy(
                organization_id=org.id,
                name="Auto open discrepancy cases",
                module="ProcureWatch",
                scope="procurement:invoice-review",
                risk_level="medium",
                enabled=True,
                approver_name="Finance Controller",
                allowed_actions=["open_review_task", "notify_procurement"],
                condition_summary="Auto-open discrepancy cases above threshold but do not hold payment.",
                expires_at=now + timedelta(hours=6),
            )
        )
        db.add(
            ApprovalPolicy(
                organization_id=org.id,
                name="High-risk action guardrail",
                module="ProcureWatch",
                scope="payments:hold-release",
                risk_level="high",
                enabled=False,
                approver_name="Finance Controller",
                allowed_actions=["hold_fund_release", "vendor_dispute"],
                condition_summary="High-risk financial actions always require explicit approval.",
                expires_at=None,
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
