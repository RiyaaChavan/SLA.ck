import type {
  AgenticClassification,
  AgenticIntakeResult,
  ApprovalIntakePayload,
  CaseSummary,
  CasesListParams,
  DashboardRender,
  DetectorDefinition,
  LiveWorkItem,
  TicketIntakePayload,
} from "../../domain/business-sentry";
import type {
  ActionMutationResponse,
  BusinessSentryAdapter,
  DataSourceUploadResponse,
  DetectorCreateResponse,
  SlaBatchMutationResponse,
} from "./contract";
import {
  getMockCaseDetail,
  MOCK_ACTIONS_SEED,
  MOCK_AUTO_MODE,
  MOCK_CASES,
  MOCK_DATA_SOURCES,
  MOCK_DETECTORS,
  MOCK_LIVE_OPS,
  MOCK_SLA_BATCHES,
  MOCK_SLA_RULES,
  mockImpact,
} from "./mockData";

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

let mockActions = clone(MOCK_ACTIONS_SEED);
let mockDetectors = clone(MOCK_DETECTORS);
let mockSlaBatches = clone(MOCK_SLA_BATCHES);
let mockSlaRules = clone(MOCK_SLA_RULES);
let mockAutoMode = clone(MOCK_AUTO_MODE);

const severityRank: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function applyCaseFilters(cases: CaseSummary[], p: CasesListParams): CaseSummary[] {
  return cases.filter((c) => {
    if (p.severity && c.severity !== p.severity) return false;
    if (p.status && c.status !== p.status) return false;
    if (p.module && c.module !== p.module) return false;
    if (p.team && c.team !== p.team) return false;
    if (p.vendor && c.vendor !== p.vendor) return false;
    if (p.detector && c.detector_name !== p.detector) return false;
    if (p.approver && c.approver_name !== p.approver) return false;
    if (p.action_state && c.action_state !== p.action_state) return false;
    return true;
  });
}

