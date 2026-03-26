import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { CreateOrganizationInput } from "../api/client";
import { PageHeader } from "../components/business-sentry/PageHeader";

type WorkspaceOnboardingPageProps = {
  hasOrganizations: boolean;
  creating: boolean;
  onCreateWorkspace: (body: CreateOrganizationInput) => Promise<void>;
};

export function WorkspaceOnboardingPage({
  hasOrganizations,
  creating,
  onCreateWorkspace,
}: WorkspaceOnboardingPageProps) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (hasOrganizations) {
    return <Navigate to="/data-sources" replace />;
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      name: name.trim(),
      industry: industry.trim(),
      geography: geography.trim(),
    };

    if (!payload.name || !payload.industry || !payload.geography) {
      setError("Name, industry, and geography are required.");
      return;
    }

    setError(null);
    try {
      await onCreateWorkspace(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Create workspace"
        subtitle="Set up a workspace and register the first connector stub so the rest of the app can load against it."
      />

      <div className="card" style={{ maxWidth: 680 }}>
        <form className="card-body bs-detail-form" onSubmit={submit}>
          <label className="bs-field">
            <span>Workspace name</span>
            <input
              className="bs-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Northstar Ops"
              autoFocus
            />
          </label>

          <label className="bs-field">
            <span>Industry</span>
            <input
              className="bs-input"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Retail operations"
            />
          </label>

          <label className="bs-field">
            <span>Geography</span>
            <input
              className="bs-input"
              value={geography}
              onChange={(event) => setGeography(event.target.value)}
              placeholder="India"
            />
          </label>

          <div className="td-sub">
            This creates the workspace and immediately adds a starter connector stub so data pages no longer block on workspace selection.
          </div>

          {error ? <div className="bs-banner bs-banner-warn">{error}</div> : null}

          <div className="bs-card-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
