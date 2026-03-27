import type {
  ActionRequest,
  AutoModePolicyUpdate,
  AutoModeSettings,
  CaseDetail,
  CaseSummary,
  CasesListParams,
  DataSourceConnectResult,
  DataSourceSummary,
  DatasetPreview,
  DatasetSummary,
  DetectorDefinition,
  DetectorDraft,
  DetectorTestResult,
  ImpactOverview,
  LiveWorkItem,
  SavedAnomalyQuery,
  SourceAgentMemory,
  SlaExtractionBatch,
  SlaRulebookEntry,
} from "../../domain/business-sentry";

export type DataSourceUploadResponse = {
  upload_id: string;
  status: string;
  message: string;
};

export type DetectorCreateResponse = {
  id: string;
  name: string;
  enabled: boolean;
};

export type SlaBatchMutationResponse = {
  batch_id: string;
  status: string;
  rules_created?: number;
};

/** Edits merged server-side when approving an extraction batch (matches backend SlaExtractionCandidateEditIn). */
export type SlaExtractionCandidateEdit = {
  id: number;
  name?: string | null;
  applies_to?: Record<string, unknown> | null;
  conditions?: string | null;
  response_deadline_hours?: number | null;
  resolution_deadline_hours?: number | null;
  penalty_amount?: number | null;
  escalation_owner?: string | null;
  escalation_policy?: Record<string, unknown> | null;
  business_hours_logic?: string | null;
  business_hours_definition?: Record<string, unknown> | null;
  auto_action_allowed?: boolean | null;
  auto_action_policy?: Record<string, unknown> | null;
};

export type ActionDecisionBody = {
  approver_name: string;
  notes?: string | null;
};

export type ActionMutationResponse = {
  id: string;
  approval_state: string;
  execution_state: string;
};

/** Partial body for PUT /sla/rules/entry/{rule_id} (matches backend SlaRulebookEntryUpdateIn). */
export type SlaRulebookEntryUpdatePayload = {
  name?: string;
  status?: string;
  applies_to?: Record<string, unknown>;
  conditions?: string;
  response_deadline_hours?: number;
  resolution_deadline_hours?: number;
  penalty_amount?: number;
  escalation_owner?: string;
  escalation_policy?: Record<string, unknown>;
  business_hours_logic?: string;
  business_hours_definition?: Record<string, unknown>;
  auto_action_allowed?: boolean;
  auto_action_policy?: Record<string, unknown>;
  source_document_name?: string;
  reviewed_by?: string | null;
  review_notes?: string | null;
  supersedes_rule_id?: number | null;
};

export type SlaRulebookArchivePayload = {
  reviewed_by?: string | null;
};

/** Single boundary for SLA.ck API — pages depend only on this + domain types. */
export type BusinessSentryAdapter = {
  getImpact(organizationId: number): Promise<ImpactOverview>;
  listCases(organizationId: number, params: CasesListParams): Promise<CaseSummary[]>;
  getCaseDetail(caseId: string): Promise<CaseDetail | null>;
  listLiveOps(organizationId: number): Promise<LiveWorkItem[]>;
  listDataSources(organizationId: number): Promise<DataSourceSummary[]>;
  uploadDataSource(organizationId: number, fileName: string): Promise<DataSourceUploadResponse>;
  connectRelationalSource(databaseUrl: string, schema: string, schemaNotes?: string): Promise<DataSourceConnectResult>;
  listSourceDatasets(organizationId: number): Promise<DatasetSummary[]>;
  previewSourceDataset(organizationId: number, datasetName: string): Promise<DatasetPreview>;
  getSourceAgentMemory(organizationId: number): Promise<SourceAgentMemory | null>;
  listSavedAnomalyQueries(organizationId: number): Promise<SavedAnomalyQuery[]>;
  listDetectors(organizationId: number): Promise<DetectorDefinition[]>;
  createDetector(organizationId: number, body: Partial<DetectorDefinition>): Promise<DetectorCreateResponse>;
  promptDraftDetector(
    organizationId: number,
    prompt: string,
    module?: string | null,
  ): Promise<{ draft: DetectorDraft }>;
  testDetector(detectorId: string): Promise<DetectorTestResult>;
  updateDetectorEnabled(detectorId: string, enabled: boolean): Promise<DetectorDefinition | null>;
  listSlaRules(organizationId: number): Promise<SlaRulebookEntry[]>;
  updateSlaRule(ruleId: string, body: SlaRulebookEntryUpdatePayload): Promise<SlaRulebookEntry>;
  archiveSlaRule(ruleId: string, body?: SlaRulebookArchivePayload): Promise<SlaRulebookEntry>;
  listSlaExtractions(organizationId: number): Promise<SlaExtractionBatch[]>;
  uploadSlaExtraction(
    organizationId: number,
    file: File,
    options?: { documentType?: string },
  ): Promise<SlaBatchMutationResponse>;
  approveSlaBatch(
    batchId: string,
    candidateRules?: SlaExtractionCandidateEdit[],
  ): Promise<SlaBatchMutationResponse>;
  discardSlaBatch(batchId: string): Promise<SlaBatchMutationResponse>;
  discardSlaCandidate(candidateId: string): Promise<void>;
  listActions(organizationId: number): Promise<ActionRequest[]>;
  approveAction(actionId: string, body: ActionDecisionBody): Promise<ActionMutationResponse>;
  rejectAction(actionId: string, body: ActionDecisionBody): Promise<ActionMutationResponse>;
  executeAction(actionId: string): Promise<ActionMutationResponse>;
  getAutoMode(organizationId: number): Promise<AutoModeSettings>;
  putAutoMode(organizationId: number, policies: AutoModePolicyUpdate[]): Promise<AutoModeSettings>;
  /** Run detector scan to refresh alerts (e.g. after SLA rule changes). */
  rescanAlerts(organizationId: number): Promise<void>;
};
