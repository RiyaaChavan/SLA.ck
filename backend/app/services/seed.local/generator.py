import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import (
    Alert,
    ApprovalPolicy,
    ConnectorColumn,
    ConnectorRelation,
    ConnectorRelationCache,
    Contract,
    DashboardSpec,
    DataConnector,
    Department,
    DetectorDefinition,
    Invoice,
    Organization,
    Recommendation,
    ResourceSnapshot,
    SLA,
    SlaExtractionBatch,
    SlaExtractionCandidate,
    SlaRulebookEntry,
    SourceAgentMemory,
    Vendor,
    Workflow,
)
from app.services.connector_crypto import encrypt_connector_uri


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
        ConnectorRelationCache,
        ConnectorColumn,
        ConnectorRelation,
        DashboardSpec,
        SourceAgentMemory,
        DataConnector,
        SlaExtractionCandidate,
        SlaExtractionBatch,
        ApprovalPolicy,
        SlaRulebookEntry,
        SLA,
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

        source_schema = profile.get("source_schema") or {}
        if source_schema:
            synced_at = datetime.now(UTC)
            connector = DataConnector(
                organization_id=org.id,
                name=f"{org.name} Source",
                dialect="postgres",
                encrypted_uri=encrypt_connector_uri(
                    f"postgresql+psycopg://seed:seed@seed.invalid/{org.name.lower().replace(' ', '_')}"
                ),
                status="ready",
                included_schemas=["public"],
                last_sync_at=synced_at,
            )
            db.add(connector)
            db.flush()
            relation_name = source_schema.get("name", "seed_relation")
            relation = ConnectorRelation(
                connector_id=connector.id,
                organization_id=org.id,
                schema_name="public",
                relation_name=relation_name,
                relation_type="table",
                qualified_name=f"public.{relation_name}",
                row_estimate=workflow_count + invoice_count,
                size_bytes=0,
                column_count=len(source_schema.get("sample_columns", [])),
                last_profiled_at=synced_at,
            )
            db.add(relation)
            db.flush()
            for index, column_name in enumerate(source_schema.get("sample_columns", []), start=1):
                db.add(
                    ConnectorColumn(
                        relation_id=relation.id,
                        connector_id=connector.id,
                        organization_id=org.id,
                        schema_name="public",
                        relation_name=relation_name,
                        column_name=column_name,
                        ordinal_position=index,
                        data_type="text",
                        is_nullable=True,
                        column_default=None,
                        is_primary_key=index == 1,
                    )
                )
            db.add(
                ConnectorRelationCache(
                    relation_id=relation.id,
                    connector_id=connector.id,
                    organization_id=org.id,
                    sample_rows=[],
                    column_stats={},
                    preview_row_count=0,
                    refreshed_at=synced_at,
                )
            )
            db.add(
                SourceAgentMemory(
                    organization_id=org.id,
                    connector_id=connector.id,
                    status="pending",
                    engine_name="seed",
                    summary_text="",
                    dashboard_brief="",
                    schema_notes="",
                    raw_payload={},
                )
            )
            db.add(
                DashboardSpec(
                    organization_id=org.id,
                    connector_id=connector.id,
                    status="pending",
                    spec_json={},
                    generated_at=None,
                    version=1,
                )
            )
            db.add_all(
                [
                    DetectorDefinition(
                        organization_id=org.id,
                        connector_id=connector.id,
                        detector_key=f"{org.id}-invoice-variance",
                        name="Invoice variance watch",
                        description="Seeded detector for invoice overbilling anomalies.",
                        module="ProcureWatch",
                        business_domain="finance",
                        severity="high",
                        owner_name="Procurement Controls",
                        enabled=True,
                        logic_type="sql_rule",
                        logic_summary="Flags invoice rows with material variance above contracted rate.",
                        query_logic=(
                            "SELECT invoice_ref, amount, billed_rate "
                            "FROM invoices "
                            "WHERE billed_rate > 0 "
                            "LIMIT 25"
                        ),
                        expected_output_fields=["invoice_ref", "amount", "billed_rate"],
                        linked_action_template="Open discrepancy review and assign Procurement Controls.",
                        linked_cost_formula="sum(amount)",
                        schedule_minutes=60,
                        generation_source="seed",
                        validation_status="valid",
                        last_triggered_at=None,
                        issue_count=0,
                        last_run_at=None,
                        next_run_at=synced_at + timedelta(minutes=60),
                    ),
                    DetectorDefinition(
                        organization_id=org.id,
                        connector_id=connector.id,
                        detector_key=f"{org.id}-workflow-backlog",
                        name="Workflow backlog escalation",
                        description="Seeded detector for open workflows at high SLA risk.",
                        module="SLA Sentinel",
                        business_domain="operations",
                        severity="medium",
                        owner_name="Operations Director",
                        enabled=True,
                        logic_type="sql_rule",
                        logic_summary="Flags workflows with long backlog and unresolved status.",
                        query_logic=(
                            "SELECT id, status, backlog_hours "
                            "FROM workflows "
                            "WHERE status = 'open' "
                            "LIMIT 25"
                        ),
                        expected_output_fields=["id", "status", "backlog_hours"],
                        linked_action_template="Reroute the queue and escalate to the owning manager.",
                        linked_cost_formula="sum(backlog_hours)",
                        schedule_minutes=60,
                        generation_source="seed",
                        validation_status="valid",
                        last_triggered_at=None,
                        issue_count=0,
                        last_run_at=None,
                        next_run_at=synced_at + timedelta(minutes=60),
                    ),
                ]
            )

        db.add(
            SlaRulebookEntry(
                organization_id=org.id,
                name="Premium Support Ticket SLA",
                status="active",
                applies_to={
                    "workflow_category": "support",
                    "priority": "P1",
                    "customer_tier": "premium",
                },
                conditions="Applies to premium P1 support tickets.",
                response_deadline_hours=1,
                resolution_deadline_hours=4,
                penalty_amount=125000.0,
                escalation_owner="Premium Support Director",
                escalation_policy={},
                business_hours_logic="24x7",
                business_hours_definition={},
                auto_action_allowed=False,
                auto_action_policy={},
                source_document_name="seed_rulebook",
                rule_version=1,
            )
        )
        db.add(
            SlaRulebookEntry(
                organization_id=org.id,
                name="Approval Decision SLA",
                status="active",
                applies_to={"workflow": "procurement_approval"},
                conditions="Applies to procurement approvals that block launches or onboarding.",
                response_deadline_hours=2,
                resolution_deadline_hours=8,
                penalty_amount=95000.0,
                escalation_owner="Approvals Director",
                escalation_policy={},
                business_hours_logic="business_hours",
                business_hours_definition={},
                auto_action_allowed=False,
                auto_action_policy={},
                source_document_name="seed_rulebook",
                rule_version=1,
            )
        )
        for dept in departments:
            db.add(
                SLA(
                    organization_id=org.id,
                    department_id=dept.id,
                    name=f"{dept.name} SLA",
                    target_hours=8 if "finance" in dept.category else 4,
                    penalty_per_breach=25000.0,
                )
            )
            db.add(
                SlaRulebookEntry(
                    organization_id=org.id,
                    name=f"{dept.name} active rule",
                    status="active",
                    applies_to={"team": dept.name},
                    conditions=f"Apply to workflows routed to {dept.name}.",
                    response_deadline_hours=2,
                    resolution_deadline_hours=8,
                    penalty_amount=25000.0,
                    escalation_owner=f"{dept.name} Lead",
                    escalation_policy={},
                    business_hours_logic="business_hours",
                    business_hours_definition={},
                    auto_action_allowed=False,
                    auto_action_policy={},
                    source_document_name="seed_rulebook",
                    rule_version=1,
                )
            )

        db.add(
            ApprovalPolicy(
                organization_id=org.id,
                name="Seed approval policy",
                module="Approval Queue",
                scope="organization",
                risk_level="medium",
                enabled=True,
                approver_name="Operations Director",
                allowed_actions=["open_review_task", "reroute_queue"],
                condition_summary="Seeded default approval policy for demo and tests.",
            )
        )
        extraction_batch = SlaExtractionBatch(
            organization_id=org.id,
            source_document_name="Seed Premium Support SLA.pdf",
            document_type="pdf",
            status="pending_review",
            uploaded_at=datetime.now(UTC),
            extraction_source="text_parsed",
            run_metadata={
                "provider": "seed",
                "model": "seed-fixture",
                "notes": "Seeded extraction batch for demo and read-endpoint coverage.",
            },
        )
        db.add(extraction_batch)
        db.flush()
        db.add(
            SlaExtractionCandidate(
                batch_id=extraction_batch.id,
                name="Seed Premium Support Candidate",
                applies_to={
                    "workflow_category": "support",
                    "priority": "P1",
                    "customer_tier": "premium",
                },
                conditions="Premium support incidents require accelerated handling.",
                response_deadline_hours=1,
                resolution_deadline_hours=4,
                penalty_amount=125000.0,
                escalation_owner="Premium Support Director",
                escalation_policy={},
                business_hours_logic="24x7",
                business_hours_definition={},
                auto_action_allowed=False,
                auto_action_policy={},
                status="pending",
                confidence_score=0.94,
                parsing_notes=["Seeded extraction candidate for bootstrapped workspaces."],
                extraction_source="text_parsed",
                candidate_metadata={
                    "business_document": {
                        "executive_summary": "Premium support customers require a one hour response and four hour resolution target.",
                        "service_scope": ["Premium support incidents"],
                        "service_level_commitments": ["Response in 1 hour", "Resolution in 4 hours"],
                        "operational_obligations": ["Escalate to Premium Support Director"],
                        "exclusions_and_assumptions": [],
                        "commercial_terms": ["Penalty per breach: INR 125,000"],
                        "escalation_path": ["Support lead", "Premium Support Director"],
                        "approval_and_governance": [],
                        "risk_watchouts": ["Applies only to correctly tagged premium P1 incidents"],
                    }
                },
            )
        )

        db.commit()

        alerts = scan_organization_alerts(db, org.id)
        total_alerts += len(alerts)
        orgs_created += 1

    return {
        "organizations_created": orgs_created,
        "alerts_created": total_alerts,
        "reports_generated": 0,
    }
