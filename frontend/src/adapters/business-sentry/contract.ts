import type {
  ActionRequest,
  AutoModeSettings,
  CaseDetail,
  CaseSummary,
  CasesListParams,
  DataSourceSummary,
  DetectorDefinition,
  DetectorDraft,
  DetectorTestResult,
  ImpactOverview,
  LiveWorkItem,
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
};

export type ActionMutationResponse = {
  id: string;
  approval_state: string;
  execution_state: string;
};

/** Single boundary for Business Sentry API — pages depend only on this + domain types. */
export type BusinessSentryAdapter = {
  getImpact(organizationId: number): Promise<ImpactOverview>;
  listCases(organizationId: number, params: CasesListParams): Promise<CaseSummary[]>;
  getCaseDetail(caseId: string): Promise<CaseDetail | null>;
  listLiveOps(organizationId: number): Promise<LiveWorkItem[]>;
  listDataSources(organizationId: number): Promise<DataSourceSummary[]>;
  uploadDataSource(organizationId: number, fileName: string): Promise<DataSourceUploadResponse>;
  listDetectors(organizationId: number): Promise<DetectorDefinition[]>;
  createDetector(organizationId: number, body: Partial<DetectorDefinition>): Promise<DetectorCreateResponse>;
  promptDraftDetector(prompt: string): Promise<{ draft: DetectorDraft }>;
  testDetector(detectorId: string): Promise<DetectorTestResult>;
  updateDetectorEnabled(detectorId: string, enabled: boolean): Promise<DetectorDefinition | null>;
  listSlaRules(organizationId: number): Promise<SlaRulebookEntry[]>;
  listSlaExtractions(organizationId: number): Promise<SlaExtractionBatch[]>;
  uploadSlaExtraction(organizationId: number, fileName: string): Promise<SlaBatchMutationResponse>;
  approveSlaBatch(batchId: string): Promise<SlaBatchMutationResponse>;
  discardSlaBatch(batchId: string): Promise<SlaBatchMutationResponse>;
  listActions(organizationId: number): Promise<ActionRequest[]>;
  approveAction(actionId: string): Promise<ActionMutationResponse>;
  rejectAction(actionId: string): Promise<ActionMutationResponse>;
  executeAction(actionId: string): Promise<ActionMutationResponse>;
  getAutoMode(organizationId: number): Promise<AutoModeSettings>;
  putAutoMode(settings: AutoModeSettings): Promise<AutoModeSettings>;
};
