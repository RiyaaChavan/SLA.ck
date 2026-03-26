import type {
  Alert,
  AuditItem,
  DashboardOverview,
  InvestigationResult,
  Organization,
  ResourceOverview,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export type CreateOrganizationInput = {
  name: string;
  industry: string;
  geography: string;
};

type SeedResponse = {
  organizations_created: number;
  alerts_created: number;
  reports_generated: number;
};

type ReportSummary = {
  id: number;
  title: string;
  status: string;
  storage_path?: string | null;
  summary?: Record<string, unknown>;
};

type ExecutionResponse = {
  action_id: number;
  status: string;
  summary: string;
};

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // ignore parse failures and fall through
  }
  return response.statusText || `Request failed: ${response.status}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

export const api = {
  listOrganizations: () => request<Organization[]>("/organizations"),
  createOrganization: (body: CreateOrganizationInput) =>
    request<Organization>("/organizations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bootstrapSeed: (reset = false) =>
    request<SeedResponse>("/bootstrap/seed" + (reset ? "?reset=true" : ""), { method: "POST" }),
  getDashboard: (organizationId: number) => request<DashboardOverview>(`/dashboard/${organizationId}`),
  listAlerts: (organizationId: number) => request<Alert[]>(`/alerts/${organizationId}`),
  scanAlerts: (organizationId: number) => request<Alert[]>(`/alerts/${organizationId}/scan`, { method: "POST" }),
  getResources: (organizationId: number) => request<ResourceOverview>(`/resources/${organizationId}`),
  getAuditFeed: (organizationId: number) => request<AuditItem[]>(`/audit/${organizationId}`),
  investigate: (organizationId: number, question: string) =>
    request<InvestigationResult>("/investigate/query", {
      method: "POST",
      body: JSON.stringify({ organization_id: organizationId, question }),
    }),
  approveRecommendation: (recommendationId: number, approverName: string, notes?: string) =>
    request(`/recommendations/${recommendationId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approver_name: approverName, notes }),
    }),
  rejectRecommendation: (recommendationId: number, approverName: string, notes?: string) =>
    request(`/recommendations/${recommendationId}/reject`, {
      method: "POST",
      body: JSON.stringify({ approver_name: approverName, notes }),
    }),
  executeAction: (actionId: number) =>
    request<ExecutionResponse>(`/actions/${actionId}/execute`, { method: "POST" }),
  generateReport: (organizationId: number, title: string) =>
    request("/reports/generate", {
      method: "POST",
      body: JSON.stringify({ organization_id: organizationId, title }),
    }),
  listReports: (organizationId: number) => request<ReportSummary[]>(`/reports/${organizationId}`),
};
