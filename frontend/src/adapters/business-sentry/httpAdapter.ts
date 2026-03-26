import type {
  ActionRequest,
  AgenticApprovalPreview,
  AgenticClassification,
  AgenticIntakeResult,
  ApprovalIntakePayload,
  AutoModePolicy,
  AutoModePolicyUpdate,
  AutoModeSettings,
  CasesListParams,
  DataSourceSummary,
  DetectorDefinition,
  LiveWorkItem,
  LiveWorkItemIntakeContext,
  SlaExtractionBatch,
  SlaExtractionCandidate,
  SlaRulebookEntry,
  TicketIntakePayload,
} from "../../domain/business-sentry";
import type {
  ActionDecisionBody,
  BusinessSentryAdapter,
  SlaExtractionCandidateEdit,
  SlaRulebookArchivePayload,
  SlaRulebookEntryUpdatePayload,
} from "./contract";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const jsonBody =
    typeof options?.body === "string" &&
    (options.method === "POST" || options.method === "PUT" || options.method === "PATCH");
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return response.json() as Promise<T>;
}

/** Multipart or other requests where the body sets Content-Type (e.g. FormData). */
async function requestNoJsonBody<T>(path: string, options: RequestInit): Promise<T> {
  const { headers: _h, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, rest);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return response.json() as Promise<T>;
}

function iso(d: string | { toISOString(): string }): string {
  return typeof d === "string" ? d : d.toISOString();
}

