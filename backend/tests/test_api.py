import csv
import sqlite3
from pathlib import Path


def bootstrap_dataset(client):
    seed_response = client.post("/api/bootstrap/seed?reset=true")
    assert seed_response.status_code == 200
    seed_payload = seed_response.json()
    assert seed_payload["organizations_created"] > 0
    assert seed_payload["alerts_created"] > 0

    organizations_response = client.get("/api/organizations")
    assert organizations_response.status_code == 200
    organizations = organizations_response.json()
    assert organizations
    return organizations[0]["id"]


def test_bootstrap_seed_generates_demo_data(client):
    organization_id = bootstrap_dataset(client)

    dashboard_response = client.get(f"/api/dashboard/{organization_id}")
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["metrics"]
    assert dashboard["top_alerts"]


def test_new_read_endpoints_return_seeded_payloads(client):
    organization_id = bootstrap_dataset(client)

    impact_response = client.get(f"/api/impact/{organization_id}")
    assert impact_response.status_code == 200
    impact = impact_response.json()
    assert impact["metrics"]
    assert impact["recent_cases"]

    cases_response = client.get(f"/api/cases/{organization_id}")
    assert cases_response.status_code == 200
    cases = cases_response.json()
    assert cases
    case_id = cases[0]["id"]

    case_detail_response = client.get(f"/api/cases/detail/{case_id}")
    assert case_detail_response.status_code == 200
    case_detail = case_detail_response.json()
    assert case_detail["formula"]["expression"]
    assert case_detail["recommended_action"]["evidence_pack_summary"]

    live_ops_response = client.get(f"/api/live-ops/{organization_id}")
    assert live_ops_response.status_code == 200
    live_ops = live_ops_response.json()
    assert live_ops
    assert "match_rationale" in live_ops[0]
    assert "projected_business_impact" in live_ops[0]

    data_sources_response = client.get(f"/api/data-sources/{organization_id}")
    assert data_sources_response.status_code == 200
    assert data_sources_response.json()

    actions_response = client.get(f"/api/actions/{organization_id}")
    assert actions_response.status_code == 200
    assert actions_response.json()

    detectors_response = client.get(f"/api/detectors/{organization_id}")
    assert detectors_response.status_code == 200
    assert detectors_response.json()

    sla_rules_response = client.get(f"/api/sla/rules/{organization_id}")
    assert sla_rules_response.status_code == 200
    rules = sla_rules_response.json()
    assert rules
    assert "rule_version" in rules[0]

    sla_extractions_response = client.get(f"/api/sla/extractions/{organization_id}")
    assert sla_extractions_response.status_code == 200
    extractions = sla_extractions_response.json()
    assert extractions
    assert "run_metadata" in extractions[0]

    auto_mode_response = client.get(f"/api/auto-mode/{organization_id}")
    assert auto_mode_response.status_code == 200
    assert auto_mode_response.json()["policies"]


