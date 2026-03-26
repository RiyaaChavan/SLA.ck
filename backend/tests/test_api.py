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


def test_agentic_ticket_intake_matches_premium_support_sla(client):
    organization_id = bootstrap_dataset(client)

    response = client.post(
        f"/api/intake/tickets/{organization_id}",
        json={
            "title": "P1 premium checkout outage",
            "description": "Premium users are blocked and need urgent support escalation.",
            "estimated_value": 325000,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"]["workflow_category"] == "support"
    assert payload["classification"]["priority"] == "P1"
    assert payload["classification"]["customer_tier"] == "premium"
    assert payload["live_item"]["assigned_sla_name"] == "Premium Support Ticket SLA"
    assert payload["live_item"]["predicted_breach_risk"] in {"high", "critical"}


def test_agentic_approval_intake_returns_approval_preview(client):
    organization_id = bootstrap_dataset(client)

    response = client.post(
        f"/api/intake/approvals/{organization_id}",
        json={
            "title": "Urgent vendor onboarding approval",
            "description": "Procurement approval is blocking a launch-critical vendor rollout.",
            "requested_action_type": "open_review_task",
            "estimated_value": 540000,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"]["workflow_type"] == "procurement_approval"
    assert payload["live_item"]["assigned_sla_name"] == "Approval Decision SLA"
    assert payload["approval_preview"] is not None
    assert "recommended_approver" in payload["approval_preview"]
