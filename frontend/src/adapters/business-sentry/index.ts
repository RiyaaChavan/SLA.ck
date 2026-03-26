import { LIVE_ENDPOINTS } from "../../config/liveEndpoints";
import type { BusinessSentryAdapter } from "./contract";
import { httpBusinessSentryAdapter } from "./httpAdapter";
import { mockBusinessSentryAdapter } from "./mockAdapter";

/** Composite adapter: per-endpoint mock vs live from `liveEndpoints.ts` (sync with WORKSTREAM_SYNC.md). */
export function createBusinessSentryAdapter(): BusinessSentryAdapter {
  const m = mockBusinessSentryAdapter;
  const h = httpBusinessSentryAdapter;
  return {
    getImpact: LIVE_ENDPOINTS.impact ? h.getImpact : m.getImpact,
    listCases: LIVE_ENDPOINTS.cases ? h.listCases : m.listCases,
    getCaseDetail: LIVE_ENDPOINTS.caseDetail ? h.getCaseDetail : m.getCaseDetail,
    listLiveOps: LIVE_ENDPOINTS.liveOps ? h.listLiveOps : m.listLiveOps,
    createTicketIntake: LIVE_ENDPOINTS.intakeTickets ? h.createTicketIntake : m.createTicketIntake,
    createApprovalIntake: LIVE_ENDPOINTS.intakeApprovals ? h.createApprovalIntake : m.createApprovalIntake,
    listDataSources: LIVE_ENDPOINTS.dataSources ? h.listDataSources : m.listDataSources,
    uploadDataSource: LIVE_ENDPOINTS.dataSourcesUpload ? h.uploadDataSource : m.uploadDataSource,
    listDetectors: LIVE_ENDPOINTS.detectors ? h.listDetectors : m.listDetectors,
    createDetector: LIVE_ENDPOINTS.detectorsCreate ? h.createDetector : m.createDetector,
    promptDraftDetector: LIVE_ENDPOINTS.detectorsPromptDraft ? h.promptDraftDetector : m.promptDraftDetector,
    testDetector: LIVE_ENDPOINTS.detectorsTest ? h.testDetector : m.testDetector,
    updateDetectorEnabled: LIVE_ENDPOINTS.detectors ? h.updateDetectorEnabled : m.updateDetectorEnabled,
    listSlaRules: LIVE_ENDPOINTS.slaRules ? h.listSlaRules : m.listSlaRules,
    updateSlaRule: LIVE_ENDPOINTS.slaRules ? h.updateSlaRule : m.updateSlaRule,
    archiveSlaRule: LIVE_ENDPOINTS.slaRules ? h.archiveSlaRule : m.archiveSlaRule,
    listSlaExtractions: LIVE_ENDPOINTS.slaExtractions ? h.listSlaExtractions : m.listSlaExtractions,
    uploadSlaExtraction: LIVE_ENDPOINTS.slaExtractionUpload ? h.uploadSlaExtraction : m.uploadSlaExtraction,
    approveSlaBatch: LIVE_ENDPOINTS.slaExtractionApprove ? h.approveSlaBatch : m.approveSlaBatch,
    discardSlaBatch: LIVE_ENDPOINTS.slaExtractionDiscard ? h.discardSlaBatch : m.discardSlaBatch,
    discardSlaCandidate: LIVE_ENDPOINTS.slaExtractions ? h.discardSlaCandidate : m.discardSlaCandidate,
    listActions: LIVE_ENDPOINTS.actions ? h.listActions : m.listActions,
    approveAction: LIVE_ENDPOINTS.actionApprove ? h.approveAction : m.approveAction,
    rejectAction: LIVE_ENDPOINTS.actionReject ? h.rejectAction : m.rejectAction,
    executeAction: LIVE_ENDPOINTS.actionExecute ? h.executeAction : m.executeAction,
    getAutoMode: LIVE_ENDPOINTS.autoMode ? h.getAutoMode : m.getAutoMode,
    putAutoMode: LIVE_ENDPOINTS.autoModePut ? h.putAutoMode : m.putAutoMode,
    rescanAlerts: LIVE_ENDPOINTS.alertsScan ? h.rescanAlerts : m.rescanAlerts,
  };
}

let singleton: BusinessSentryAdapter | null = null;

export function getBusinessSentryAdapter(): BusinessSentryAdapter {
  if (!singleton) singleton = createBusinessSentryAdapter();
  return singleton;
}
