import type { CasesListParams, DetectorDefinition } from "../../domain/business-sentry";
import type { BusinessSentryAdapter } from "./contract";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return response.json() as Promise<T>;
}

function casesQuery(params: CasesListParams): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const httpBusinessSentryAdapter: BusinessSentryAdapter = {
  getImpact: (organizationId) => request(`/impact/${organizationId}`),
  listCases: (organizationId, params) =>
    request(`/cases/${organizationId}${casesQuery(params)}`),
  getCaseDetail: (caseId) => request(`/cases/detail/${caseId}`),
  listLiveOps: (organizationId) => request(`/live-ops/${organizationId}`),
  listDataSources: (organizationId) => request(`/data-sources/${organizationId}`),
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
  listSlaRules: (organizationId) => request(`/sla/rules/${organizationId}`),
  listSlaExtractions: (organizationId) => request(`/sla/extractions/${organizationId}`),
  uploadSlaExtraction: (organizationId, fileName) =>
    request(`/sla/extractions/${organizationId}/upload`, {
      method: "POST",
      body: JSON.stringify({ filename: fileName }),
    }),
  approveSlaBatch: (batchId) =>
    request(`/sla/extractions/${batchId}/approve`, { method: "POST" }),
  discardSlaBatch: (batchId) =>
    request(`/sla/extractions/${batchId}/discard`, { method: "POST" }),
  listActions: (organizationId) => request(`/actions/${organizationId}`),
  approveAction: (actionId) =>
    request(`/actions/${actionId}/approve`, { method: "POST" }),
  rejectAction: (actionId) =>
    request(`/actions/${actionId}/reject`, { method: "POST" }),
  executeAction: (actionId) =>
    request(`/actions/${actionId}/execute`, { method: "POST" }),
  getAutoMode: (organizationId) => request(`/auto-mode/${organizationId}`),
  putAutoMode: (settings) =>
    request(`/auto-mode/${settings.organization_id}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};