def test_write_endpoints_cover_parallel_frontend_contracts(client):
    organization_id = bootstrap_dataset(client)

    draft_response = client.post(
        "/api/detectors/prompt-draft",
        json={
            "organization_id": organization_id,
            "prompt": "Detect premium SLA queues that will likely breach in the next hour.",
        },
    )
    assert draft_response.status_code == 200
    assert draft_response.json()["module"] == "SLA Sentinel"

    create_detector_response = client.post(
        f"/api/detectors/{organization_id}",
        json={
            "name": "Manual Queue Spike Detector",
            "description": "Detect queue spikes in the live ops feed.",
            "module": "SLA Sentinel",
            "business_domain": "operations",
            "severity": "high",
            "owner_name": "Ops Lead",
            "enabled": True,
            "logic_type": "threshold",
            "logic_summary": "Flags queue spikes above the breach threshold.",
            "query_logic": "SELECT * FROM workflows WHERE backlog_hours > 30",
            "expected_output_fields": ["workflow_id", "backlog_hours"],
            "linked_action_template": "Escalate and reroute",
            "linked_cost_formula": "SLA penalty = likely breaches x penalty per breach",
        },
    )
    assert create_detector_response.status_code == 200
    detector_id = create_detector_response.json()["id"]

    detector_test_response = client.post(f"/api/detectors/{detector_id}/test")
    assert detector_test_response.status_code == 200
    assert "issue_count" in detector_test_response.json()

    data_source_response = client.post(
        f"/api/data-sources/{organization_id}/upload",
        json={
            "name": "Regional Ticket Export",
            "source_type": "csv_upload",
            "record_count": 122,
            "file_name": "regional-ticket-export.csv",
            "sample_columns": ["ticket_id", "department", "priority", "expected_by"],
        },
    )
    assert data_source_response.status_code == 200
    assert data_source_response.json()["name"] == "Regional Ticket Export"

    extraction_response = client.post(
        f"/api/sla/extractions/{organization_id}/upload",
        json={
            "source_document_name": "Premium Support Contract.pdf",
            "document_type": "pdf",
            "sample_text": "Premium customers require a P1 response within 1 hour.",
        },
    )
    assert extraction_response.status_code == 200
    batch = extraction_response.json()
    batch_id = batch["id"]
    candidate_id = batch["candidate_rules"][0]["id"]
    assert batch["run_metadata"]["provider"]
    assert batch["candidate_rules"][0]["confidence_score"] > 0

    approve_extraction_response = client.post(
        f"/api/sla/extractions/{batch_id}/approve",
        json={"candidate_rules": [{"id": candidate_id, "name": "Premium Response SLA (Reviewed)"}]},
    )
    assert approve_extraction_response.status_code == 200
    assert approve_extraction_response.json()["rules_created"] >= 1

    create_rule_response = client.post(
        f"/api/sla/rules/{organization_id}",
        json={
            "name": "Warehouse Escalation Rule",
            "status": "active",
            "applies_to": {"workflow_category": "warehouse", "priority": "standard"},
            "conditions": "Apply to warehouse requests.",
            "response_deadline_hours": 2,
            "resolution_deadline_hours": 10,
            "penalty_amount": 25000,
            "escalation_owner": "Warehouse Lead",
        },
    )
    assert create_rule_response.status_code == 200
    created_rule = create_rule_response.json()
    rule_id = created_rule["id"]
    assert created_rule["status"] == "active"

    update_rule_response = client.put(
        f"/api/sla/rules/entry/{rule_id}",
        json={"review_notes": "Reviewed in test", "auto_action_allowed": True},
    )
    assert update_rule_response.status_code == 200
    assert update_rule_response.json()["rule_version"] == 2

    archive_rule_response = client.post(
        f"/api/sla/rules/entry/{rule_id}/archive",
        json={"reviewed_by": "Test Reviewer"},
    )
    assert archive_rule_response.status_code == 200
    assert archive_rule_response.json()["status"] == "archived"

    filtered_rules_response = client.get(
        f"/api/sla/rules/{organization_id}?status=active&search=Premium"
    )
    assert filtered_rules_response.status_code == 200
    assert filtered_rules_response.json()

    filtered_live_ops_response = client.get(
        f"/api/live-ops/{organization_id}?sort=impact&risk=high"
    )
    assert filtered_live_ops_response.status_code == 200


