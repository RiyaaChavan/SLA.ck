/**
 * When `true`, the composite adapter calls the HTTP backend for that resource.
 * Must stay aligned with **Backend Status** in WORKSTREAM_SYNC.md at repo root.
 */
export const LIVE_ENDPOINTS = {
  impact: false,
  cases: false,
  caseDetail: false,
  liveOps: false,
  dataSources: false,
  dataSourcesUpload: false,
  detectors: false,
  detectorsCreate: false,
  detectorsPromptDraft: false,
  detectorsTest: false,
  slaRules: false,
  slaExtractions: false,
  slaExtractionUpload: false,
  slaExtractionApprove: false,
  slaExtractionDiscard: false,
  actions: false,
  actionApprove: false,
  actionReject: false,
  actionExecute: false,
  autoMode: false,
  autoModePut: false,
} as const;

export type LiveEndpointKey = keyof typeof LIVE_ENDPOINTS;
