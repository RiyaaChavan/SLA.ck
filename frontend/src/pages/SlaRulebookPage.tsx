import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import type { ConfirmConfig } from "../components/shared/ConfirmModal";
import { demoSlaExtractions, demoSlaRules } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";

type SlaRulebookPageProps = {
  organizationId?: number;
};

type ExtractionRun = {
  fileName: string;
  progress: number;
  startedAt: number;
};

function buildExtractionBatch(fileName: string, offset: number): SlaExtractionBatch {
  return {
    id: `BATCH-${offset + 301}`,
    source_document_name: fileName,
    document_type: fileName.split(".").pop() ?? "file",
    status: "pending_review",
    uploaded_at: new Date().toISOString(),
    extraction_source: "gemini_contract_parse",
    run_metadata: { generated_from_demo: true, candidates_found: 2 },
    candidate_rules: [
      {
        id: 1201 + offset * 2,
        name: "Newly extracted SLA candidate",
        applies_to: "Uploaded document obligations",
        applies_to_payload: { label: "Uploaded document obligations" },
        conditions: "Detected threshold language requiring manual confirmation.",
        response_deadline_hours: 2,
        resolution_deadline_hours: 8,
        penalty_amount: 85000,
        escalation_owner: "Operations",
        business_hours_logic: "business_hours",
        auto_action_allowed: false,
        status: "pending_review",
        confidence_score: 0.84,
      },
      {
        id: 1202 + offset * 2,
        name: "Escalation policy candidate",
        applies_to: "Service recovery exceptions",
        applies_to_payload: { label: "Service recovery exceptions" },
        conditions: "Possible dispatch or response clause found in uploaded text.",
        response_deadline_hours: 1,
        resolution_deadline_hours: 4,
        penalty_amount: 135000,
        escalation_owner: "Regional Fleet Control",
        business_hours_logic: "24x7",
        auto_action_allowed: true,
        status: "pending_review",
        confidence_score: 0.79,
      },
    ],
  };
}

function SlaDropzone({ onUpload, uploading }: { onUpload: (fileName: string) => void; uploading: boolean }) {
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
          if (file) onUpload(file.name);
          e.target.value = "";
        }}
      />
      <div className="bs-dropzone-content">
        <div className="bs-dropzone-icon">+</div>
        <div className="bs-dropzone-text">
          <strong>Upload contract or policy doc</strong>
        </div>
        <div className="bs-dropzone-subtext">PDF, DOCX, text, or images. This demo immediately creates review candidates.</div>
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
          <div className="card-title">Edit rule</div>
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
              Save
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
          <div className="card-title">Edit candidate</div>
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

