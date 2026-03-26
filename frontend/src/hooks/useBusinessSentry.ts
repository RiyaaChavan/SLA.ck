import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoModePolicyUpdate, CasesListParams } from "../domain/business-sentry";
import { getBusinessSentryAdapter } from "../adapters/business-sentry";
import type {
  SlaExtractionCandidateEdit,
  SlaRulebookEntryUpdatePayload,
} from "../adapters/business-sentry/contract";

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

export function useUpdateSlaRule(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ruleId: string; body: SlaRulebookEntryUpdatePayload }) =>
      adapter.updateSlaRule(args.ruleId, args.body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaRules", organizationId] });
    },
  });
}

export function useArchiveSlaRule(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ruleId: string; reviewed_by?: string | null }) =>
      adapter.archiveSlaRule(args.ruleId, { reviewed_by: args.reviewed_by }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaRules", organizationId] });
    },
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
    mutationFn: (args: { file: File; documentType?: string }) =>
      adapter.uploadSlaExtraction(organizationId!, args.file, {
        documentType: args.documentType,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaExtractions", organizationId] });
    },
  });
}

export function useSlaBatchApprove(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { batchId: string; candidateRules?: SlaExtractionCandidateEdit[] }) =>
      adapter.approveSlaBatch(args.batchId, args.candidateRules),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "slaExtractions", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "slaRules", organizationId] });
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

export function useDiscardSlaCandidate(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) => adapter.discardSlaCandidate(candidateId),
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
    mutationFn: (args: { actionId: string; approver_name: string; notes?: string | null }) =>
      adapter.approveAction(args.actionId, {
        approver_name: args.approver_name,
        notes: args.notes,
      }),
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
    mutationFn: (args: { actionId: string; approver_name: string; notes?: string | null }) =>
      adapter.rejectAction(args.actionId, {
        approver_name: args.approver_name,
        notes: args.notes,
      }),
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
    mutationFn: (policies: AutoModePolicyUpdate[]) =>
      adapter.putAutoMode(organizationId!, policies),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "autoMode", organizationId] });
    },
  });
}

export function useRescanAlerts(organizationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adapter.rescanAlerts(organizationId!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "cases", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "liveOps", organizationId] });
      await qc.invalidateQueries({ queryKey: ["bs", "impact", organizationId] });
    },
  });
}
