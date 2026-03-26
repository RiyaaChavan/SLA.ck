import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import type { ConfirmConfig } from "../components/shared/ConfirmModal";
import {
  useSlaRules,
  useUpdateSlaRule,
  useArchiveSlaRule,
  useSlaExtractions,
  useSlaExtractionUpload,
  useSlaBatchApprove,
  useSlaBatchDiscard,
  useDiscardSlaCandidate,
  useRescanAlerts,
} from "../hooks/useBusinessSentry";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";

type SlaRulebookPageProps = { organizationId?: number };

type ExtractionRun = {
  fileName: string;
  progress: number;
  startedAt: number;
};

/* ── UI Components ─────────────────────────────────────────── */

function SlaDropzone({ onUpload, uploading }: { onUpload: (file: File) => void; uploading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={uploading ? "bs-dropzone bs-dropzone-uploading" : "bs-dropzone"} onClick={() => !uploading && inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        className="bs-file-input"
        accept=".pdf,.doc,.docx,.txt,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <div className="bs-dropzone-content">
        <div className="bs-dropzone-icon">+</div>
        <div className="bs-dropzone-text">
          <strong>Upload contract or policy doc</strong>
        </div>
        <div className="bs-dropzone-subtext">PDF, DOCX, text, or images. AI will analyze and suggest SLA candidates.</div>
      </div>
    </div>
  );
}

function ExtractionProgressModal({ fileName, progress }: { fileName: string; progress: number }) {
  return (
    <div className="bs-modal-backdrop" role="presentation">
      <div className="card bs-modal-card bs-sla-progress-modal" role="dialog" aria-modal="true" aria-labelledby="sla-progress-title">
        <div className="card-body bs-sla-progress-body">
          <div className="bs-sla-progress-kicker">SLA Extraction Runtime</div>
          <div id="sla-progress-title" className="card-title bs-sla-progress-title">
            Extracting SLA clauses from {fileName}
          </div>
          <p className="bs-sla-progress-copy">
            Parsing the document, isolating obligations, and shaping review-ready SLA candidates.
          </p>
          <div className="bs-sla-progress-track" aria-hidden="true">
            <div className="bs-sla-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="bs-sla-progress-meta">
            <span>Processing contract</span>
            <strong>{progress}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleEditModal({
  rule,
  onClose,
  onSave,
}: {
  rule: SlaRulebookEntry;
  onClose: () => void;
  onSave: (rule: SlaRulebookEntry) => void;
}) {
  const [draft, setDraft] = useState(rule);
  return (
    <div className="bs-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="card bs-modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="card-title">Edit Rule</div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="bs-field">
            <span>Name</span>
            <input className="bs-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="bs-field">
            <span>Applies to</span>
            <input className="bs-input" value={draft.applies_to} onChange={(e) => setDraft({ ...draft, applies_to: e.target.value })} />
          </label>
          <label className="bs-field">
            <span>Conditions</span>
            <textarea className="bs-textarea" rows={3} value={draft.conditions} onChange={(e) => setDraft({ ...draft, conditions: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="bs-field" style={{ flex: 1 }}>
              <span>Response hours</span>
              <input
                className="bs-input"
                type="number"
                value={draft.response_deadline_hours}
                onChange={(e) => setDraft({ ...draft, response_deadline_hours: Number(e.target.value) })}
              />
            </label>
            <label className="bs-field" style={{ flex: 1 }}>
              <span>Resolution hours</span>
              <input
                className="bs-input"
                type="number"
                value={draft.resolution_deadline_hours}
                onChange={(e) => setDraft({ ...draft, resolution_deadline_hours: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="bs-field">
            <span>Penalty</span>
            <input
              className="bs-input"
              type="number"
              value={draft.penalty_amount}
              onChange={(e) => setDraft({ ...draft, penalty_amount: Number(e.target.value) })}
            />
          </label>
          <label className="bs-toggle">
            <input
              type="checkbox"
              checked={draft.auto_action_allowed}
              onChange={(e) => setDraft({ ...draft, auto_action_allowed: e.target.checked })}
            />
            <span>Auto action allowed</span>
          </label>
          <div className="bs-card-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(draft)}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateEditModal({
  candidate,
  onClose,
  onSave,
}: {
  candidate: SlaExtractionCandidate;
  onClose: () => void;
  onSave: (candidate: SlaExtractionCandidate) => void;
}) {
  const [draft, setDraft] = useState(candidate);
  return (
    <div className="bs-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="card bs-modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div className="card-title">Edit Candidate</div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="bs-field">
            <span>Name</span>
            <input className="bs-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="bs-field">
            <span>Conditions</span>
            <textarea
              className="bs-textarea"
              rows={3}
              value={draft.conditions ?? ""}
              onChange={(e) => setDraft({ ...draft, conditions: e.target.value })}
            />
          </label>
          <label className="bs-field">
            <span>Escalation owner</span>
            <input
              className="bs-input"
              value={draft.escalation_owner ?? ""}
              onChange={(e) => setDraft({ ...draft, escalation_owner: e.target.value })}
            />
          </label>
          <div className="bs-card-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(draft)}>
              Save edits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */

export function SlaRulebookPage({ organizationId }: SlaRulebookPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify } = useNotifications();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("");
  const [editRule, setEditRule] = useState<SlaRulebookEntry | null>(null);
  const [editCandidate, setEditCandidate] = useState<SlaExtractionCandidate | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<(ConfirmConfig & { onConfirm: () => void }) | null>(null);
  const [extractionRun, setExtractionRun] = useState<ExtractionRun | null>(null);

  const qRules = useSlaRules(organizationId);
  const qExtractions = useSlaExtractions(organizationId);

  const updateMut = useUpdateSlaRule(organizationId);
  const archiveMut = useArchiveSlaRule(organizationId);
  const uploadMut = useSlaExtractionUpload(organizationId);
  const approveMut = useSlaBatchApprove(organizationId);
  const discardBatchMut = useSlaBatchDiscard(organizationId);
  const discardCandidateMut = useDiscardSlaCandidate(organizationId);
  const rescanMut = useRescanAlerts(organizationId);

  const tab = useMemo(
    () => (searchParams.get("tab") === "active" ? "active" : "extraction"),
    [searchParams]
  );
  const setTab = (next: "extraction" | "active") => {
    setSearchParams(next === "active" ? { tab: "active" } : { tab: "extraction" }, { replace: true });
  };

  const rules = useMemo(() => qRules.data ?? [], [qRules.data]);

  const batches = useMemo(() => qExtractions.data ?? [], [qExtractions.data]);

  const activeRules = useMemo(() => {
    return rules.filter(
      (rule) =>
        rule.status === "active" &&
        (!filter ||
          rule.name.toLowerCase().includes(filter.toLowerCase()) ||
          rule.applies_to.toLowerCase().includes(filter.toLowerCase()) ||
          rule.conditions.toLowerCase().includes(filter.toLowerCase()))
    );
  }, [rules, filter]);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const handleUpload = (file: File) => {
    stopProgress();
    const startedAt = Date.now();
    setExtractionRun({ fileName: file.name, progress: 0, startedAt });

    progressTimerRef.current = setInterval(() => {
      setExtractionRun((run) => {
        if (!run || run.progress >= 80) return run;
        const elapsed = Date.now() - run.startedAt;
        const progress = Math.min(80, Math.round((elapsed / 10000) * 80));
        return { ...run, progress };
      });
    }, 150);

    uploadMut.mutate(
      { file },
      {
        onSuccess: () => {
          stopProgress();
          setExtractionRun((run) => (run ? { ...run, progress: 100 } : run));
          setTimeout(() => setExtractionRun(null), 600);
        },
        onError: () => {
          stopProgress();
          setExtractionRun(null);
          notify({ tone: "error", title: "Upload failed", message: "Could not process document." });
        },
      },
    );
  };

  const handleRescan = () => {
    rescanMut.mutate(undefined, {
      onSuccess: () => notify({ tone: "success", title: "Detector rescan complete", message: "Impact and metrics refreshed." }),
    });
  };

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Choose a workspace" description="Select a workspace to view SLA rules." />
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageHeader
        title="SLA Guardrails"
        subtitle="Govern contract obligations. Extract new rules from PDF/DOCX or manage the active policy list."
      />

      <div className="bs-sla-toolbar">
        <p className="bs-sla-toolbar-hint td-sub">
          Active rules define the core monitoring thresholds. Approve extracted candidates to move them to production.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={rescanMut.isPending}
          onClick={handleRescan}
        >
          {rescanMut.isPending ? "Rescanning..." : "Rescan Alerts"}
        </button>
      </div>

      <div className="bs-tabs">
        <button type="button" className={tab === "extraction" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("extraction")}>
          Extraction Review
        </button>
        <button type="button" className={tab === "active" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("active")}>
          Active Rulebook
        </button>
      </div>

      {tab === "extraction" ? (
        <>
          <SlaDropzone
            uploading={Boolean(extractionRun)}
            onUpload={handleUpload}
          />

          <div className="bs-extraction-list">
            {batches.filter(b => b.status !== "discarded").map((batch) => (
              <div key={batch.id} className="card bs-sla-batch-card">
                <div className="card-header bs-sla-batch-header">
                  <div className="bs-sla-batch-title-block">
                    <div className="card-title">{batch.source_document_name}</div>
                    <div className="card-subtitle">
                      {batch.status.replace("_", " ")} · {batch.document_type} · {formatDateTime(batch.uploaded_at)}
                    </div>
                  </div>
                  <div className="bs-sla-batch-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setPendingConfirm({
                          title: "Approve Batch?",
                          message: "This will move all current candidates into the active rulebook.",
                          confirmLabel: "Approve All",
                          onConfirm: () => approveMut.mutate({ batchId: String(batch.id) }),
                        });
                      }}
                    >
                      Approve All
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost-danger btn-sm"
                      onClick={() => {
                        setPendingConfirm({
                          title: "Discard Batch?",
                          message: "Permanently remove this extraction attempt.",
                          confirmLabel: "Discard",
                          variant: "danger",
                          onConfirm: () => discardBatchMut.mutate(String(batch.id)),
                        });
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="bs-candidate-grid">
                    {batch.candidate_rules
                      .filter((c) => c.status !== "discarded")
                      .map((candidate) => (
                        <div key={candidate.id} className="bs-candidate-card">
                          <div className="card-title">{candidate.name}</div>
                          <p className="bs-candidate-conditions">{candidate.conditions}</p>
                          <div className="bs-candidate-metrics">
                            <div>
                              <div className="td-sub">Response</div>
                              <strong>{candidate.response_deadline_hours}h</strong>
                            </div>
                            <div>
                              <div className="td-sub">Resolution</div>
                              <strong>{candidate.resolution_deadline_hours}h</strong>
                            </div>
                            <div>
                              <div className="td-sub">Penalty</div>
                              <strong>{formatMoneyInr(candidate.penalty_amount)}</strong>
                            </div>
                            <div>
                              <div className="td-sub">Confidence</div>
                              <strong style={{ color: (candidate.confidence_score ?? 0) > 0.8 ? "#6EE7B7" : "#FBB424" }}>
                                {Math.round((candidate.confidence_score ?? 0) * 100)}%
                              </strong>
                              <div className="sla-confidence-bar">
                                <div className="sla-confidence-fill" style={{ width: `${(candidate.confidence_score ?? 0) * 100}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="bs-card-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditCandidate(candidate)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost-danger btn-sm"
                              onClick={() => discardCandidateMut.mutate(String(candidate.id))}
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
            {batches.length === 0 && <StateBlock title="No extractions" description="Upload a document to see AI-suggested SLA rules." />}
          </div>
        </>
      ) : (
        <>
          <div className="bs-toolbar">
            <input
              className="bs-input bs-input-grow"
              placeholder="Search active rules..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {activeRules.length ? (
            <div className="bs-candidate-grid">
              {activeRules.map((rule) => (
                <div key={rule.id} className="bs-candidate-card">
                  <div className="card-title">{rule.name}</div>
                  <div className="card-subtitle">{rule.applies_to}</div>
                  <p className="bs-candidate-conditions">{rule.conditions}</p>
                  <div className="bs-candidate-metrics">
                    <div>
                      <div className="td-sub">Response</div>
                      <strong>{rule.response_deadline_hours}h</strong>
                    </div>
                    <div>
                      <div className="td-sub">Resolution</div>
                      <strong>{rule.resolution_deadline_hours}h</strong>
                    </div>
                    <div>
                      <div className="td-sub">Penalty</div>
                      <strong>{formatMoneyInr(rule.penalty_amount)}</strong>
                    </div>
                    <div>
                      <div className="td-sub">Owner</div>
                      <strong>{rule.escalation_owner}</strong>
                    </div>
                  </div>
                  <div className="bs-pill-row" style={{ marginTop: 10 }}>
                    <span className="bs-pill">{rule.business_hours_logic}</span>
                    <span className="bs-pill">{rule.auto_action_allowed ? "Auto-Action" : "Manual Approval"}</span>
                  </div>
                  <div className="bs-card-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditRule(rule)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost-danger btn-sm"
                      onClick={() => {
                        setPendingConfirm({
                          title: "Archive Rule?",
                          message: `"${rule.name}" will be removed from monitoring.`,
                          confirmLabel: "Archive",
                          variant: "warning",
                          onConfirm: () => archiveMut.mutate({ ruleId: String(rule.id) }),
                        });
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <StateBlock title="No active rules" description="Create or approve new rules to see them here." />
          )}
        </>
      )}

      {editRule && (
        <RuleEditModal
          rule={editRule}
          onClose={() => setEditRule(null)}
          onSave={(next) => {
            updateMut.mutate({ ruleId: String(next.id), body: { ...next } }, {
              onSuccess: () => {
                setEditRule(null);
                notify({ tone: "success", title: "Rule Updated", message: `Changes saved to ${next.name}.` });
              }
            });
          }}
        />
      )}

      {editCandidate && (
        <CandidateEditModal
          candidate={editCandidate}
          onClose={() => setEditCandidate(null)}
          onSave={(next) => {
            // usually we'd have a mutation but for now closed and notify
            setEditCandidate(null);
            notify({ tone: "warning", title: "Candidate Edited", message: "Apply changes via 'Approve All' or individual sync." });
          }}
        />
      )}

      {pendingConfirm && (
        <ConfirmModal
          {...pendingConfirm}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {extractionRun && <ExtractionProgressModal fileName={extractionRun.fileName} progress={extractionRun.progress} />}
    </div>
  );
}
