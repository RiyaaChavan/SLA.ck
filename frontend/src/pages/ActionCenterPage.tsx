import { useMemo, useState } from "react";
import type { ActionRequest } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useActions,
  useApproveAction,
  useAutoMode,
  useExecuteAction,
  usePutAutoMode,
  useRejectAction,
} from "../hooks/useBusinessSentry";
import { NavLink } from "react-router-dom";

type ActionCenterPageProps = {
  organizationId?: number;
};

type TabId = "pending" | "decided" | "executed" | "auto";

export function ActionCenterPage({ organizationId }: ActionCenterPageProps) {
  const [tab, setTab] = useState<TabId>("pending");
  const q = useActions(organizationId);
  const autoQ = useAutoMode(organizationId);
  const approve = useApproveAction(organizationId);
  const reject = useRejectAction(organizationId);
  const execute = useExecuteAction(organizationId);
  const putAuto = usePutAutoMode(organizationId);

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    if (tab === "pending") return rows.filter((a) => a.approval_state === "pending");
    if (tab === "decided")
      return rows.filter((a) => a.approval_state === "approved" || a.approval_state === "rejected");
    if (tab === "executed") return rows.filter((a) => a.execution_state === "executed");
    return rows;
  }, [q.data, tab]);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageHeader
        title="Approvals"
        subtitle="Human-in-the-loop before agents or workflows execute — pending, decided, executed, and auto mode."
      />

      <div className="bs-tabs">
        <button type="button" className={tab === "pending" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("pending")}>
          Pending approval
        </button>
        <button type="button" className={tab === "decided" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("decided")}>
          Approved / Rejected
        </button>
        <button type="button" className={tab === "executed" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("executed")}>
          Executed / Closed
        </button>
        <button type="button" className={tab === "auto" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("auto")}>
          Auto mode
        </button>
      </div>

      {tab === "auto" ? (
        <AutoModePanel
          data={autoQ.data}
          loading={autoQ.isPending}
          error={autoQ.isError}
          onToggle={(enabled) => {
            if (!organizationId || !autoQ.data) return;
            putAuto.mutate({ ...autoQ.data, organization_id: organizationId, enabled });
          }}
          saving={putAuto.isPending}
        />
      ) : q.isPending ? (
        <StateBlock title="Loading actions" loading />
      ) : q.isError ? (
        <StateBlock title="Failed to load actions" />
      ) : !filtered.length ? (
        <StateBlock title="No actions in this tab" description="Try another tab or run approval/execute from mock data." />
      ) : (
        <div className="bs-action-grid">
          {filtered.map((a) => (
            <ActionCard
              key={a.id}
              a={a}
              showApprove={tab === "pending"}
              showExecute={a.approval_state === "approved" && a.execution_state !== "executed" && tab !== "executed"}
              busy={approve.isPending || reject.isPending || execute.isPending}
              onApprove={() => approve.mutate(a.id)}
              onReject={() => reject.mutate(a.id)}
              onExecute={() => execute.mutate(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  a,
  showApprove,
  showExecute,
  busy,
  onApprove,
  onReject,
  onExecute,
}: {
  a: ActionRequest;
  showApprove: boolean;
  showExecute: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="card bs-action-card">
      <div className="card-header">
        <div>
          <div className="card-title">{a.title}</div>
          <div className="card-subtitle">
            Case{" "}
            <NavLink to={`/cases?case=${encodeURIComponent(a.case_id)}`} className="bs-link">
              {a.case_id}
            </NavLink>
          </div>
        </div>
        <span className={`badge badge-${a.risk_level === "high" ? "critical" : "default"}`}>{a.risk_level}</span>
      </div>
      <div className="card-body">
        <p className="td-sub">{a.rationale}</p>
        <div className="bs-action-meta">
          <span>Expected savings</span>
          <strong>{formatMoneyInr(a.expected_savings)}</strong>
          <span>Avoided loss</span>
          <strong>{formatMoneyInr(a.avoided_loss)}</strong>
          <span>Approver</span>
          <strong>{a.required_approver}</strong>
          <span>Evidence</span>
          <strong className="bs-muted">{a.evidence_pack_summary}</strong>
        </div>
        <div className="bs-pill-row" style={{ marginTop: 12 }}>
          <span className="badge badge-default">Approval: {a.approval_state}</span>
          <span className="badge badge-default">Execution: {a.execution_state}</span>
        </div>
        <div className="td-sub" style={{ marginTop: 8 }}>
          Updated {formatDateTime(a.updated_at)}
        </div>
        <div className="bs-card-actions">
          {showApprove ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove}>
                Approve
              </button>
              <button type="button" className="btn btn-ghost-danger btn-sm" disabled={busy} onClick={onReject}>
                Reject
              </button>
            </>
          ) : null}
          {showExecute ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onExecute}>
              Execute
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AutoModePanel({
  data,
  loading,
  error,
  onToggle,
  saving,
}: {
  data?: { enabled: boolean; scopes: string[]; updated_at: string };
  loading: boolean;
  error: boolean;
  onToggle: (enabled: boolean) => void;
  saving: boolean;
}) {
  if (loading) return <StateBlock title="Loading auto mode" loading />;
  if (error || !data) return <StateBlock title="Could not load auto mode" />;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Auto mode</div>
          <div className="card-subtitle">Low-touch execution for scoped, policy-safe actions (phase 1 stub).</div>
        </div>
        <label className="bs-toggle">
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={saving}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>{data.enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <div className="card-body">
        <p className="td-sub">Scopes: {data.scopes.join(", ") || "—"}</p>
        <p className="td-sub">Last updated {formatDateTime(data.updated_at)}</p>
      </div>
    </div>
  );
}
