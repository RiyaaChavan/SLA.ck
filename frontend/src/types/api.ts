export type Organization = {
  id: number;
  name: string;
  industry: string;
  geography: string;
};

export type Alert = {
  id: number;
  organization_id: number;
  title: string;
  description: string;
  type: string;
  severity: string;
  status: string;
  projected_impact: number;
  confidence_score: number;
  created_at: string;
  recommendation_id?: number | null;
  action_id?: number | null;
};

export type DashboardOverview = {
  organization: Organization;
  metrics: Array<{ label: string; value: number; delta?: number | null }>;
  alert_mix: Array<{ label: string; value: number }>;
  resource_heatmap: Array<{
    department_id: number;
    resource_name: string;
    resource_type: string;
    utilization_pct: number;
    monthly_cost: number;
  }>;
  top_alerts: Alert[];
  reports: Array<{ id: number; title: string; status: string; storage_path?: string | null }>;
};

export type ResourceOverview = {
  organization: Organization;
  rows: Array<{
    department_id: number;
    resource_name: string;
    resource_type: string;
    utilization_pct: number;
    monthly_cost: number;
    active_units: number;
    provisioned_units: number;
  }>;
};

export type InvestigationResult = {
  query_label: string;
  sql: string;
  rows: Array<Record<string, string | number | boolean | null>>;
  explanation: string;
  summary?: string | null;
};

export type InvestigationSession = {
  session_id: string;
};

export type CopilotStreamEvent = {
  seq: number;
  session_id: string;
  timestamp: string;
  kind: "status" | "reasoning" | "action" | "result" | "error";
  message: string;
  detail: Record<string, unknown>;
  status?: "running" | "completed" | "error" | null;
  level?: string;
};

export type AuditItem = {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number;
  created_at: string;
  payload: Record<string, string | number | null>;
};
