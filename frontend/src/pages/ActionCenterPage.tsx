import { useMemo, useState } from "react";
import type { ActionRequest, AutoModeSettings } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { demoActions, demoAutoMode } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";

type ActionCenterPageProps = {
  organizationId?: number;
};

const APPROVAL_STAGES = [
  { id: "pending", label: "Pending Review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "executed", label: "Executed" },
];

export function ActionCenterPage(_: ActionCenterPageProps) {
  const [actions, setActions] = useState(demoActions);
  const [autoMode, setAutoMode] = useState(demoAutoMode);

  const getStage = (action: ActionRequest) => {
    if (action.execution_state === "executed") return "executed";
    if (action.approval_state === "approved") return "approved";
    if (action.approval_state === "rejected") return "rejected";
    return "pending";
  };

  const columns = useMemo(
    () =>
      APPROVAL_STAGES.map((stage) => ({
        ...stage,
        items: actions.filter((row) => getStage(row) === stage.id),
      })),
    [actions],
  );

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Approvals"
        subtitle="Human-in-the-loop workflow before agents or automations execute. Buttons are fully interactive in this demo."
      />

      <div style={{ marginBottom: 20 }}>
        <AutoModePanel
          data={autoMode}
          onPolicyToggle={(policyId, enabled) =>
            setAutoMode((current) => ({
              ...current,
              policies: current.policies.map((policy) => (policy.id === policyId ? { ...policy, enabled } : policy)),
            }))
          }
        />
      </div>

      <div className="bs-kanban-board">
        {columns.map((column) => (
          <div key={column.id} className="bs-kanban-column">
            <div className="bs-kanban-column-header">
              <h3 className="bs-kanban-column-title">{column.label}</h3>
              <span className="bs-kanban-count">{column.items.length}</span>
            </div>
            <div className="bs-kanban-cards">
              {column.items.map((action) => (
                <ActionCard
                  key={action.id}
                  a={action}
                  showApprove={column.id === "pending"}
                  showExecute={column.id === "approved"}
                  onApprove={() =>
                    setActions((current) =>
                      current.map((item) =>
                        item.id === action.id
                          ? { ...item, approval_state: "approved", updated_at: new Date().toISOString() }
                          : item,
                      ),
                    )
                  }
                  onReject={() =>
                    setActions((current) =>
                      current.map((item) =>
                        item.id === action.id
                          ? { ...item, approval_state: "rejected", execution_state: "cancelled", updated_at: new Date().toISOString() }
                          : item,
                      ),
                    )
                  }
                  onExecute={() =>
                    setActions((current) =>
                      current.map((item) =>
                        item.id === action.id
                          ? { ...item, execution_state: "executed", updated_at: new Date().toISOString() }
                          : item,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  a,
  showApprove,
  showExecute,
  onApprove,
  onReject,
  onExecute,
}: {
  a: ActionRequest;
  showApprove: boolean;
  showExecute: boolean;
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
      <p className="td-sub" style={{ marginBottom: 12 }}>
        {a.rationale}
      </p>
      {a.evidence_pack_summary.length ? (
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
            <button type="button" className="btn btn-primary btn-sm" onClick={onApprove} style={{ flex: 1 }}>
              Approve
            </button>
            <button type="button" className="btn btn-ghost-danger btn-sm" onClick={onReject} style={{ flex: 1 }}>
              Reject
            </button>
          </>
        ) : null}
        {showExecute ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onExecute} style={{ flex: 1 }}>
            Execute Action
          </button>
        ) : null}
        {!showApprove && !showExecute ? (
          <span className="bs-muted" style={{ fontSize: 12 }}>
            Updated {formatDateTime(a.updated_at)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AutoModePanel({
  data,
  onPolicyToggle,
}: {
  data: AutoModeSettings;
  onPolicyToggle: (policyId: number, enabled: boolean) => void;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Auto mode</div>
          <div className="card-subtitle">Per-policy toggles for low-touch execution within guardrails.</div>
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {data.policies.map((policy) => (
          <div
            key={policy.id}
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
              <div style={{ fontWeight: 600 }}>{policy.name}</div>
              <div className="td-sub" style={{ marginTop: 4 }}>
                {policy.module} · {policy.scope} · {policy.risk_level} risk
              </div>
              <p className="td-sub" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                {policy.condition_summary}
              </p>
              {policy.allowed_actions.length ? (
                <div className="td-sub" style={{ marginTop: 6, fontSize: 11 }}>
                  Actions: {policy.allowed_actions.join(", ")}
                </div>
              ) : null}
            </div>
            <label className="bs-toggle" style={{ flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={policy.enabled}
                onChange={(e) => onPolicyToggle(policy.id, e.target.checked)}
              />
              <span>{policy.enabled ? "On" : "Off"}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