def test_sla_file_upload_endpoint_extracts_from_text_document(client):
    organization_id = bootstrap_dataset(client)

    response = client.post(
        f"/api/sla/extractions/{organization_id}/upload-file",
        files={
            "file": (
                "Premium Support Contract.txt",
                (
                    "MASTER SERVICE AGREEMENT - PREMIUM SUPPORT\n"
                    "Priority: P1\n"
                    "Customer Tier: Premium\n"
                    "Response SLA: within 1 hour\n"
                    "Resolution SLA: within 4 hours\n"
                ).encode("utf-8"),
                "text/plain",
            )
        },
        data={"document_type": "txt"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["document_type"] == "txt"
    assert payload["candidate_rules"]
    assert payload["candidate_rules"][0]["name"]

    actions_response = client.get(f"/api/actions/{organization_id}")
    action_id = actions_response.json()[0]["id"]

    approve_action_response = client.post(
        f"/api/actions/{action_id}/approve",
        json={"approver_name": "Operations Director", "notes": "Approved in test"},
    )
    assert approve_action_response.status_code == 200
    assert approve_action_response.json()["approval_state"] == "approved"

    execute_action_response = client.post(f"/api/actions/{action_id}/execute")
    assert execute_action_response.status_code == 200
    assert execute_action_response.json()["execution_state"] == "executed"

    auto_mode_before = client.get(f"/api/auto-mode/{organization_id}").json()
    policy_id = auto_mode_before["policies"][0]["id"]
    auto_mode_update_response = client.put(
        f"/api/auto-mode/{organization_id}",
        json={"policies": [{"id": policy_id, "enabled": False}]},
    )
    assert auto_mode_update_response.status_code == 200
    updated_policies = auto_mode_update_response.json()["policies"]
    updated_policy = next(item for item in updated_policies if item["id"] == policy_id)
    assert updated_policy["enabled"] is False


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _load_bundle_into_sqlite(bundle_dir: Path, sqlite_path: Path) -> None:
    connection = sqlite3.connect(sqlite_path)
    try:
        for csv_path in sorted(bundle_dir.glob("*.csv")):
            with csv_path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                columns = reader.fieldnames or []
                quoted_columns = ", ".join(f'"{column}" TEXT' for column in columns)
                table_name = csv_path.stem
                connection.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                connection.execute(f'CREATE TABLE "{table_name}" ({quoted_columns})')
                placeholders = ", ".join("?" for _ in columns)
                insert_sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'
                for row in reader:
                    connection.execute(insert_sql, [row.get(column, "") for column in columns])
        connection.commit()
    finally:
        connection.close()


def test_import_synthetic_bundle_endpoint(client, tmp_path):
    bundle_dir = tmp_path / "mini_bundle"
    _write_csv(
        bundle_dir / "organizations.csv",
        ["org_id", "org_name", "industry", "country", "currency_code", "timezone"],
        [
            {
                "org_id": 1,
                "org_name": "Mini Quick Co",
                "industry": "Quick Commerce",
                "country": "India",
                "currency_code": "INR",
                "timezone": "Asia/Kolkata",
            }
        ],
    )
    _write_csv(
        bundle_dir / "cities.csv",
        ["city_id", "city_name", "tier", "state", "population_bucket", "rain_risk_score", "traffic_risk_score", "demand_multiplier"],
        [
            {
                "city_id": 1,
                "city_name": "Bengaluru",
                "tier": "metro",
                "state": "Karnataka",
                "population_bucket": "10m+",
                "rain_risk_score": 0.2,
                "traffic_risk_score": 0.7,
                "demand_multiplier": 1.1,
            }
        ],
    )
    _write_csv(
        bundle_dir / "dark_stores.csv",
        ["store_id", "org_id", "city_id", "store_name", "micro_market", "latitude", "longitude", "opening_hour", "closing_hour", "daily_order_capacity", "pick_capacity_per_hour", "inventory_slot_capacity", "cold_storage_capacity_units", "active_flag"],
        [
            {
                "store_id": 1,
                "org_id": 1,
                "city_id": 1,
                "store_name": "Bengaluru HSR DS-1",
                "micro_market": "HSR",
                "latitude": 12.9,
                "longitude": 77.6,
                "opening_hour": "06:00",
                "closing_hour": "23:59",
                "daily_order_capacity": 500,
                "pick_capacity_per_hour": 45,
                "inventory_slot_capacity": 2200,
                "cold_storage_capacity_units": 180,
                "active_flag": "true",
            }
        ],
    )
    _write_csv(
        bundle_dir / "teams.csv",
        ["team_id", "org_id", "city_id", "store_id", "team_name", "team_type", "parent_team_id", "manager_employee_id", "slack_channel", "escalation_level"],
        [
            {"team_id": 1, "org_id": 1, "city_id": "", "store_id": "", "team_name": "Regional Command", "team_type": "regional_command", "parent_team_id": "", "manager_employee_id": "", "slack_channel": "#regional", "escalation_level": 1},
            {"team_id": 2, "org_id": 1, "city_id": 1, "store_id": "", "team_name": "Bengaluru City Ops", "team_type": "city_ops", "parent_team_id": 1, "manager_employee_id": "", "slack_channel": "#city-ops", "escalation_level": 2},
            {"team_id": 3, "org_id": 1, "city_id": 1, "store_id": 1, "team_name": "Store Ops", "team_type": "dark_store_ops", "parent_team_id": 2, "manager_employee_id": "", "slack_channel": "#store-ops", "escalation_level": 3},
            {"team_id": 4, "org_id": 1, "city_id": 1, "store_id": 1, "team_name": "Fleet Ops", "team_type": "fleet_ops", "parent_team_id": 2, "manager_employee_id": "", "slack_channel": "#fleet-ops", "escalation_level": 3},
            {"team_id": 5, "org_id": 1, "city_id": "", "store_id": "", "team_name": "Procurement Control", "team_type": "procurement", "parent_team_id": 1, "manager_employee_id": "", "slack_channel": "#procurement", "escalation_level": 1},
            {"team_id": 6, "org_id": 1, "city_id": "", "store_id": "", "team_name": "Finance Control", "team_type": "finance_control", "parent_team_id": 1, "manager_employee_id": "", "slack_channel": "#finance", "escalation_level": 1},
        ],
    )
    _write_csv(
        bundle_dir / "employees.csv",
        ["employee_id", "org_id", "team_id", "store_id", "city_id", "employee_name", "role", "manager_employee_id", "employment_type", "shift_type", "tenure_months", "base_monthly_salary_inr", "productivity_score", "attendance_risk_score", "active_flag"],
        [
            {"employee_id": 1, "org_id": 1, "team_id": 1, "store_id": "", "city_id": "", "employee_name": "Regional Head", "role": "regional_ops_head", "manager_employee_id": "", "employment_type": "full_time", "shift_type": "day", "tenure_months": 24, "base_monthly_salary_inr": 200000, "productivity_score": 1.05, "attendance_risk_score": 0.03, "active_flag": "true"},
            {"employee_id": 2, "org_id": 1, "team_id": 2, "store_id": "", "city_id": 1, "employee_name": "City Manager", "role": "city_ops_manager", "manager_employee_id": 1, "employment_type": "full_time", "shift_type": "day", "tenure_months": 18, "base_monthly_salary_inr": 120000, "productivity_score": 1.02, "attendance_risk_score": 0.04, "active_flag": "true"},
            {"employee_id": 3, "org_id": 1, "team_id": 3, "store_id": 1, "city_id": 1, "employee_name": "Store Manager", "role": "dark_store_manager", "manager_employee_id": 2, "employment_type": "full_time", "shift_type": "day", "tenure_months": 12, "base_monthly_salary_inr": 55000, "productivity_score": 0.98, "attendance_risk_score": 0.06, "active_flag": "true"},
            {"employee_id": 4, "org_id": 1, "team_id": 4, "store_id": 1, "city_id": 1, "employee_name": "Fleet Manager", "role": "fleet_manager", "manager_employee_id": 2, "employment_type": "full_time", "shift_type": "day", "tenure_months": 10, "base_monthly_salary_inr": 48000, "productivity_score": 0.95, "attendance_risk_score": 0.07, "active_flag": "true"},
        ],
    )
    _write_csv(
        bundle_dir / "drivers.csv",
        ["driver_id", "org_id", "city_id", "primary_store_id", "fleet_team_id", "driver_name", "vehicle_type", "employment_mode", "tenure_months", "rating", "acceptance_rate", "on_time_rate", "daily_order_capacity", "attendance_risk_score", "active_flag"],
        [
            {"driver_id": 1, "org_id": 1, "city_id": 1, "primary_store_id": 1, "fleet_team_id": 4, "driver_name": "Rider One", "vehicle_type": "bike", "employment_mode": "partner", "tenure_months": 8, "rating": 4.4, "acceptance_rate": 0.91, "on_time_rate": 0.84, "daily_order_capacity": 22, "attendance_risk_score": 0.08, "active_flag": "true"}
        ],
    )
    _write_csv(
        bundle_dir / "vendors.csv",
        ["vendor_id", "org_id", "vendor_name", "vendor_category", "city_scope", "risk_rating", "billing_cycle", "payment_terms_days"],
        [
            {"vendor_id": 1, "org_id": 1, "vendor_name": "FlashFleet Partners", "vendor_category": "last_mile_partner", "city_scope": "all_india", "risk_rating": 0.41, "billing_cycle": "weekly", "payment_terms_days": 14}
        ],
    )
    _write_csv(
        bundle_dir / "contracts.csv",
        ["contract_id", "org_id", "vendor_id", "contract_type", "service_unit", "contracted_rate_inr", "rate_tolerance_pct", "start_date", "end_date", "sla_name", "response_deadline_hours", "resolution_deadline_hours", "penalty_per_breach_inr", "auto_action_allowed"],
        [
            {"contract_id": 1, "org_id": 1, "vendor_id": 1, "contract_type": "last_mile_service", "service_unit": "completed_drop", "contracted_rate_inr": 36.0, "rate_tolerance_pct": 8, "start_date": "2026-01-01", "end_date": "2026-12-31", "sla_name": "FlashFleet SLA", "response_deadline_hours": 1, "resolution_deadline_hours": 6, "penalty_per_breach_inr": 95000, "auto_action_allowed": "true"}
        ],
    )
    _write_csv(
        bundle_dir / "orders.csv",
        ["order_id", "org_id", "city_id", "store_id", "customer_id_hash", "order_ts", "promised_eta_minutes", "actual_delivery_minutes", "basket_value_inr", "discount_value_inr", "delivery_fee_inr", "payment_method", "order_status", "item_count", "distance_km", "assigned_driver_id", "picker_employee_id", "packer_employee_id", "peak_flag", "rain_flag", "surge_flag"],
        [
            {"order_id": 1, "org_id": 1, "city_id": 1, "store_id": 1, "customer_id_hash": "abc123", "order_ts": "2026-03-28T19:00:00+05:30", "promised_eta_minutes": 10, "actual_delivery_minutes": 22, "basket_value_inr": 420.5, "discount_value_inr": 18.0, "delivery_fee_inr": 0, "payment_method": "upi", "order_status": "delivered", "item_count": 5, "distance_km": 2.8, "assigned_driver_id": 1, "picker_employee_id": 3, "packer_employee_id": 3, "peak_flag": "true", "rain_flag": "false", "surge_flag": "true"}
        ],
    )
    _write_csv(
        bundle_dir / "order_items.csv",
        ["order_item_id", "order_id", "sku_id", "sku_name", "category", "quantity", "mrp_inr", "selling_price_inr", "procurement_cost_inr", "substituted_flag", "fulfilled_flag"],
        [
            {"order_item_id": 1, "order_id": 1, "sku_id": 1001, "sku_name": "Milk 1L", "category": "dairy", "quantity": 2, "mrp_inr": 68, "selling_price_inr": 60, "procurement_cost_inr": 46, "substituted_flag": "false", "fulfilled_flag": "true"}
        ],
    )
    _write_csv(
        bundle_dir / "delivery_events.csv",
        ["event_id", "order_id", "driver_id", "store_id", "event_type", "event_ts", "event_sequence", "gps_distance_km", "delay_reason"],
        [
            {"event_id": 1, "order_id": 1, "driver_id": 1, "store_id": 1, "event_type": "delivered", "event_ts": "2026-03-28T19:22:00+05:30", "event_sequence": 7, "gps_distance_km": 2.8, "delay_reason": "rider_shortage"}
        ],
    )
    _write_csv(
        bundle_dir / "inventory_snapshots.csv",
        ["snapshot_id", "snapshot_ts", "store_id", "city_id", "resource_type", "resource_name", "active_units", "provisioned_units", "utilization_pct", "monthly_cost_inr", "shift_staff_present", "shift_staff_planned"],
        [
            {"snapshot_id": 1, "snapshot_ts": "2026-03-28T07:15:00+05:30", "store_id": 1, "city_id": 1, "resource_type": "driver_capacity", "resource_name": "Driver Capacity", "active_units": 8, "provisioned_units": 18, "utilization_pct": 44.44, "monthly_cost_inr": 250000, "shift_staff_present": 8, "shift_staff_planned": 18}
        ],
    )
    _write_csv(
        bundle_dir / "work_items.csv",
        ["work_item_id", "org_id", "city_id", "store_id", "team_id", "item_type", "priority", "opened_at", "expected_by", "resolved_at", "status", "estimated_value_inr", "backlog_hours", "linked_order_id", "linked_vendor_id"],
        [
            {"work_item_id": 1, "org_id": 1, "city_id": 1, "store_id": 1, "team_id": 4, "item_type": "delivery_exception", "priority": "P1", "opened_at": "2026-03-28T19:05:00+05:30", "expected_by": "2026-03-28T20:00:00+05:30", "resolved_at": "", "status": "open", "estimated_value_inr": 800.0, "backlog_hours": 3.0, "linked_order_id": 1, "linked_vendor_id": 1}
        ],
    )
    _write_csv(
        bundle_dir / "invoices.csv",
        ["invoice_id", "org_id", "vendor_id", "contract_id", "store_id", "city_id", "invoice_ref", "invoice_date", "billing_period_start", "billing_period_end", "service_unit_count", "validated_unit_count", "billed_rate_inr", "contracted_rate_inr", "amount_inr", "status"],
        [
            {"invoice_id": 1, "org_id": 1, "vendor_id": 1, "contract_id": 1, "store_id": 1, "city_id": 1, "invoice_ref": "INV-1", "invoice_date": "2026-03-28", "billing_period_start": "2026-03-22", "billing_period_end": "2026-03-28", "service_unit_count": 120, "validated_unit_count": 100, "billed_rate_inr": 42.0, "contracted_rate_inr": 36.0, "amount_inr": 5040.0, "status": "open"}
        ],
    )
    _write_csv(
        bundle_dir / "ground_truth_anomalies.csv",
        ["anomaly_id", "entity_type", "entity_id", "anomaly_type", "module", "severity", "start_ts", "end_ts", "projected_impact_inr", "realized_impact_inr", "formula_name", "formula_inputs_json", "root_cause", "recommended_action", "required_team_type", "required_role", "expected_approver_role"],
        [
            {"anomaly_id": "A-1", "entity_type": "invoice", "entity_id": 1, "anomaly_type": "contract_rate_drift", "module": "ProcureWatch", "severity": "high", "start_ts": "2026-03-28T09:00:00+05:30", "end_ts": "", "projected_impact_inr": 720.0, "realized_impact_inr": "", "formula_name": "invoice_leakage", "formula_inputs_json": "{\"service_unit_count\":120}", "root_cause": "Rate drift", "recommended_action": "open_procurement_review", "required_team_type": "procurement", "required_role": "procurement_manager", "expected_approver_role": "finance_controller"}
        ],
    )
    _write_csv(
        bundle_dir / "approval_playbooks.csv",
        ["anomaly_type", "risk_level", "recommended_action", "required_team_type", "required_role", "approver_role", "auto_mode_allowed"],
        [
            {"anomaly_type": "contract_rate_drift", "risk_level": "high", "recommended_action": "open_procurement_review", "required_team_type": "procurement", "required_role": "procurement_manager", "approver_role": "finance_controller", "auto_mode_allowed": "false"}
        ],
    )

    response = client.post(
        "/api/bootstrap/import-synthetic-bundle",
        json={"bundle_path": str(bundle_dir), "bundle_name": "quick_commerce_v1", "reset": True},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["organization_name"] == "Mini Quick Co"
    assert payload["alerts_generated"] >= 1

    organizations_response = client.get("/api/organizations")
    assert organizations_response.status_code == 200
    organizations = organizations_response.json()
    assert len(organizations) == 1

    organization_id = organizations[0]["id"]
    impact_response = client.get(f"/api/impact/{organization_id}")
    assert impact_response.status_code == 200
    assert impact_response.json()["recent_cases"]

    live_ops_response = client.get(f"/api/live-ops/{organization_id}")
    assert live_ops_response.status_code == 200
    live_ops = live_ops_response.json()
    assert live_ops
    assert all(item["status"] in {"open", "pending", "active"} for item in live_ops)

    sqlite_path = tmp_path / "mini_source.db"
    _load_bundle_into_sqlite(bundle_dir, sqlite_path)
    relational_response = client.post(
        "/api/bootstrap/import-relational-source",
        json={"database_url": f"sqlite:///{sqlite_path}", "schema": "main", "reset": True},
    )
    assert relational_response.status_code == 200
    relational_payload = relational_response.json()
    assert relational_payload["organization_name"] == "Mini Quick Co"
    assert relational_payload["alerts_generated"] >= 1

    connect_response = client.post(
        "/api/data-sources/connect-relational",
        json={
            "database_url": f"sqlite:///{sqlite_path}",
            "schema": "main",
            "reset": True,
            "schema_notes": "Orders, invoices, and work_items are the key operational tables.",
        },
    )
    assert connect_response.status_code == 200
    connect_payload = connect_response.json()
    assert connect_payload["organization_name"] == "Mini Quick Co"

    connected_organization_id = connect_payload["organization_id"]

    datasets_response = client.get(f"/api/data-sources/{connected_organization_id}/datasets")
    assert datasets_response.status_code == 200
    datasets = datasets_response.json()
    assert any(item["name"] == "orders.csv" for item in datasets)

    preview_response = client.get(
        f"/api/data-sources/{connected_organization_id}/datasets/orders.csv/preview"
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["rows"]

    memory_response = client.get(f"/api/data-sources/{connected_organization_id}/agent-memory")
    assert memory_response.status_code == 200
    memory_payload = memory_response.json()
    assert "orders" in memory_payload["summary_text"].lower()
    assert memory_payload["memory_path"]

    anomaly_queries_response = client.get(
        f"/api/data-sources/{connected_organization_id}/anomaly-queries"
    )
    assert anomaly_queries_response.status_code == 200
    anomaly_queries = anomaly_queries_response.json()
    assert anomaly_queries
    assert any("sql_text" in item for item in anomaly_queries)