export function SlaRulebookPage(_: SlaRulebookPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rules, setRules] = useState(demoSlaRules);
  const [batches, setBatches] = useState(demoSlaExtractions);
  const [filter, setFilter] = useState("");
  const [editRule, setEditRule] = useState<SlaRulebookEntry | null>(null);
  const [editCandidate, setEditCandidate] = useState<SlaExtractionCandidate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<(ConfirmConfig & { onConfirm: () => void }) | null>(null);
  const [extractionRun, setExtractionRun] = useState<ExtractionRun | null>(null);

  const confirm = (cfg: ConfirmConfig & { onConfirm: () => void }) => setPendingConfirm(cfg);

  const tab = useMemo(
    () => (searchParams.get("tab") === "active" ? "active" : "extraction"),
    [searchParams],
  );
  const setTab = (next: "extraction" | "active") => {
    setSearchParams(next === "active" ? { tab: "active" } : { tab: "extraction" }, { replace: true });
  };

  const activeRules = rules.filter(
    (rule) =>
      rule.status === "active" &&
      (!filter ||
        rule.name.toLowerCase().includes(filter.toLowerCase()) ||
        rule.applies_to.toLowerCase().includes(filter.toLowerCase()) ||
        rule.conditions.toLowerCase().includes(filter.toLowerCase())),
  );

  useEffect(() => {
    if (!extractionRun) return;

    const currentRun = extractionRun;
    const durationMs = 4000;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - currentRun.startedAt;
      const progress = Math.min(100, Math.round((elapsed / durationMs) * 100));

      setExtractionRun((run) => (run ? { ...run, progress } : run));

      if (progress >= 100) {
        window.clearInterval(timer);
        setBatches((current) => [buildExtractionBatch(currentRun.fileName, current.length), ...current]);
        setMessage(`Uploaded ${currentRun.fileName}. Generated 2 candidate rules for review.`);
        setExtractionRun(null);
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, [extractionRun?.startedAt]);

  return (
    <div className="page-content">
      <PageHeader
        title="SLAs"
        subtitle="Import contracts, review extracted clauses, and govern the active SLA rulebook. This demo is fully interactive."
      />

      {message ? <div className="bs-banner bs-banner-ok">{message}</div> : null}

      <div className="bs-sla-toolbar">
        <p className="bs-sla-toolbar-hint td-sub">
          Approve sends edited candidates to the active rulebook. Rescan alerts is simulated in this demo.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setMessage("Rescanned alerts. Detector hits and action recommendations have been refreshed.")}
        >
          Rescan alerts
        </button>
      </div>

      <div className="bs-tabs">
        <button type="button" className={tab === "extraction" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("extraction")}>
          Extraction review
        </button>
        <button type="button" className={tab === "active" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("active")}>
          Active rules
        </button>
      </div>

      {tab === "extraction" ? (
        <>
          <SlaDropzone
            uploading={Boolean(extractionRun)}
            onUpload={(fileName) => {
              setMessage(null);
              setExtractionRun({ fileName, progress: 0, startedAt: Date.now() });
            }}
          />

          <div className="bs-extraction-list">
            {batches.map((batch) => (
              <div key={batch.id} className="card bs-sla-batch-card">
                <div className="card-header bs-sla-batch-header">
                  <div className="bs-sla-batch-title-block">
                    <div className="card-title">{batch.source_document_name}</div>
                    <div className="card-subtitle">
                      {batch.status} · {batch.document_type ?? "document"} · uploaded {formatDateTime(batch.uploaded_at)}
                    </div>
                  </div>
                  <div className="bs-sla-batch-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const approvedRules = batch.candidate_rules
                          .filter((candidate) => candidate.status !== "discarded")
                          .map((candidate, index) => ({
                            id: `SLA-${rules.length + index + 201}`,
                            name: candidate.name,
                            status: "active",
                            applies_to: candidate.applies_to ?? "Extracted rule",
                            applies_to_payload: candidate.applies_to_payload,
                            conditions: candidate.conditions ?? "",
                            response_deadline_hours: candidate.response_deadline_hours,
                            resolution_deadline_hours: candidate.resolution_deadline_hours,
                            penalty_amount: candidate.penalty_amount,
                            escalation_owner: candidate.escalation_owner ?? "Operations",
                            business_hours_logic: candidate.business_hours_logic ?? "business_hours",
                            auto_action_allowed: candidate.auto_action_allowed ?? false,
                            source_document_name: batch.source_document_name,
                            last_reviewed_at: new Date().toISOString(),
                          }));
                        confirm({
                          title: "Approve extraction batch?",
                          message: `This will add ${approvedRules.length} candidate rule${approvedRules.length !== 1 ? "s" : ""} from "${batch.source_document_name}" to the active rulebook.`,
                          confirmLabel: "Approve & add rules",
                          variant: "primary",
                          onConfirm: () => {
                            setRules((current) => [...approvedRules, ...current]);
                            setBatches((current) => current.filter((item) => item.id !== batch.id));
                            setMessage(`Approved ${approvedRules.length} candidate rules from ${batch.source_document_name}.`);
                          },
                        });
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost-danger btn-sm"
                      onClick={() => {
                        confirm({
                          title: "Discard this extraction batch?",
                          message: `"${batch.source_document_name}" and all its candidate rules will be permanently removed.`,
                          confirmLabel: "Discard batch",
                          variant: "danger",
                          onConfirm: () => {
                            setBatches((current) => current.filter((item) => item.id !== batch.id));
                            setMessage(`Discarded extraction batch ${batch.source_document_name}.`);
                          },
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
                      .filter((candidate) => candidate.status !== "discarded")
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
                              <strong style={{ color: (candidate.confidence_score ?? 0) > 0.8 ? "#6EE7B7" : (candidate.confidence_score ?? 0) > 0.6 ? "#FBB424" : "#F87171" }}>
                                {Math.round((candidate.confidence_score ?? 0) * 100)}%
                              </strong>
                              <div className="sla-confidence-bar">
                                <div className="sla-confidence-fill" style={{ width: `${Math.round((candidate.confidence_score ?? 0) * 100)}%` }} />
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
                              onClick={() => {
                                confirm({
                                  title: "Discard candidate rule?",
                                  message: `"${candidate.name}" will be removed from this extraction batch.`,
                                  confirmLabel: "Discard",
                                  variant: "danger",
                                  onConfirm: () => {
                                    setBatches((current) =>
                                      current.map((item) =>
                                        item.id === batch.id
                                          ? {
                                              ...item,
                                              candidate_rules: item.candidate_rules.map((row) =>
                                                row.id === candidate.id ? { ...row, status: "discarded" } : row,
                                              ),
                                            }
                                          : item,
                                      ),
                                    );
                                    setMessage(`Discarded candidate ${candidate.name}.`);
                                  },
                                });
                              }}
                            >
                              Discard candidate
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="bs-toolbar">
            <input
              className="bs-input bs-input-grow"
              placeholder="Search active rules"
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
                    <span className="bs-pill">{rule.auto_action_allowed ? "auto action allowed" : "manual approval"}</span>
                  </div>
                  <div className="bs-card-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditRule(rule)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost-danger btn-sm"
                      onClick={() => {
                        confirm({
                          title: "Archive this SLA rule?",
                          message: `"${rule.name}" will be removed from the active rulebook. Detectors using it will no longer trigger on this SLA.`,
                          confirmLabel: "Archive rule",
                          variant: "warning",
                          onConfirm: () => {
                            setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, status: "archived" } : item)));
                            setMessage(`Archived ${rule.name}.`);
                          },
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
            <StateBlock title="No active rules match search" description="Clear the search box to see the full rulebook." />
          )}
        </>
      )}

      {editRule ? (
        <RuleEditModal
          rule={editRule}
          onClose={() => setEditRule(null)}
          onSave={(nextRule) => {
            setRules((current) => current.map((item) => (item.id === nextRule.id ? nextRule : item)));
            setEditRule(null);
            setMessage(`Saved changes to ${nextRule.name}.`);
          }}
        />
      ) : null}

      {editCandidate ? (
        <CandidateEditModal
          candidate={editCandidate}
          onClose={() => setEditCandidate(null)}
          onSave={(nextCandidate) => {
            setBatches((current) =>
              current.map((batch) => ({
                ...batch,
                candidate_rules: batch.candidate_rules.map((item) => (item.id === nextCandidate.id ? nextCandidate : item)),
              })),
            );
            setEditCandidate(null);
            setMessage(`Saved edits to ${nextCandidate.name}.`);
          }}
        />
      ) : null}

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

      {extractionRun ? <ExtractionProgressModal fileName={extractionRun.fileName} progress={extractionRun.progress} /> : null}
    </div>
  );
}
