import { useEffect, useMemo, useState } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api/client";
import { AppShell } from "./components/layout/AppShell";
import { ActionCenterPage } from "./pages/ActionCenterPage";
import { AuditPage } from "./pages/AuditPage";
import { CasesPage } from "./pages/CasesPage";
import { DataSourcesPage } from "./pages/DataSourcesPage";
import { DetectorsPage } from "./pages/DetectorsPage";
import { HomePage } from "./pages/HomePage";
import { ImpactPage } from "./pages/ImpactPage";
import { CopilotPage } from "./pages/CopilotPage";
import { LiveOpsPage } from "./pages/LiveOpsPage";
import { SlaRulebookPage } from "./pages/SlaRulebookPage";

export default function App() {
  const queryClient = useQueryClient();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | undefined>();

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
  });

  useEffect(() => {
    if (!selectedOrganizationId && organizationsQuery.data?.length) {
      setSelectedOrganizationId(organizationsQuery.data[organizationsQuery.data.length - 1].id);
    }
  }, [organizationsQuery.data, selectedOrganizationId]);

  const auditQuery = useQuery({
    queryKey: ["audit", selectedOrganizationId],
    queryFn: () => api.getAuditFeed(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const reportsQuery = useQuery({
    queryKey: ["reports", selectedOrganizationId],
    queryFn: () => api.listReports(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const seedMutation = useMutation({
    mutationFn: () => api.bootstrapSeed(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      const refreshed = await api.listOrganizations();
      if (refreshed.length) {
        setSelectedOrganizationId(refreshed[0].id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["bs"] }),
      ]);
    },
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      api.generateReport(selectedOrganizationId!, "On-demand Business Sentry Executive Summary"),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", selectedOrganizationId] }),
      ]);
    },
  });

  const investigate = async (question: string) =>
    api.investigate(selectedOrganizationId!, question);

  const currentReports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);

  const orgProps = {
    organizations: organizationsQuery.data ?? [],
    selectedOrganizationId,
    onOrganizationChange: setSelectedOrganizationId,
    onSeed: () => seedMutation.mutate(),
    seeding: seedMutation.isPending,
  };

  const handleSourceConnected = async (organizationId: number) => {
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    setSelectedOrganizationId(organizationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["audit"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["bs"] }),
    ]);
  };

  return (
    <Routes>
      <Route path="/" element={<AppShell {...orgProps}><Outlet /></AppShell>}>
        <Route
          index
          element={
            <HomePage
              onSeed={() => seedMutation.mutate()}
              seeding={seedMutation.isPending}
              hasData={Boolean(organizationsQuery.data?.length)}
            />
          }
        />
        <Route path="impact" element={<ImpactPage organizationId={selectedOrganizationId} />} />
        <Route path="cases" element={<CasesPage organizationId={selectedOrganizationId} />} />
        <Route path="live-ops" element={<LiveOpsPage organizationId={selectedOrganizationId} />} />
        <Route path="detectors" element={<DetectorsPage organizationId={selectedOrganizationId} />} />
        <Route path="sla-rulebook" element={<SlaRulebookPage organizationId={selectedOrganizationId} />} />
        <Route path="action-center" element={<ActionCenterPage organizationId={selectedOrganizationId} />} />
        <Route
          path="data-sources"
          element={
            <DataSourcesPage
              organizationId={selectedOrganizationId}
              onSourceConnected={handleSourceConnected}
            />
          }
        />
        <Route
          path="audit"
          element={
            <AuditPage
              feed={auditQuery.data ?? []}
              reports={currentReports}
              onGenerateReport={() => reportMutation.mutate()}
            />
          }
        />
        <Route path="copilot" element={<CopilotPage organizationId={selectedOrganizationId} onSubmit={investigate} />} />
      </Route>
    </Routes>
  );
}
