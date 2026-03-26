import { useMemo, useState } from "react";
import type { ActionRequest, AutoModeSettings } from "../domain/business-sentry";
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

const APPROVAL_STAGES = [
  { id: "pending", label: "Pending Review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "executed", label: "Executed" }
];

export function ActionCenterPage({ organizationId }: ActionCenterPageProps) {
  const q = useActions(organizationId);
  const autoQ = useAutoMode(organizationId);
  const approve = useApproveAction(organizationId);
  const reject = useRejectAction(organizationId);
  const execute = useExecuteAction(organizationId);
  const putAuto = usePutAutoMode(organizationId);

  const getStage = (a: ActionRequest) => {
    if (a.execution_state === "executed") return "executed";
    if (a.approval_state === "approved") return "approved";
    if (a.approval_state === "rejected") return "rejected";
    return "pending";
  };

  const rows = q.data ?? [];
  const columns = APPROVAL_STAGES.map(stage => ({
    ...stage,
    items: rows.filter(r => getStage(r) === stage.id)
  }));

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Approvals"
        subtitle="Human-in-the-loop workflow before agents or workflows execute."
      />

      <div style={{ marginBottom: 20 }}>
        <AutoModePanel
          data={autoQ.data}
          loading={autoQ.isPending}
          error={autoQ.isError}
          onPolicyToggle={(policyId, enabled) => {
            if (!organizationId) return;
            putAuto.mutate([{ id: policyId, enabled }]);
          }}
          saving={putAuto.isPending}
        />
      </div>

      {q.isPending ? (
        <StateBlock title="Loading actions" loading />
      ) : q.isError ? (
        <StateBlock title="Failed to load actions" />
      ) : (
        <div className="bs-kanban-board">
          {columns.map(col => (
            <div key={col.id} className="bs-kanban-column">
              <div className="bs-kanban-column-header">
                <h3 className="bs-kanban-column-title">{col.label}</h3>
                <span className="bs-kanban-count">{col.items.length}</span>
              </div>
              <div className="bs-kanban-cards">
                {col.items.map(a => (
                  <ActionCard
                    key={a.id}
                    a={a}
                    showApprove={col.id === "pending"}
                    showExecute={col.id === "approved"}
                    busy={approve.isPending || reject.isPending || execute.isPending}
                    onApprove={() =>
                      approve.mutate({
                        actionId: a.id,
                        approver_name: a.required_approver,
                      })
                    }
                    onReject={() =>
                      reject.mutate({
                        actionId: a.id,
                        approver_name: a.required_approver,
                      })
                    }
                    onExecute={() => execute.mutate(a.id)}
                  />
                ))}
              </div>
            </div>
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
    <div className="bs-kanban-card">
      <div className="bs-kanban-card-header">
        <span className="bs-kanban-card-id">Case {a.case_id}</span>
        <span className={`badge badge-${a.risk_level === "high" ? "critical" : "default"}`}>{a.risk_level}</span>
      </div>
      <div className="bs-kanban-card-title">{a.title}</div>
      <p className="td-sub" style={{ marginBottom: 12 }}>{a.rationale}</p>
      {a.evidence_pack_summary.length > 0 ? (
        <p className="td-sub" style={{ marginBottom: 12, fontSize: 12 }}>
          Evidence: {a.evidence_pack_summary.join(" · ")}
        </p>
      ) : null}
      <div className="bs-kanban-card-meta">
        <div className="bs-kanban-meta-item">
          <span className="bs-muted">Savings</span>
          <strong>{formatMoneyInr(a.expected_savings)}</strong>
        </div>
        <div className="bs-kanban-meta-item">
          <span className="bs-muted">Avoided loss</span>
          <strong>{formatMoneyInr(a.avoided_loss)}</strong>
        </div>
        <div className="bs-kanban-meta-item">
          <span className="bs-muted">Approver</span>
          <strong>{a.required_approver}</strong>
        </div>
      </div>
      <div className="bs-card-actions" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        {showApprove ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove} style={{ flex: 1 }}>
              Approve
            </button>
            <button type="button" className="btn btn-ghost-danger btn-sm" disabled={busy} onClick={onReject} style={{ flex: 1 }}>
              Reject
            </button>
          </>
        ) : null}
        {showExecute ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onExecute} style={{ flex: 1 }}>
            Execute Action
          </button>
        ) : null}
        {!showApprove && !showExecute && (
          <span className="bs-muted" style={{ fontSize: 12 }}>Updated {formatDateTime(a.updated_at)}</span>
        )}
      </div>
    </div>
  );
}

function AutoModePanel({
  data,
  loading,
  error,
  onPolicyToggle,
  saving,
}: {
  data?: AutoModeSettings;
  loading: boolean;
  error: boolean;
  onPolicyToggle: (policyId: number, enabled: boolean) => void;
  saving: boolean;
}) {
  if (loading) return <StateBlock title="Loading auto mode" loading />;
  if (error || !data) return <StateBlock title="Could not load auto mode" />;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Auto mode</div>
          <div className="card-subtitle">Per-policy toggles for low-touch execution within guardrails.</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {data.policies.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingBottom: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="td-sub" style={{ marginTop: 4 }}>
                {p.module} · {p.scope} · {p.risk_level} risk
              </div>
              <p className="td-sub" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                {p.condition_summary}
              </p>
              {p.allowed_actions.length > 0 ? (
                <div className="td-sub" style={{ marginTop: 6, fontSize: 11 }}>
                  Actions: {p.allowed_actions.join(", ")}
                </div>
              ) : null}
            </div>
            <label className="bs-toggle" style={{ flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={saving}
                onChange={(e) => onPolicyToggle(p.id, e.target.checked)}
              />
              <span>{p.enabled ? "On" : "Off"}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
