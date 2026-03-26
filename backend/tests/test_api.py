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
    assert live_ops_response.json()

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
    assert sla_rules_response.json()

    sla_extractions_response = client.get(f"/api/sla/extractions/{organization_id}")
    assert sla_extractions_response.status_code == 200
    assert sla_extractions_response.json()

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
        json={"source_document_name": "Premium Support Contract.pdf", "document_type": "pdf"},
    )
    assert extraction_response.status_code == 200
    batch = extraction_response.json()
    batch_id = batch["id"]
    candidate_id = batch["candidate_rules"][0]["id"]

    approve_extraction_response = client.post(
        f"/api/sla/extractions/{batch_id}/approve",
        json={"candidate_rules": [{"id": candidate_id, "name": "Premium Response SLA (Reviewed)"}]},
    )
    assert approve_extraction_response.status_code == 200
    assert approve_extraction_response.json()["rules_created"] >= 1

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
