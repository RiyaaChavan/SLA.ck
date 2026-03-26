import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ActionRequest, AutoModeSettings } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import type { ConfirmConfig } from "../components/shared/ConfirmModal";
import { useNotifications } from "../components/shared/Notifications";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useActions,
  useApproveAction,
  useAutoMode,
  useExecuteAction,
  usePutAutoMode,
  useRejectAction,
} from "../hooks/useBusinessSentry";

type ActionCenterPageProps = {
  organizationId?: number;
};

const APPROVAL_STAGES = [
  { id: "pending", label: "Pending Review", colClass: "bs-kanban-column-pending", dotClass: "bs-kanban-col-dot-pending" },
  { id: "approved", label: "Approved", colClass: "bs-kanban-column-approved", dotClass: "bs-kanban-col-dot-approved" },
  { id: "rejected", label: "Rejected", colClass: "bs-kanban-column-rejected", dotClass: "bs-kanban-col-dot-rejected" },
  { id: "executed", label: "Executed", colClass: "bs-kanban-column-executed", dotClass: "bs-kanban-col-dot-executed" },
];

function humanizeActionType(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ");
}

function actionRiskBadgeClass(risk: string): string {
  const x = risk.toLowerCase();
  if (x === "critical" || x === "high") return "badge-critical";
  if (x === "medium") return "badge-medium";
  if (x === "low") return "badge-low";
  return "badge-default";
}

function parseEvidenceLine(line: string): { label: string; value: string } | null {
  const m = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
  if (!m) return null;
  return { label: m[1].trim(), value: m[2].trim() };
}

