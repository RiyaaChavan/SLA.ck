/**
 * When `true`, the composite adapter calls the HTTP backend for that resource.
 * Must stay aligned with **Backend Status** in WORKSTREAM_SYNC.md at repo root.
 */
export const LIVE_ENDPOINTS = {
  impact: false,
  cases: false,
  caseDetail: false,
  liveOps: true,
  intakeTickets: true,
  intakeApprovals: true,
  dataSources: true,
  dataSourcesUpload: true,
  detectors: false,
  detectorsCreate: false,
  detectorsPromptDraft: false,
  detectorsTest: false,
  slaRules: true,
  slaExtractions: true,
  slaExtractionUpload: true,
  slaExtractionApprove: true,
  slaExtractionDiscard: true,
  actions: true,
  actionApprove: true,
  actionReject: true,
  actionExecute: true,
  autoMode: true,
  autoModePut: true,
  /** POST /alerts/{organization_id}/scan — refresh detector-driven alerts after rule/policy changes */
  alertsScan: true,
} as const;

export type LiveEndpointKey = keyof typeof LIVE_ENDPOINTS;