function applyCaseSort(cases: CaseSummary[], sort?: string): CaseSummary[] {
  const list = [...cases];
  const s = sort ?? "severity";
  if (s === "severity") {
    list.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  } else if (s === "cost_impact") {
    list.sort((a, b) => b.projected_impact - a.projected_impact);
  } else if (s === "deadline") {
    list.sort((a, b) => (a.sla_countdown_minutes ?? 99999) - (b.sla_countdown_minutes ?? 99999));
  } else if (s === "sla_risk") {
    const r: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    list.sort((a, b) => (r[a.sla_risk_level] ?? 9) - (r[b.sla_risk_level] ?? 9));
  } else if (s === "newest") {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (s === "status") {
    list.sort((a, b) => a.status.localeCompare(b.status));
  }
  return list;
}

export const mockBusinessSentryAdapter: BusinessSentryAdapter = {
  async getImpact(organizationId) {
    await delay();
    const data = mockImpact(organizationId);
    data.recent_cases = applyCaseSort(
      applyCaseFilters(
        MOCK_CASES.map((c) => ({ ...c, organization_id: organizationId })),
        {},
      ),
      "newest",
    ).slice(0, 3);
    return data;
  },

  async getDashboardRender(organizationId): Promise<DashboardRender> {
    await delay();
    const impact = mockImpact(organizationId);
    return {
      organization: impact.organization,
      title: `${impact.organization.name} anomaly dashboard`,
      subtitle: "Generated dashboard preview from mock data.",
      metrics: impact.metrics.slice(0, 4),
      widgets: [
        {
          kind: "list",
          title: "Top vendors by projected impact",
          empty_copy: "No vendor anomalies.",
          items: impact.top_vendors_by_risk.map((item) => ({
            label: item.vendor,
            value: item.projected_impact,
          })),
          rows: [],
        },
        {
          kind: "list",
          title: "Top teams by overload",
          empty_copy: "No overloaded teams.",
          items: impact.top_teams_by_overload.map((item) => ({
            label: item.team,
            value: item.open_items,
          })),
          rows: [],
        },
      ],
    };
  },

  async listCases(organizationId, params) {
    await delay();
    const scoped = MOCK_CASES.map((c) => ({ ...c, organization_id: organizationId }));
    const filtered = applyCaseFilters(scoped, params);
    return applyCaseSort(filtered, params.sort);
  },

  async getCaseDetail(caseId) {
    await delay();
    return getMockCaseDetail(caseId);
  },

  async listLiveOps(_organizationId) {
    await delay();
    return clone(MOCK_LIVE_OPS);
  },

  async createTicketIntake(_organizationId, body: TicketIntakePayload): Promise<AgenticIntakeResult> {
    await delay();
    const workflow_id = (Date.now() % 900_000) + 100_000;
    const id = String(workflow_id);
    const classification: AgenticClassification = {
      workflow_type: "support_ticket",
      workflow_category: "support",
      issue_type: "support_ticket",
      priority: "standard",
      customer_tier: "standard",
      business_unit: "support",
      department_name: body.department_name?.trim() || "Operations",
      vendor_name: body.vendor_name?.trim() || null,
      suggested_backlog_hours: body.backlog_hours ?? 12,
      inferred_estimated_value: 150000,
      risk_flags: [],
      detected_sla_signals: [],
      should_raise_alert: false,
      confidence: 0.72,
      rationale: ["Mock intake: ticket-like content classified as support.", "Department from payload or default."],
    };
    const approval_preview = null;
    const intakeContext = {
      workflow_id,
      classification,
      approval_preview,
      alert_id: null as number | null,
      recommendation_id: null as number | null,
    };
    const live_item: LiveWorkItem = {
      id,
      item_type: classification.workflow_type,
      title: body.title,
      team: classification.department_name,
      owner_name: "Mock Queue Owner",
      status: body.status ?? "open",
      current_stage: "monitoring",
      assigned_sla_name: "Mock SLA — P2 response",
      response_deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      resolution_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      time_remaining_minutes: 240,
      predicted_breach_risk: "medium",
      projected_penalty: 0,
      projected_business_impact: 0,
      linked_case_id: null,
      suggested_action: "Triage in mock workspace",
      match_rationale: ["Mock rule match for demo intake"],
      workflow_category: classification.workflow_category,
      intakeContext,
    };
    return {
      workflow_id,
      classification,
      live_item,
      alert_id: null,
      recommendation_id: null,
      approval_preview,
    };
  },

  async createApprovalIntake(_organizationId, body: ApprovalIntakePayload): Promise<AgenticIntakeResult> {
    await delay();
    const workflow_id = (Date.now() % 900_000) + 200_000;
    const id = String(workflow_id);
    const classification: AgenticClassification = {
      workflow_type: "approval_task",
      workflow_category: "operations",
      issue_type: "ops_task",
      priority: "standard",
      customer_tier: "standard",
      business_unit: "operations",
      department_name: body.department_name?.trim() || "Finance",
      vendor_name: body.vendor_name?.trim() || null,
      suggested_backlog_hours: body.backlog_hours ?? 24,
      inferred_estimated_value: 250000,
      risk_flags: ["Approval-gated workflow detected."],
      detected_sla_signals: ["Mock approval signal from requested action type."],
      should_raise_alert: false,
      confidence: 0.68,
      rationale: [
        "Mock intake: approval flow from requested_action_type.",
        String(body.requested_action_type ?? "default"),
      ],
    };
    const approval_preview = {
      should_auto_approve: false,
      recommended_approver: "C. Nair",
      reasoning: "Mock approver routing — human review suggested for this payload.",
      confidence: 0.65,
      metadata: {},
    };
    const intakeContext = {
      workflow_id,
      classification,
      approval_preview,
      alert_id: null as number | null,
      recommendation_id: null as number | null,
    };
    const live_item: LiveWorkItem = {
      id,
      item_type: "approval_wait",
      title: body.title,
      team: classification.department_name,
      owner_name: "Mock Approvals Queue",
      status: body.status ?? "open",
      current_stage: "monitoring",
      assigned_sla_name: "Mock SLA — approval turnaround",
      response_deadline: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      resolution_deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      time_remaining_minutes: 480,
      predicted_breach_risk: "low",
      projected_penalty: 0,
      projected_business_impact: 0,
      linked_case_id: null,
      suggested_action: "Route to recommended approver",
      match_rationale: ["Mock approval SLA match"],
      workflow_category: classification.workflow_category,
      intakeContext,
    };
    return {
      workflow_id,
      classification,
      live_item,
      alert_id: null,
      recommendation_id: null,
      approval_preview,
    };
  },

  async listConnectors(_organizationId) {
    await delay();
    return [];
  },

  async createConnector(_organizationId, body) {
    await delay();
    return {
      id: Date.now(),
      organization_id: _organizationId,
      name: body.name,
      dialect: "postgres",
      status: "ready",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      included_schemas: body.included_schemas ?? ["public"],
    };
  },

  async updateConnector(connectorId, body) {
    await delay();
    return {
      id: connectorId,
      organization_id: 0,
      name: body.name ?? "Mock Connector",
      dialect: "postgres",
      status: "ready",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      included_schemas: body.included_schemas ?? ["public"],
    };
  },

  async refreshConnector(connectorId) {
    await delay();
    return {
      id: connectorId,
      organization_id: 0,
      name: "Mock Connector",
      dialect: "postgres",
      status: "ready",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      included_schemas: ["public"],
    };
  },

  async listDataSources(_organizationId) {
    await delay();
    return clone(MOCK_DATA_SOURCES);
  },

  async getDataSourcePreview(_relationId) {
    await delay();
    const source = clone(MOCK_DATA_SOURCES[0]);
    return {
      id: source.id,
      name: source.name,
      schema: source.schema ?? "mock",
      source_uri: source.qualified_name ?? "mock://source",
      row_count: source.preview_row_count ?? 0,
      columns: source.schema_preview,
      rows: [],
    };
  },

  async getSourceMemory() {
    await delay();
    return null;
  },

  async uploadDataSource(_organizationId, body) {
    await delay();
    return {
      upload_id: `upl-${Date.now()}`,
      status: "accepted",
      message: `Metadata recorded for ${body.file_name ?? body.name} (stub phase 1).`,
    };
  },

  async listDetectors(_organizationId) {
    await delay();
    return clone(mockDetectors);
  },

  async listDetectorRuns() {
    await delay();
    return [];
  },

  async createDetector(_organizationId, body) {
    await delay();
    const id = `det-${Date.now()}`;
    const d: DetectorDefinition = {
      id,
      name: body.name ?? "New detector",
      description: body.description ?? "",
      module: body.module ?? "procure_watch",
      business_domain: body.business_domain ?? "general",
      severity: body.severity ?? "medium",
      owner_name: body.owner_name ?? "Unassigned",
      enabled: body.enabled ?? true,
      logic_type: body.logic_type ?? "sql_rule",
      logic_summary: body.logic_summary ?? "",
      query_logic: body.query_logic ?? "--",
      expected_output_fields: body.expected_output_fields ?? [],
      linked_action_template: body.linked_action_template ?? "",
      linked_cost_formula: body.linked_cost_formula ?? "",
      schedule_minutes: body.schedule_minutes ?? 60,
      generation_source: "manual",
      validation_status: "valid",
      last_triggered_at: null,
      issue_count: 0,
    };
    mockDetectors = [...mockDetectors, d];
    return { id, name: d.name, enabled: d.enabled };
  },

  async promptDraftDetector(prompt) {
    await delay();
    return {
      draft: {
        name: `Draft: ${prompt.slice(0, 40)}${prompt.length > 40 ? "…" : ""}`,
        description: "Deterministic draft generated from the mock adapter.",
        module: "procure_watch",
        business_domain: "finance",
        severity: "medium",
        owner_name: "Mock Operations",
        enabled: true,
        logic_type: "sql_rule",
        logic_summary: "Deterministic stub: compare billed rate to contract catalog by vendor SKU.",
        query_logic: `-- stub draft\n-- prompt: ${prompt.slice(0, 120)}`,
        expected_output_fields: ["invoice_line_id", "delta_pct"],
        linked_action_template: "Open a finance review case for the impacted vendor.",
        linked_cost_formula: "sum(delta_pct)",
        schedule_minutes: 60,
      },
    };
  },

  async testDetector(_detectorId) {
    await delay();
    return {
      passed: true,
      sample_rows: [{ invoice_line_id: "L-1", delta_pct: 12.4 }],
      message: "Deterministic stub result",
    };
  },

  async updateDetectorEnabled(detectorId, enabled) {
    await delay();
    const idx = mockDetectors.findIndex((d) => d.id === detectorId);
    if (idx < 0) return null;
    mockDetectors = mockDetectors.map((d, i) => (i === idx ? { ...d, enabled } : d));
    return { ...mockDetectors[idx]! };
  },

  async listSlaRules(_organizationId) {
    await delay();
    return clone(mockSlaRules.filter((r) => r.status !== "archived"));
  },

  async updateSlaRule(ruleId, body) {
    await delay();
    const idx = mockSlaRules.findIndex((r) => r.id === ruleId);
    if (idx < 0) throw new Error("Rule not found");
    const cur = mockSlaRules[idx]!;
    const nextApplies =
      body.applies_to !== undefined
        ? body.applies_to
        : (cur.applies_to_payload ?? { label: cur.applies_to });
    const label =
      typeof (nextApplies as Record<string, unknown>).label === "string"
        ? String((nextApplies as Record<string, unknown>).label)
        : cur.applies_to;
    const { applies_to: _appliesPatch, ...restPatch } = body;
    mockSlaRules = mockSlaRules.map((r, i) =>
      i === idx
        ? {
            ...r,
            ...restPatch,
            applies_to: body.applies_to !== undefined ? label : r.applies_to,
            applies_to_payload: nextApplies as Record<string, unknown>,
            penalty_amount: body.penalty_amount ?? r.penalty_amount,
            response_deadline_hours: body.response_deadline_hours ?? r.response_deadline_hours,
            resolution_deadline_hours: body.resolution_deadline_hours ?? r.resolution_deadline_hours,
            name: body.name ?? r.name,
            conditions: body.conditions ?? r.conditions,
            escalation_owner: body.escalation_owner ?? r.escalation_owner,
            business_hours_logic: body.business_hours_logic ?? r.business_hours_logic,
            auto_action_allowed: body.auto_action_allowed ?? r.auto_action_allowed,
            source_document_name: body.source_document_name ?? r.source_document_name,
            status: body.status ?? r.status,
          }
        : r,
    );
    return clone(mockSlaRules[idx]!);
  },

  async archiveSlaRule(ruleId, _body) {
    await delay();
    mockSlaRules = mockSlaRules.map((r) =>
      r.id === ruleId ? { ...r, status: "archived" } : r,
    );
    const r = mockSlaRules.find((x) => x.id === ruleId);
    if (!r) throw new Error("Rule not found");
    return clone(r);
  },

  async listSlaExtractions(_organizationId) {
    await delay();
    return clone(mockSlaBatches);
  },

  async uploadSlaExtraction(_organizationId, file) {
    await delay();
    const batch_id = String(Date.now());
    const candId = 900000 + (mockSlaBatches.length % 1000);
    mockSlaBatches = [
      ...mockSlaBatches,
      {
        id: batch_id,
        source_document_name: file.name,
        document_type: (file.name.split(".").pop() ?? "txt").toLowerCase(),
        status: "pending_review",
        uploaded_at: new Date().toISOString(),
        extraction_source: "mock_upload",
        run_metadata: { stub: true },
        candidate_rules: [
          {
            id: candId,
            name: "Extracted rule (stub)",
            conditions: "—",
            response_deadline_hours: 8,
            resolution_deadline_hours: 72,
            penalty_amount: 15000,
            status: "pending_review",
            confidence_score: 0.5,
            parsing_notes: ["Stub extraction from filename only"],
            extraction_source: "mock_upload",
          },
        ],
      },
    ];
    return { batch_id, status: "pending_review" };
  },

  async approveSlaBatch(batchId, _candidateRules) {
    await delay();
    const key = String(batchId);
    mockSlaBatches = mockSlaBatches.map((b) =>
      String(b.id) === key ? { ...b, status: "approved" } : b,
    );
    const b = mockSlaBatches.find((x) => String(x.id) === key);
    const n = b?.candidate_rules.length ?? 0;
    return { batch_id: key, status: "approved", rules_created: n };
  },

  async discardSlaBatch(batchId) {
    await delay();
    const key = String(batchId);
    mockSlaBatches = mockSlaBatches.map((b) =>
      String(b.id) === key
        ? {
            ...b,
            status: "discarded",
            candidate_rules: b.candidate_rules.map((c) => ({ ...c, status: "discarded" as const })),
          }
        : b,
    );
    return { batch_id: key, status: "discarded" };
  },

  async discardSlaCandidate(candidateId) {
    await delay();
    const cid = String(candidateId);
    mockSlaBatches = mockSlaBatches.map((b) => ({
      ...b,
      candidate_rules: b.candidate_rules.map((c) =>
        String(c.id) === cid ? { ...c, status: "discarded" as const } : c,
      ),
    }));
  },

  async listActions(_organizationId) {
    await delay();
    return clone(mockActions);
  },

  async approveAction(actionId, _body) {
    await delay();
    mockActions = mockActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            approval_state: "approved",
            execution_state: a.execution_state === "executed" ? "executed" : "ready",
            updated_at: new Date().toISOString(),
          }
        : a,
    );
    const a = mockActions.find((x) => x.id === actionId)!;
    return {
      id: a.id,
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },

  async rejectAction(actionId, _body) {
    await delay();
    mockActions = mockActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            approval_state: "rejected",
            execution_state: "not_started",
            updated_at: new Date().toISOString(),
          }
        : a,
    );
    const a = mockActions.find((x) => x.id === actionId)!;
    return {
      id: a.id,
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },

  async executeAction(actionId) {
    await delay();
    mockActions = mockActions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            approval_state: a.approval_state === "pending" ? "approved" : a.approval_state,
            execution_state: "executed",
            updated_at: new Date().toISOString(),
          }
        : a,
    );
    const a = mockActions.find((x) => x.id === actionId)!;
    return {
      id: a.id,
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },

  async getAutoMode(organizationId) {
    await delay();
    return { ...mockAutoMode, organization_id: organizationId };
  },

  async putAutoMode(organizationId, policies) {
    await delay();
    mockAutoMode = {
      organization_id: organizationId,
      policies: mockAutoMode.policies.map((p) => {
        const u = policies.find((x) => x.id === p.id);
        if (!u) return p;
        return {
          ...p,
          enabled: u.enabled !== undefined ? u.enabled : p.enabled,
          approver_name:
            u.approver_name !== undefined && u.approver_name !== null
              ? u.approver_name
              : p.approver_name,
          condition_summary:
            u.condition_summary !== undefined && u.condition_summary !== null
              ? u.condition_summary
              : p.condition_summary,
          expires_at: u.expires_at !== undefined ? u.expires_at : p.expires_at,
        };
      }),
    };
    return mockAutoMode;
  },

  async rescanAlerts(_organizationId) {
    await delay();
  },
};
