import type { CaseSummary, CasesListParams, DetectorDefinition } from "../../domain/business-sentry";
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

  async listDataSources(_organizationId) {
    await delay();
    return clone(MOCK_DATA_SOURCES);
  },

  async uploadDataSource(_organizationId, fileName) {
    await delay();
    return {
      upload_id: `upl-${Date.now()}`,
      status: "accepted",
      message: `Metadata recorded for ${fileName} (stub phase 1).`,
    };
  },

  async listDetectors(_organizationId) {
    await delay();
    return clone(mockDetectors);
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
        logic_summary: "Deterministic stub: compare billed rate to contract catalog by vendor SKU.",
        query_logic: `-- stub draft\n-- prompt: ${prompt.slice(0, 120)}`,
        expected_output_fields: ["invoice_line_id", "delta_pct"],
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
      String(b.id) === key ? { ...b, status: "discarded" } : b,
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