function formatAppliesTo(raw: unknown): string {
  if (raw == null) return "—";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.label === "string") return o.label;
    if (typeof o.summary === "string") return o.summary;
    if (typeof o.description === "string") return o.description;
    try {
      return JSON.stringify(o);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

type ApiLiveWorkItemOut = {
  id: number;
  item_type: string;
  title: string;
  team: string | null;
  owner_name: string;
  status: string;
  current_stage: string;
  assigned_sla_name: string | null;
  response_deadline: string | { toISOString(): string } | null;
  resolution_deadline: string | { toISOString(): string } | null;
  time_remaining_minutes: number;
  predicted_breach_risk: string | number;
  projected_penalty: number;
  projected_business_impact?: number;
  linked_case_id: number | null;
  suggested_action: string;
  match_rationale?: string[];
  workflow_category?: string | null;
};

function mapLiveWorkItem(r: ApiLiveWorkItemOut): LiveWorkItem {
  const riskRaw = r.predicted_breach_risk;
  const predicted_breach_risk =
    typeof riskRaw === "number"
      ? riskRaw >= 0.66
        ? "high"
        : riskRaw >= 0.4
          ? "medium"
          : "low"
      : String(riskRaw || "low");
  return {
    id: String(r.id),
    item_type: r.item_type,
    title: r.title,
    team: r.team,
    owner_name: r.owner_name,
    status: r.status,
    current_stage: r.current_stage,
    assigned_sla_name: r.assigned_sla_name,
    response_deadline: r.response_deadline == null ? null : iso(r.response_deadline),
    resolution_deadline: r.resolution_deadline == null ? null : iso(r.resolution_deadline),
    time_remaining_minutes: r.time_remaining_minutes,
    predicted_breach_risk,
    projected_penalty: r.projected_penalty,
    projected_business_impact: r.projected_business_impact ?? 0,
    linked_case_id: r.linked_case_id == null ? null : String(r.linked_case_id),
    suggested_action: r.suggested_action,
    match_rationale: r.match_rationale ?? [],
    workflow_category: r.workflow_category ?? null,
  };
}

type ApiAgenticClassificationOut = {
  workflow_type: string;
  workflow_category: string;
  issue_type: string;
  priority: string;
  customer_tier: string;
  business_unit: string;
  department_name: string;
  vendor_name?: string | null;
  suggested_backlog_hours: number;
  confidence: number;
  rationale?: string[];
};

type ApiAgenticApprovalPreviewOut = {
  should_auto_approve: boolean;
  recommended_approver: string;
  reasoning: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

type ApiAgenticIntakeResultOut = {
  workflow_id: number;
  classification: ApiAgenticClassificationOut;
  live_item: ApiLiveWorkItemOut;
  alert_id: number | null;
  recommendation_id: number | null;
  approval_preview: ApiAgenticApprovalPreviewOut | null;
};

function mapAgenticClassification(c: ApiAgenticClassificationOut): AgenticClassification {
  return {
    workflow_type: c.workflow_type,
    workflow_category: c.workflow_category,
    issue_type: c.issue_type,
    priority: c.priority,
    customer_tier: c.customer_tier,
    business_unit: c.business_unit,
    department_name: c.department_name,
    vendor_name: c.vendor_name ?? null,
    suggested_backlog_hours: c.suggested_backlog_hours,
    confidence: c.confidence,
    rationale: c.rationale ?? [],
  };
}

function mapAgenticApprovalPreview(p: ApiAgenticApprovalPreviewOut): AgenticApprovalPreview {
  return {
    should_auto_approve: p.should_auto_approve,
    recommended_approver: p.recommended_approver,
    reasoning: p.reasoning,
    confidence: p.confidence,
    metadata: p.metadata,
  };
}

function mapAgenticIntakeResult(raw: ApiAgenticIntakeResultOut): AgenticIntakeResult {
  const classification = mapAgenticClassification(raw.classification);
  const approval_preview = raw.approval_preview ? mapAgenticApprovalPreview(raw.approval_preview) : null;
  const intakeContext: LiveWorkItemIntakeContext = {
    workflow_id: raw.workflow_id,
    classification,
    approval_preview,
    alert_id: raw.alert_id ?? null,
    recommendation_id: raw.recommendation_id ?? null,
  };
  const live_item: LiveWorkItem = {
    ...mapLiveWorkItem(raw.live_item),
    intakeContext,
  };
  return {
    workflow_id: raw.workflow_id,
    classification,
    live_item,
    alert_id: raw.alert_id ?? null,
    recommendation_id: raw.recommendation_id ?? null,
    approval_preview,
  };
}

type ApiDataSourceHistoryOut = {
  uploaded_at: string | { toISOString(): string };
  record_count: number;
  file_path: string;
};

type ApiDataSourceSummaryOut = {
  id: number;
  name: string;
  source_type: string;
  status: string;
  freshness_status: string;
  last_synced_at: string | { toISOString(): string };
  record_count: number;
  schema_preview: string[];
  health: string;
  upload_history: ApiDataSourceHistoryOut[];
};

function mapDataSourceSummary(r: ApiDataSourceSummaryOut): DataSourceSummary {
  return {
    id: String(r.id),
    name: r.name,
    source_type: r.source_type,
    status: r.status,
    freshness_status: r.freshness_status,
    last_synced_at: iso(r.last_synced_at),
    record_count: r.record_count,
    schema_preview: r.schema_preview ?? [],
    health: r.health,
    upload_history: (r.upload_history ?? []).map((h) => ({
      at: iso(h.uploaded_at),
      filename: h.file_path?.split(/[/\\]/).pop() ?? h.file_path ?? "—",
      rows: h.record_count,
    })),
  };
}

type ApiSlaRulebookEntryOut = {
  id: number;
  name: string;
  status: string;
  applies_to: Record<string, unknown>;
  conditions: string;
  response_deadline_hours: number;
  resolution_deadline_hours: number;
  penalty_amount: number;
  escalation_owner: string;
  escalation_policy?: Record<string, unknown>;
  business_hours_logic: string;
  business_hours_definition?: Record<string, unknown>;
  auto_action_allowed: boolean;
  auto_action_policy?: Record<string, unknown>;
  source_document_name: string;
  rule_version?: number;
  reviewed_by?: string | null;
  review_notes?: string | null;
  last_reviewed_at: string | { toISOString(): string } | null;
  supersedes_rule_id?: number | null;
  source_batch_id?: number | null;
};

function mapSlaRulebookEntry(r: ApiSlaRulebookEntryOut): SlaRulebookEntry {
  const applies_to_payload = r.applies_to && typeof r.applies_to === "object" ? r.applies_to : {};
  return {
    id: String(r.id),
    name: r.name,
    status: r.status,
    applies_to: formatAppliesTo(r.applies_to),
    applies_to_payload,
    conditions: r.conditions,
    response_deadline_hours: r.response_deadline_hours,
    resolution_deadline_hours: r.resolution_deadline_hours,
    penalty_amount: r.penalty_amount,
    escalation_owner: r.escalation_owner,
    escalation_policy: r.escalation_policy,
    business_hours_logic: r.business_hours_logic,
    business_hours_definition: r.business_hours_definition,
    auto_action_allowed: r.auto_action_allowed,
    auto_action_policy: r.auto_action_policy,
    source_document_name: r.source_document_name,
    rule_version: r.rule_version,
    reviewed_by: r.reviewed_by,
    review_notes: r.review_notes,
    last_reviewed_at: r.last_reviewed_at == null ? null : iso(r.last_reviewed_at),
    source_batch_id: r.source_batch_id ?? null,
  };
}

type ApiSlaCandidateOut = {
  id: number;
  name: string;
  applies_to: Record<string, unknown>;
  conditions: string;
  response_deadline_hours: number;
  resolution_deadline_hours: number;
  penalty_amount: number;
  escalation_owner: string;
  escalation_policy?: Record<string, unknown>;
  business_hours_logic: string;
  business_hours_definition?: Record<string, unknown>;
  auto_action_allowed: boolean;
  auto_action_policy?: Record<string, unknown>;
  status: string;
  confidence_score?: number;
  parsing_notes?: string[];
  extraction_source: string;
  candidate_metadata?: Record<string, unknown>;
};

type ApiSlaBatchOut = {
  id: number;
  source_document_name: string;
  document_type: string;
  status: string;
  uploaded_at: string | { toISOString(): string };
  extraction_source: string;
  run_metadata?: Record<string, unknown>;
  candidate_rules: ApiSlaCandidateOut[];
};

function mapSlaCandidate(c: ApiSlaCandidateOut): SlaExtractionCandidate {
  const appliesPayload = c.applies_to && typeof c.applies_to === "object" ? c.applies_to : {};
  return {
    id: c.id,
    name: c.name,
    applies_to: formatAppliesTo(c.applies_to),
    applies_to_payload: appliesPayload as Record<string, unknown>,
    conditions: c.conditions,
    response_deadline_hours: c.response_deadline_hours,
    resolution_deadline_hours: c.resolution_deadline_hours,
    penalty_amount: c.penalty_amount,
    escalation_owner: c.escalation_owner,
    business_hours_logic: c.business_hours_logic,
    auto_action_allowed: c.auto_action_allowed,
    status: c.status,
    confidence_score: c.confidence_score,
    parsing_notes: c.parsing_notes,
    extraction_source: c.extraction_source,
    candidate_metadata: c.candidate_metadata,
  };
}

function mapSlaBatch(b: ApiSlaBatchOut): SlaExtractionBatch {
  return {
    id: String(b.id),
    source_document_name: b.source_document_name,
    document_type: b.document_type,
    status: b.status,
    uploaded_at: iso(b.uploaded_at),
    extraction_source: b.extraction_source,
    run_metadata: b.run_metadata ?? {},
    candidate_rules: b.candidate_rules.map(mapSlaCandidate),
  };
}

type ApiActionOut = {
  id: number;
  case_id: number;
  title: string;
  recommended_next_step: string;
  rationale: string;
  expected_savings: number;
  avoided_loss: number;
  risk_level: string;
  required_approver: string;
  evidence_pack_summary: string[] | string;
  approval_state: string;
  execution_state: string;
  created_at: string | { toISOString(): string };
  updated_at: string | { toISOString(): string };
  recommendation_id?: number | null;
  alert_title?: string | null;
  alert_type?: string | null;
  action_type?: string | null;
};

function mapAction(a: ApiActionOut): ActionRequest {
  const ev = a.evidence_pack_summary;
  const evidence_pack_summary = Array.isArray(ev)
    ? ev
    : typeof ev === "string" && ev
      ? [ev]
      : [];
  return {
    id: String(a.id),
    case_id: String(a.case_id),
    title: a.title,
    recommended_next_step: a.recommended_next_step,
    rationale: a.rationale,
    expected_savings: a.expected_savings,
    avoided_loss: a.avoided_loss,
    risk_level: a.risk_level,
    required_approver: a.required_approver,
    evidence_pack_summary,
    approval_state: a.approval_state,
    execution_state: a.execution_state,
    created_at: iso(a.created_at),
    updated_at: iso(a.updated_at),
    recommendation_id: a.recommendation_id != null ? String(a.recommendation_id) : null,
    alert_title: (a.alert_title ?? a.title ?? "").trim() || a.title,
    alert_type: a.alert_type ?? null,
    action_type: a.action_type ?? null,
  };
}

type ApiAutoPolicyOut = {
  id: number;
  name: string;
  module: string;
  scope: string;
  risk_level: string;
  enabled: boolean;
  approver_name: string;
  allowed_actions: string[];
  condition_summary: string;
  expires_at: string | { toISOString(): string } | null;
};

type ApiAutoSettingsOut = {
  organization_id: number;
  policies: ApiAutoPolicyOut[];
};

function mapAutoPolicy(p: ApiAutoPolicyOut): AutoModePolicy {
  return {
    id: p.id,
    name: p.name,
    module: p.module,
    scope: p.scope,
    risk_level: p.risk_level,
    enabled: p.enabled,
    approver_name: p.approver_name,
    allowed_actions: p.allowed_actions ?? [],
    condition_summary: p.condition_summary,
    expires_at: p.expires_at == null ? null : iso(p.expires_at),
  };
}

function mapAutoMode(s: ApiAutoSettingsOut): AutoModeSettings {
  return {
    organization_id: s.organization_id,
    policies: s.policies.map(mapAutoPolicy),
  };
}

type ApiSlaReviewResult = {
  batch_id: number;
  status: string;
  rules_created?: number;
};

function mapSlaReviewResult(r: ApiSlaReviewResult) {
  return {
    batch_id: String(r.batch_id),
    status: r.status,
    rules_created: r.rules_created,
  };
}

function casesQuery(params: CasesListParams): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

function scrubCandidateEdits(edits: SlaExtractionCandidateEdit[]) {
  return edits.map((e) =>
    Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)),
  ) as Record<string, unknown>[];
}