export function ActionCenterPage({ organizationId }: ActionCenterPageProps) {
  const { notify } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const intakeRec = searchParams.get("intakeRec");
  const q = useActions(organizationId);
  const autoQ = useAutoMode(organizationId);
  const approve = useApproveAction(organizationId);
  const reject = useRejectAction(organizationId);
  const execute = useExecuteAction(organizationId);
  const putAuto = usePutAutoMode(organizationId);
  const [pendingConfirm, setPendingConfirm] = useState<(ConfirmConfig & { onConfirm: () => void }) | null>(null);

  const confirm = (cfg: ConfirmConfig & { onConfirm: () => void }) => setPendingConfirm(cfg);

  const getStage = (a: ActionRequest) => {
    if (a.execution_state === "executed") return "executed";
    if (a.approval_state === "approved") return "approved";
    if (a.approval_state === "rejected") return "rejected";
    return "pending";
  };

  const rows = q.data ?? [];
  const columns = APPROVAL_STAGES.map((stage) => ({
    ...stage,
    items: rows.filter((r) => getStage(r) === stage.id),
  }));

  const intakeMatch = useMemo(() => {
    if (!intakeRec) return null;
    return rows.find((r) => r.recommendation_id === intakeRec) ?? null;
  }, [intakeRec, rows]);

  useEffect(() => {
    if (!intakeRec || !intakeMatch) return;
    const el = document.getElementById(`bs-action-card-${intakeMatch.id}`);
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [intakeRec, intakeMatch, q.dataUpdatedAt]);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before reviewing approvals." />
      </div>
    );
  }

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Approvals"
        subtitle="Human-in-the-loop workflow before agents or workflows execute."
      />

      {intakeRec ? (
        <div
          className={`bs-intake-rec-banner ${intakeMatch ? "bs-intake-rec-banner-ok" : "bs-intake-rec-banner-warn"}`}
        >
          <span>
            {intakeMatch ? (
              <>
                Highlighting the action linked to recommendation <strong>#{intakeRec}</strong> (action #{intakeMatch.id}
                , alert #{intakeMatch.case_id}).
              </>
            ) : (
              <>
                No action in this workspace matches recommendation <strong>#{intakeRec}</strong>. The list shows{" "}
                <strong>action</strong> rows — confirm the id from intake, or switch organization. Pending items are
                sorted by impact; the row may be in another approval column.
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("intakeRec");
              setSearchParams(next, { replace: true });
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div style={{ marginBottom: 20 }}>
        <AutoModePanel
          data={autoQ.data}
          loading={autoQ.isPending}
          error={autoQ.isError}
          onPolicyToggle={(policyId, enabled) => {
            if (!organizationId) return;
            putAuto.mutate(
              [{ id: policyId, enabled }],
              {
                onSuccess: () => {
                  notify({
                    tone: "info",
                    title: "Auto mode updated",
                    message: `Policy ${policyId} was turned ${enabled ? "on" : "off"}.`,
                  });
                },
                onError: () => {
                  notify({
                    tone: "error",
                    title: "Auto mode update failed",
                    message: `Could not update policy ${policyId}.`,
                  });
                },
              },
            );
          }}
          saving={putAuto.isPending}
        />
      </div>

      {q.isPending ? (
        <StateBlock title="Loading actions" loading />
      ) : q.isError ? (
        <StateBlock title="Failed to load actions" />
      ) : (
        <div
          className="bs-kanban-board bs-kanban-board-approvals"
          style={{ ["--bs-kanban-cols" as string]: String(APPROVAL_STAGES.length) }}
        >
          {columns.map((col) => (
            <div key={col.id} className={`bs-kanban-column ${col.colClass}`}>
              <div className="bs-kanban-column-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`bs-kanban-col-dot ${col.dotClass}`} />
                  <h3 className="bs-kanban-column-title">{col.label}</h3>
                </div>
                <span className="bs-kanban-count">{col.items.length}</span>
              </div>
              <div className="bs-kanban-cards">
                {col.items.map((a) => (
                  <ActionCard
                    key={a.id}
                    a={a}
                    highlight={Boolean(intakeRec && a.recommendation_id === intakeRec)}
                    showApprove={col.id === "pending"}
                    showExecute={col.id === "approved"}
                    busy={approve.isPending || reject.isPending || execute.isPending}
                    onApprove={() =>
                      approve.mutate(
                        {
                          actionId: a.id,
                          approver_name: a.required_approver,
                        },
                        {
                          onSuccess: () => {
                            notify({
                              tone: "success",
                              title: "Action approved",
                              message: `${a.title} was approved by ${a.required_approver}.`,
                            });
                          },
                          onError: () => {
                            notify({
                              tone: "error",
                              title: "Approval failed",
                              message: `Could not approve ${a.title}.`,
                            });
                          },
                        },
                      )
                    }
                    onReject={() =>
                      confirm({
                        title: "Reject this action?",
                        message: `"${a.title}" will be rejected and marked as cancelled. This cannot be undone in the current session.`,
                        confirmLabel: "Reject action",
                        variant: "danger",
                        onConfirm: () =>
                          reject.mutate(
                            {
                              actionId: a.id,
                              approver_name: a.required_approver,
                            },
                            {
                              onSuccess: () => {
                                notify({
                                  tone: "warning",
                                  title: "Action rejected",
                                  message: `${a.title} was rejected and will not execute.`,
                                });
                              },
                              onError: () => {
                                notify({
                                  tone: "error",
                                  title: "Reject failed",
                                  message: `Could not reject ${a.title}.`,
                                });
                              },
                            },
                          )
                      })
                    }
                    onExecute={() =>
                      confirm({
                        title: "Execute this action?",
                        message: `"${a.title}" will be executed immediately. Make sure all approvers have signed off before proceeding.`,
                        confirmLabel: "Execute now",
                        variant: "warning",
                        onConfirm: () =>
                          execute.mutate(a.id, {
                            onSuccess: () => {
                              notify({
                                tone: "success",
                                title: "Action executed",
                                message: `${a.title} has been executed.`,
                              });
                            },
                            onError: () => {
                              notify({
                                tone: "error",
                                title: "Execution failed",
                                message: `Could not execute ${a.title}.`,
                              });
                            },
                          })
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingConfirm ? (
        <ConfirmModal
          {...pendingConfirm}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function ActionCard({
  a,
  highlight,
  showApprove,
  showExecute,
  busy,
  onApprove,
  onReject,
  onExecute,
}: {
  a: ActionRequest;
  highlight: boolean;
  showApprove: boolean;
  showExecute: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
}) {
  const parsedEvidence = a.evidence_pack_summary.map(parseEvidenceLine);
  const hasStructured = parsedEvidence.every((p) => p !== null) && parsedEvidence.length > 0;

  return (
    <div
      id={`bs-action-card-${a.id}`}
      className={`bs-kanban-card ${highlight ? "bs-action-card-highlight" : ""}`}
      style={{ borderLeft: a.risk_level === "high" ? "2px solid rgba(239,68,68,0.6)" : "2px solid rgba(36,119,208,0.3)" }}
    >
      <div className="bs-kanban-card-header">
        <span className="bs-kanban-card-id">
          Action {a.id} · Alert {a.case_id}
          {a.recommendation_id ? <> · Rec {a.recommendation_id}</> : null}
        </span>
        <span className={`badge ${actionRiskBadgeClass(a.risk_level)}`}>{a.risk_level}</span>
      </div>
      <div className="bs-action-card-badges">
        {a.alert_type ? (
          <span className="bs-action-type-pill" title="Alert type">
            {humanizeActionType(a.alert_type)}
          </span>
        ) : null}
        {a.action_type ? (
          <span className="bs-action-type-pill bs-action-type-pill-accent" title="Action type">
            {humanizeActionType(a.action_type)}
          </span>
        ) : null}
      </div>
      <div className="bs-kanban-card-title">{a.alert_title}</div>
      <div className="td-sub bs-action-proposed-line">
        <span className="bs-muted">Proposed step:</span> {a.title}
      </div>
      <p className="td-sub bs-action-rationale">{a.rationale}</p>
      {a.evidence_pack_summary.length > 0 ? (
        hasStructured ? (
          <dl className="bs-action-evidence-dl">
            {parsedEvidence.map((p, i) =>
              p ? (
                <div key={i} className="bs-action-evidence-row">
                  <dt>{p.label}</dt>
                  <dd>{p.value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        ) : (
          <ul className="td-sub bs-action-evidence-list">
            {a.evidence_pack_summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )
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
        <div className="bs-kanban-meta-item">
          <span className="bs-muted">Next step</span>
          <strong>{a.recommended_next_step}</strong>
        </div>
      </div>
      <div className="bs-card-actions bs-action-card-actions">
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
              {policy.allowed_actions.length > 0 ? (
                <div className="td-sub" style={{ marginTop: 6, fontSize: 11 }}>
                  Actions: {policy.allowed_actions.join(", ")}
                </div>
              ) : null}
            </div>
            <label className="bs-toggle" style={{ flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={policy.enabled}
                disabled={saving}
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
