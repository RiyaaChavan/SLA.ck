import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api/client";
import type { CreateOrganizationInput } from "./api/client";
import { AppShell } from "./components/layout/AppShell";
import { StateBlock } from "./components/business-sentry/StateBlock";
import { useNotifications } from "./components/shared/Notifications";
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
import { WorkspaceOnboardingPage } from "./pages/WorkspaceOnboardingPage";

type WorkspaceGateProps = {
  loading: boolean;
  error: boolean;
  hasOrganizations: boolean;
  organizationId?: number;
  children: ReactNode;
};

function WorkspaceGate({
  loading,
  error,
  hasOrganizations,
  organizationId,
  children,
}: WorkspaceGateProps) {
  if (loading || (hasOrganizations && !organizationId)) {
    return (
      <div className="page-content">
        <StateBlock title="Loading workspace" loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <StateBlock title="Could not load workspaces" description="Refresh the page and try again." />
      </div>
    );
  }

  if (!hasOrganizations) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { notify } = useNotifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
    mutationFn: () => api.bootstrapSeed(false),
    onSuccess: async () => {
      notify({
        tone: "success",
        title: "Workspace seeded",
        message: "New profiles were seeded. Existing workspaces were preserved.",
      });
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
    onError: () => {
      notify({
        tone: "error",
        title: "Seed failed",
        message: "Could not reset and seed the demo workspace.",
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      api.generateReport(selectedOrganizationId!, "On-demand SLA.ck Executive Summary"),
    onSuccess: async () => {
      notify({
        tone: "success",
        title: "Report generated",
        message: "The executive PDF report was generated and added to the audit page.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", selectedOrganizationId] }),
      ]);
    },
    onError: () => {
      notify({
        tone: "error",
        title: "Report generation failed",
        message: "Could not generate the executive report.",
      });
    },
  });

  const investigate = async (question: string) =>
    api.investigate(selectedOrganizationId!, question);

  const currentReports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const organizations = organizationsQuery.data ?? [];
  const hasOrganizations = organizations.length > 0;

  const orgProps = {
    organizations,
    selectedOrganizationId,
    onOrganizationChange: setSelectedOrganizationId,
    onSeed: () => seedMutation.mutate(),
    seeding: seedMutation.isPending,
  };

  const syncSelectedOrganization = async (organizationId: number) => {
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    setSelectedOrganizationId(organizationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["audit"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["bs"] }),
    ]);
  };

  const workspaceMutation = useMutation({
    mutationFn: async (body: CreateOrganizationInput) => {
      const organization = await api.createOrganization(body);
      return { organization };
    },
    onSuccess: async ({ organization }) => {
      await syncSelectedOrganization(organization.id);
      notify({
        tone: "success",
        title: "Workspace created",
        message: "The workspace is ready. Add a Postgres connector to discover tables and views.",
      });
      navigate("/data-sources", { replace: true });
    },
    onError: (error) => {
      notify({
        tone: "error",
        title: "Workspace creation failed",
        message: error instanceof Error ? error.message : "Could not create the workspace.",
      });
    },
  });

  const guarded = (element: ReactNode) => (
    <WorkspaceGate
      loading={organizationsQuery.isPending}
      error={organizationsQuery.isError}
      hasOrganizations={hasOrganizations}
      organizationId={selectedOrganizationId}
    >
      {element}
    </WorkspaceGate>
  );

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
        <Route
          path="onboarding"
          element={
            <WorkspaceOnboardingPage
              creating={workspaceMutation.isPending}
              onCreateWorkspace={(body) => workspaceMutation.mutateAsync(body).then(() => undefined)}
            />
          }
        />
        <Route path="impact" element={<ImpactPage organizationId={selectedOrganizationId} />} />
        <Route path="cases" element={guarded(<CasesPage organizationId={selectedOrganizationId} />)} />
        <Route path="live-ops" element={guarded(<LiveOpsPage organizationId={selectedOrganizationId} />)} />
        <Route path="detectors" element={guarded(<DetectorsPage organizationId={selectedOrganizationId} />)} />
        <Route path="sla-rulebook" element={guarded(<SlaRulebookPage organizationId={selectedOrganizationId} />)} />
        <Route path="action-center" element={guarded(<ActionCenterPage organizationId={selectedOrganizationId} />)} />
        <Route
          path="data-sources"
          element={guarded(
            <DataSourcesPage
              organizationId={selectedOrganizationId}
            />
          )}
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
        <Route
          path="copilot"
          element={guarded(<CopilotPage organizationId={selectedOrganizationId} onSubmit={investigate} />)}
        />
      </Route>
    </Routes>
  );
}
