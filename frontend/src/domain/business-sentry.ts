/** SLA.ck domain types — mirror WORKSTREAM_SYNC.md locked contracts. */

export type OrganizationSummary = {
  id: number;
  name: string;
  industry: string;
  geography: string;
};

export type ImpactMetric = {
  label: string;
  value: number;
  delta?: number | null;
};

export type VendorRiskRow = {
  vendor: string;
  risk_score: number;
  projected_impact: number;
};

export type TeamOverloadRow = {
  team: string;
  open_items: number;
  sla_breach_risk: string;
};

export type RealizedVsProjected = {
  periods: string[];
  realized_savings: number[];
  projected_savings: number[];
  capture_rate_pct?: number;
};

export type ApprovalExecutionFunnel = {
  pending_approval: number;
  approved: number;
  rejected: number;
  executed: number;
};

export type ImpactOverview = {
  organization: OrganizationSummary;
  metrics: ImpactMetric[];
  top_vendors_by_risk: VendorRiskRow[];
  top_teams_by_overload: TeamOverloadRow[];
  realized_vs_projected: RealizedVsProjected;
  recent_cases: CaseSummary[];
  approval_execution_funnel: ApprovalExecutionFunnel;
};

export type CaseSummary = {
  id: string;
  organization_id: number;
  module: string;
  title: string;
  summary: string;
  case_type: string;
  severity: string;
  status: string;
  team: string;
  vendor: string;
  detector_name: string;
  owner_name: string;
  approver_name: string;
  projected_impact: number;
  realized_impact: number;
  approval_state: string;
  action_state: string;
  sla_countdown_minutes: number | null;
  sla_risk_level: string;
  recommended_action_label: string;
  created_at: string;
  updated_at: string;
};

export type EvidenceRecord = {
  id: string;
  kind: string;
  label: string;
  snippet: string;
};

export type RelatedEntity = {
  type: string;
  id: string;
  name: string;
};

export type CaseSlaBlock = {
  name: string;
  response_deadline: string;
  resolution_deadline: string;
  penalty_if_breach: number;
};

export type FinancialImpact = {
  amount: number;
  currency: string;
  confidence: number;
};

export type RecommendedActionBlock = {
  label: string;
  playbook_id?: string;
};

export type ApprovalChainStep = {
  step: number;
  role: string;
  name: string;
  state: string;
};

export type TimelineEvent = {
  at: string;
  event: string;
  actor: string;
};

export type CaseDetail = {
  summary: CaseSummary;
  why_flagged: string;
  root_cause: string;
  baseline_comparison: string;
  evidence: EvidenceRecord[];
  related_entities: RelatedEntity[];
  sla: CaseSlaBlock | null;
  financial_impact: FinancialImpact;
  formula: string;
  recommended_action: RecommendedActionBlock;
  approval_chain: ApprovalChainStep[];
  timeline: TimelineEvent[];
};

export type LiveWorkItem = {
  id: string;
  item_type: string;
  title: string;
  team: string | null;
  owner_name: string;
  status: string;
  current_stage: string;
  assigned_sla_name: string | null;
  response_deadline: string | null;
  resolution_deadline: string | null;
  time_remaining_minutes: number;
  /** Backend SLA runtime uses string bands: low, medium, high, critical, … */
  predicted_breach_risk: string;
  projected_penalty: number;
  projected_business_impact: number;
  linked_case_id: string | null;
  suggested_action: string;
  match_rationale: string[];
  workflow_category: string | null;
};

export type DetectorDefinition = {
  id: string;
  name: string;
  description: string;
  module: string;
  business_domain: string;
  severity: string;
  owner_name: string;
  enabled: boolean;
  logic_type: string;
  logic_summary: string;
  query_logic: string;
  expected_output_fields: string[];
  linked_action_template: string;
  linked_cost_formula: string;
  last_triggered_at: string | null;
  issue_count: number;
};

