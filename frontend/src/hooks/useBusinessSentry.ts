import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoModeSettings, CasesListParams } from "../domain/business-sentry";
import { getBusinessSentryAdapter } from "../adapters/business-sentry";

const adapter = getBusinessSentryAdapter();

export function useImpactOverview(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "impact", organizationId],
    queryFn: () => adapter.getImpact(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useCasesList(organizationId: number | undefined, params: CasesListParams) {
  return useQuery({
    queryKey: ["bs", "cases", organizationId, params],
    queryFn: () => adapter.listCases(organizationId!, params),
    enabled: Boolean(organizationId),
  });
}

export function useCaseDetail(caseId: string | null) {
  return useQuery({
    queryKey: ["bs", "case", caseId],
    queryFn: () => adapter.getCaseDetail(caseId!),
    enabled: Boolean(caseId),
  });
}

export function useLiveOps(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "liveOps", organizationId],
    queryFn: () => adapter.listLiveOps(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useDataSources(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "dataSources", organizationId],
    queryFn: () => adapter.listDataSources(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useDetectors(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "detectors", organizationId],
    queryFn: () => adapter.listDetectors(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useSlaRules(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "slaRules", organizationId],
    queryFn: () => adapter.listSlaRules(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useSlaExtractions(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "slaExtractions", organizationId],
    queryFn: () => adapter.listSlaExtractions(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useActions(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "actions", organizationId],
    queryFn: () => adapter.listActions(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useAutoMode(organizationId: number | undefined) {
  return useQuery({
    queryKey: ["bs", "autoMode", organizationId],
    queryFn: () => adapter.getAutoMode(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useDataSourceUpload(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileName: string) => adapter.uploadDataSource(organizationId!, fileName),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "dataSources", organizationId] });
    },
  });
}

export function useSlaExtractionUpload(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileName: string) => adapter.uploadSlaExtraction(organizationId!, fileName),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaExtractions", organizationId] });
    },
  });
}

export function useSlaBatchApprove(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => adapter.approveSlaBatch(batchId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaExtractions", organizationId] });
    },
  });
}

export function useSlaBatchDiscard(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => adapter.discardSlaBatch(batchId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaExtractions", organizationId] });
    },
  });
}

export function usePromptDraftDetector() {
  return useMutation({
    mutationFn: (prompt: string) => adapter.promptDraftDetector(prompt),
  });
}

export function useTestDetector(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (detectorId: string) => adapter.testDetector(detectorId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "detectors", organizationId] });
    },
  });
}

export function useToggleDetector(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adapter.updateDetectorEnabled(id, enabled),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "detectors", organizationId] });
    },
  });
}

export function useApproveAction(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => adapter.approveAction(actionId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "cases", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "impact", organizationId] });
    },
  });
}

export function useRejectAction(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => adapter.rejectAction(actionId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "cases", organizationId] });
    },
  });
}

export function useExecuteAction(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => adapter.executeAction(actionId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "cases", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "impact", organizationId] });
    },
  });
}

export function usePutAutoMode(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AutoModeSettings) => adapter.putAutoMode(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "autoMode", organizationId] });
    },
  });
}
