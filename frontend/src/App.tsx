import { useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api/client";
import { AppShell } from "./components/layout/AppShell";
import { AlertsPage } from "./pages/AlertsPage";
import { AuditPage } from "./pages/AuditPage";
import { HomePage } from "./pages/HomePage";
import { InvestigatePage } from "./pages/InvestigatePage";
import { OverviewPage } from "./pages/OverviewPage";
import { ResourcesPage } from "./pages/ResourcesPage";

export default function App() {
  const queryClient = useQueryClient();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | undefined>();

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
  });

  useEffect(() => {
    if (!selectedOrganizationId && organizationsQuery.data?.length) {
      setSelectedOrganizationId(organizationsQuery.data[0].id);
    }
  }, [organizationsQuery.data, selectedOrganizationId]);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", selectedOrganizationId],
    queryFn: () => api.getDashboard(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const alertsQuery = useQuery({
    queryKey: ["alerts", selectedOrganizationId],
    queryFn: () => api.listAlerts(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const resourcesQuery = useQuery({
    queryKey: ["resources", selectedOrganizationId],
    queryFn: () => api.getResources(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

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
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (recommendationId: number) =>
      api.approveRecommendation(recommendationId, "Operations Approver", "Approved in control panel"),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alerts", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", selectedOrganizationId] }),
      ]);
    },
  });

  const executeMutation = useMutation({
    mutationFn: (actionId: number) => api.executeAction(actionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alerts", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", selectedOrganizationId] }),
      ]);
    },
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      api.generateReport(selectedOrganizationId!, "On-demand CostPulse Executive Summary"),
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

  return (
    <AppShell
      organizations={organizationsQuery.data ?? []}
      selectedOrganizationId={selectedOrganizationId}
      onOrganizationChange={setSelectedOrganizationId}
      onSeed={() => seedMutation.mutate()}
      seeding={seedMutation.isPending}
    >
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              onSeed={() => seedMutation.mutate()}
              seeding={seedMutation.isPending}
              hasData={Boolean(dashboardQuery.data)}
            />
          }
        />
        <Route
          path="/overview"
          element={
            <OverviewPage
              data={dashboardQuery.data}
              onApprove={(recommendationId) => approveMutation.mutate(recommendationId)}
              onExecute={(actionId) => executeMutation.mutate(actionId)}
            />
          }
        />
        <Route
          path="/alerts"
          element={
            <AlertsPage
              alerts={alertsQuery.data ?? []}
              onRescan={() => selectedOrganizationId && api.scanAlerts(selectedOrganizationId).then(() => {
                queryClient.invalidateQueries({ queryKey: ["alerts", selectedOrganizationId] });
                queryClient.invalidateQueries({ queryKey: ["dashboard", selectedOrganizationId] });
              })}
              onApprove={(recommendationId) => approveMutation.mutate(recommendationId)}
              onExecute={(actionId) => executeMutation.mutate(actionId)}
            />
          }
        />
        <Route path="/resources" element={<ResourcesPage data={resourcesQuery.data} />} />
        <Route
          path="/investigate"
          element={<InvestigatePage onSubmit={investigate} />}
        />
        <Route
          path="/audit"
          element={
            <AuditPage
              feed={auditQuery.data ?? []}
              reports={currentReports}
              onGenerateReport={() => reportMutation.mutate()}
            />
          }
        />
      </Routes>
    </AppShell>
  );
}