export type SlaRulebookEntry = {
  id: string;
  name: string;
  status: string;
  /** Human-readable summary (derived from API `applies_to` object) */
  applies_to: string;
  /** Original dict from API for round-tripping edits */
  applies_to_payload?: Record<string, unknown>;
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
  last_reviewed_at: string | null;
  source_batch_id?: number | null;
};

export type SlaExtractionCandidate = {
  id: number;
  name: string;
  applies_to?: string;
  /** Dict from API for edits / approval payload */
  applies_to_payload?: Record<string, unknown>;
  conditions?: string;
  response_deadline_hours: number;
  resolution_deadline_hours: number;
  penalty_amount: number;
  escalation_owner?: string;
  business_hours_logic?: string;
  auto_action_allowed?: boolean;
  status?: string;
  confidence_score?: number;
  parsing_notes?: string[];
  extraction_source?: string;
  candidate_metadata?: Record<string, unknown>;
};

export type SlaExtractionBatch = {
  id: string;
  source_document_name: string;
  document_type?: string;
  status: string;
  uploaded_at: string;
  extraction_source?: string;
  run_metadata?: Record<string, unknown>;
  candidate_rules: SlaExtractionCandidate[];
};

export type ActionRequest = {
  id: string;
  case_id: string;
  title: string;
  recommended_next_step: string;
  rationale: string;
  expected_savings: number;
  avoided_loss: number;
  risk_level: string;
  required_approver: string;
  evidence_pack_summary: string[];
  approval_state: string;
  execution_state: string;
  created_at: string;
  updated_at: string;
};

export type UploadHistoryEntry = {
  at: string;
  filename: string;
  rows: number;
};

export type DataSourceSummary = {
  id: string;
  name: string;
  source_type: string;
  status: string;
  freshness_status: string;
  last_synced_at: string;
  record_count: number;
  schema_preview: string[];
  health: string;
  upload_history: UploadHistoryEntry[];
};

export type AutoModePolicy = {
  id: number;
  name: string;
  module: string;
  scope: string;
  risk_level: string;
  enabled: boolean;
  approver_name: string;
  allowed_actions: string[];
  condition_summary: string;
  expires_at: string | null;
};

export type DataSourceConnectResult = {
  organization_id: number;
  organization_name: string;
  source_database: string;
  schema: string;
  source_uploads_created: number;
  alerts_generated: number;
};

export type DatasetSummary = {
  name: string;
  record_count: number;
  columns: string[];
  source_uri: string;
  schema: string;
};

export type DatasetPreview = {
  name: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  row_count: number;
  source_uri: string;
  schema: string;
};

export type SourceAgentMemory = {
  id: number;
  status: string;
  engine_name: string;
  summary_text: string;
  dashboard_brief: string;
  schema_notes?: string | null;
  memory_path?: string | null;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SavedAnomalyQuery = {
  id: number;
  name: string;
  description: string;
  sql_text: string;
  category: string;
  enabled: boolean;
  created_at: string;
};

export type AutoModeSettings = {
  organization_id: number;
  policies: AutoModePolicy[];
};

/** Partial updates for PUT /auto-mode/{organization_id} */
export type AutoModePolicyUpdate = {
  id: number;
  enabled?: boolean;
  approver_name?: string | null;
  condition_summary?: string | null;
  expires_at?: string | null;
};

export type CasesListParams = {
  sort?: string;
  severity?: string;
  status?: string;
  module?: string;
  team?: string;
  vendor?: string;
  detector?: string;
  approver?: string;
  action_state?: string;
};

export type DetectorDraft = {
  name: string;
  logic_summary: string;
  query_logic: string;
  expected_output_fields: string[];
  module: string;
  business_domain: string;
  severity: string;
  linked_action_template: string;
  linked_cost_formula: string;
};

export type DetectorTestResult = {
  passed: boolean;
  sample_rows: Array<Record<string, string | number>>;
  message: string;
};