export const httpBusinessSentryAdapter: BusinessSentryAdapter = {
  getImpact: (organizationId) => request(`/impact/${organizationId}`),
  listCases: (organizationId, params) =>
    request(`/cases/${organizationId}${casesQuery(params)}`),
  getCaseDetail: (caseId) => request(`/cases/detail/${caseId}`),
  listLiveOps: async (organizationId) => {
    const rows = await request<ApiLiveWorkItemOut[]>(`/live-ops/${organizationId}`);
    return rows.map(mapLiveWorkItem);
  },
  createTicketIntake: async (organizationId, body: TicketIntakePayload) => {
    const raw = await request<ApiAgenticIntakeResultOut>(`/intake/tickets/${organizationId}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapAgenticIntakeResult(raw);
  },
  createApprovalIntake: async (organizationId, body: ApprovalIntakePayload) => {
    const raw = await request<ApiAgenticIntakeResultOut>(`/intake/approvals/${organizationId}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapAgenticIntakeResult(raw);
  },
  listDataSources: async (organizationId) => {
    const rows = await request<ApiDataSourceSummaryOut[]>(`/data-sources/${organizationId}`);
    return rows.map(mapDataSourceSummary);
  },
  uploadDataSource: (organizationId, fileName) =>
    request(`/data-sources/${organizationId}/upload`, {
      method: "POST",
      body: JSON.stringify({ filename: fileName }),
    }),
  listDetectors: (organizationId) => request(`/detectors/${organizationId}`),
  createDetector: (organizationId, body) =>
    request(`/detectors/${organizationId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  promptDraftDetector: (prompt) =>
    request(`/detectors/prompt-draft`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  testDetector: (detectorId) =>
    request(`/detectors/${detectorId}/test`, { method: "POST" }),
  updateDetectorEnabled: async (detectorId, enabled) => {
    const res = await request<DetectorDefinition>(`/detectors/${detectorId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    return res;
  },
  listSlaRules: async (organizationId) => {
    const rows = await request<ApiSlaRulebookEntryOut[]>(`/sla/rules/${organizationId}`);
    return rows.map(mapSlaRulebookEntry);
  },
  updateSlaRule: async (ruleId, body: SlaRulebookEntryUpdatePayload) => {
    const r = await request<ApiSlaRulebookEntryOut>(`/sla/rules/entry/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return mapSlaRulebookEntry(r);
  },
  archiveSlaRule: async (ruleId, body?: SlaRulebookArchivePayload) => {
    const r = await request<ApiSlaRulebookEntryOut>(`/sla/rules/entry/${ruleId}/archive`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
    return mapSlaRulebookEntry(r);
  },
  listSlaExtractions: async (organizationId) => {
    const rows = await request<ApiSlaBatchOut[]>(`/sla/extractions/${organizationId}`);
    return rows.map(mapSlaBatch);
  },
  uploadSlaExtraction: async (organizationId, file, options) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (options?.documentType) {
      form.append("document_type", options.documentType);
    }
    const batch = await requestNoJsonBody<ApiSlaBatchOut>(
      `/sla/extractions/${organizationId}/upload-file`,
      { method: "POST", body: form },
    );
    return { batch_id: String(batch.id), status: batch.status };
  },
  approveSlaBatch: async (batchId, candidateRules = []) => {
    const r = await request<ApiSlaReviewResult>(`/sla/extractions/${batchId}/approve`, {
      method: "POST",
      body: JSON.stringify({ candidate_rules: scrubCandidateEdits(candidateRules) }),
    });
    return mapSlaReviewResult(r);
  },
  discardSlaBatch: async (batchId) => {
    const r = await request<ApiSlaReviewResult>(`/sla/extractions/${batchId}/discard`, {
      method: "POST",
    });
    return mapSlaReviewResult(r);
  },
  discardSlaCandidate: async (candidateId) => {
    await request(`/sla/extractions/candidates/${candidateId}/discard`, { method: "POST" });
  },
  listActions: async (organizationId) => {
    const rows = await request<ApiActionOut[]>(`/actions/${organizationId}`);
    return rows.map(mapAction);
  },
  approveAction: async (actionId, body: ActionDecisionBody) => {
    const a = await request<ApiActionOut>(`/actions/${actionId}/approve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      id: String(a.id),
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },
  rejectAction: async (actionId, body: ActionDecisionBody) => {
    const a = await request<ApiActionOut>(`/actions/${actionId}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      id: String(a.id),
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },
  executeAction: async (actionId) => {
    const a = await request<ApiActionOut>(`/actions/${actionId}/execute`, { method: "POST" });
    return {
      id: String(a.id),
      approval_state: a.approval_state,
      execution_state: a.execution_state,
    };
  },
  getAutoMode: async (organizationId) => {
    const s = await request<ApiAutoSettingsOut>(`/auto-mode/${organizationId}`);
    return mapAutoMode(s);
  },
  putAutoMode: async (organizationId, policies: AutoModePolicyUpdate[]) => {
    const s = await request<ApiAutoSettingsOut>(`/auto-mode/${organizationId}`, {
      method: "PUT",
      body: JSON.stringify({
        policies: policies.map((p) => {
          const row: Record<string, unknown> = { id: p.id };
          if (p.enabled !== undefined) row.enabled = p.enabled;
          if (p.approver_name !== undefined) row.approver_name = p.approver_name;
          if (p.condition_summary !== undefined) row.condition_summary = p.condition_summary;
          if (p.expires_at !== undefined) row.expires_at = p.expires_at;
          return row;
        }),
      }),
    });
    return mapAutoMode(s);
  },
  rescanAlerts: async (organizationId) => {
    await request<unknown[]>(`/alerts/${organizationId}/scan`, { method: "POST" });
  },
};
