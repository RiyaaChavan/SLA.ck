import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { SlaExtractionBatch, SlaExtractionCandidate, SlaRulebookEntry } from "../domain/business-sentry";
import type {
  SlaExtractionCandidateEdit,
  SlaRulebookEntryUpdatePayload,
} from "../adapters/business-sentry/contract";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useArchiveSlaRule,
  useDataSources,
  useDiscardSlaCandidate,
  useRescanAlerts,
  useSlaBatchApprove,
  useSlaBatchDiscard,
  useSlaExtractionUpload,
  useSlaExtractions,
  useSlaRules,
  useUpdateSlaRule,
} from "../hooks/useBusinessSentry";

type SlaRulebookPageProps = {
  organizationId?: number;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

function SlaDropzone({ onUpload, isUploading }: { onUpload: (file: File) => void, isUploading: boolean }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div
      className={`bs-dropzone ${isDragOver ? "bs-dropzone-active" : ""} ${isUploading ? "bs-dropzone-uploading" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
    >
      <input type="file" ref={fileInputRef} onChange={handleChange} className="bs-file-input" accept=".pdf,.doc,.docx,.txt,image/*" style={{ display: "none" }} />
      <div className="bs-dropzone-content">
        <div className="bs-dropzone-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="bs-dropzone-text">
          <strong>Click to upload</strong> or drag and drop
        </div>
        <div className="bs-dropzone-subtext">PDF, DOCX, images, or plain text</div>
      </div>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function RuleEditModal({
  rule,
  onClose,
  onSave,
  saving,
}: {
  rule: SlaRulebookEntry;
  onClose: () => void;
  onSave: (body: SlaRulebookEntryUpdatePayload) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(rule.name);
  const [appliesLabel, setAppliesLabel] = useState(rule.applies_to);
  const [conditions, setConditions] = useState(rule.conditions);
  const [responseH, setResponseH] = useState(String(rule.response_deadline_hours));
  const [resolutionH, setResolutionH] = useState(String(rule.resolution_deadline_hours));
  const [penalty, setPenalty] = useState(String(rule.penalty_amount));
  const [escalationOwner, setEscalationOwner] = useState(rule.escalation_owner);
  const [bhLogic, setBhLogic] = useState(rule.business_hours_logic);
  const [autoOk, setAutoOk] = useState(rule.auto_action_allowed);

  return (
    <div
      className="bs-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="card bs-modal-card"
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-labelledby="rule-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div className="card-title" id="rule-edit-title">
            Edit rule
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Name
            <input className="bs-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Applies to (label)
            <input className="bs-input" value={appliesLabel} onChange={(e) => setAppliesLabel(e.target.value)} />
          </label>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Conditions
            <textarea className="bs-input" rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="td-sub" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              Response (h)
              <input className="bs-input" type="number" value={responseH} onChange={(e) => setResponseH(e.target.value)} />
            </label>
            <label className="td-sub" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              Resolution (h)
              <input className="bs-input" type="number" value={resolutionH} onChange={(e) => setResolutionH(e.target.value)} />
            </label>
          </div>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Penalty (INR)
            <input className="bs-input" type="number" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </label>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Escalation owner
            <input className="bs-input" value={escalationOwner} onChange={(e) => setEscalationOwner(e.target.value)} />
          </label>
          <label className="td-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Business hours logic
            <input className="bs-input" value={bhLogic} onChange={(e) => setBhLogic(e.target.value)} />
          </label>
          <label className="bs-toggle" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={autoOk} onChange={(e) => setAutoOk(e.target.checked)} />
            <span>Auto action allowed</span>
          </label>
        </div>
        <div className="bs-card-actions bs-modal-footer">
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => {
              const rh = Number(responseH);
              const resH = Number(resolutionH);
              const pen = Number(penalty);
              if (!name.trim() || Number.isNaN(rh) || Number.isNaN(resH) || Number.isNaN(pen)) return;
              onSave({
                name: name.trim(),
                applies_to: { ...(rule.applies_to_payload ?? {}), label: appliesLabel.trim() },
                conditions: conditions.trim(),
                response_deadline_hours: rh,
                resolution_deadline_hours: resH,
                penalty_amount: pen,
                escalation_owner: escalationOwner.trim(),
                business_hours_logic: bhLogic.trim(),
                auto_action_allowed: autoOk,
                reviewed_by: "Rulebook UI",
              });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtractionRunDetails({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta).map(([k, v]) => ({
    key: k,
    value: typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
  }));
  if (entries.length === 0) return null;
  return (
    <details className="bs-run-meta-details">
      <summary className="bs-run-meta-summary">Extraction run details</summary>
      <dl className="bs-run-meta-dl">
        {entries.map(({ key, value }) => (
          <div key={key} className="bs-run-meta-row">
            <dt>{key}</dt>
            <dd title={value}>{value.length > 120 ? `${value.slice(0, 120)}…` : value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function BusinessDocSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="td-sub" style={{ marginTop: 10 }}>
      <strong>{title}:</strong>
      <ul style={{ margin: "6px 0 0 18px" }}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CandidateEditModal({
  candidate,
  onClose,
  onSave,
  saving,
}: {
  candidate: SlaExtractionCandidate;
  onClose: () => void;
  onSave: (edit: SlaExtractionCandidateEdit) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(candidate.name);
  const [appliesLabel, setAppliesLabel] = useState(() => {
    const p = candidate.applies_to_payload;
    if (p && typeof (p as Record<string, unknown>).label === "string")
      return String((p as Record<string, unknown>).label);
    return candidate.applies_to ?? "";
  });
  const [conditions, setConditions] = useState(candidate.conditions ?? "");
  const [responseH, setResponseH] = useState(String(candidate.response_deadline_hours));
  const [resolutionH, setResolutionH] = useState(String(candidate.resolution_deadline_hours));
  const [penalty, setPenalty] = useState(String(candidate.penalty_amount));
  const [escalationOwner, setEscalationOwner] = useState(candidate.escalation_owner ?? "Operations");
  const [bhLogic, setBhLogic] = useState(candidate.business_hours_logic ?? "business_hours");
  const [autoOk, setAutoOk] = useState(candidate.auto_action_allowed ?? false);

  useEffect(() => {
    const p = candidate.applies_to_payload;
    const appliesLabelInit =
      p && typeof (p as Record<string, unknown>).label === "string"
        ? String((p as Record<string, unknown>).label)
        : candidate.applies_to ?? "";
    setName(candidate.name);
    setAppliesLabel(appliesLabelInit);
    setConditions(candidate.conditions ?? "");
    setResponseH(String(candidate.response_deadline_hours));
    setResolutionH(String(candidate.resolution_deadline_hours));
    setPenalty(String(candidate.penalty_amount));
    setEscalationOwner(candidate.escalation_owner ?? "Operations");
    setBhLogic(candidate.business_hours_logic ?? "business_hours");
    setAutoOk(candidate.auto_action_allowed ?? false);
  }, [candidate]);

  return (
    <div
      className="bs-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="card bs-modal-card"
        role="dialog"
        aria-labelledby="cand-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div className="card-title" id="cand-edit-title">
            Edit candidate rule
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="td-sub bs-form-label">
            Name
            <input className="bs-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="td-sub bs-form-label">
            Applies to (label)
            <input className="bs-input" value={appliesLabel} onChange={(e) => setAppliesLabel(e.target.value)} />
          </label>
          <label className="td-sub bs-form-label">
            Conditions
            <textarea className="bs-input" rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="td-sub bs-form-label" style={{ flex: 1 }}>
              Response (h)
              <input className="bs-input" type="number" value={responseH} onChange={(e) => setResponseH(e.target.value)} />
            </label>
            <label className="td-sub bs-form-label" style={{ flex: 1 }}>
              Resolution (h)
              <input className="bs-input" type="number" value={resolutionH} onChange={(e) => setResolutionH(e.target.value)} />
            </label>
          </div>
          <label className="td-sub bs-form-label">
            Penalty (INR)
            <input className="bs-input" type="number" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </label>
          <label className="td-sub bs-form-label">
            Escalation owner
            <input className="bs-input" value={escalationOwner} onChange={(e) => setEscalationOwner(e.target.value)} />
          </label>
          <label className="td-sub bs-form-label">
            Business hours logic
            <input className="bs-input" value={bhLogic} onChange={(e) => setBhLogic(e.target.value)} />
          </label>
          <label className="bs-toggle" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={autoOk} onChange={(e) => setAutoOk(e.target.checked)} />
            <span>Auto action allowed</span>
          </label>
        </div>
        <div className="bs-card-actions bs-modal-footer">
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => {
              const rh = Number(responseH);
              const resH = Number(resolutionH);
              const pen = Number(penalty);
              if (!name.trim() || Number.isNaN(rh) || Number.isNaN(resH) || Number.isNaN(pen)) return;
              onSave({
                id: candidate.id,
                name: name.trim(),
                applies_to: { ...(candidate.applies_to_payload ?? {}), label: appliesLabel.trim() },
                conditions: conditions.trim(),
                response_deadline_hours: rh,
                resolution_deadline_hours: resH,
                penalty_amount: pen,
                escalation_owner: escalationOwner.trim(),
                business_hours_logic: bhLogic.trim(),
                auto_action_allowed: autoOk,
              });
            }}
          >
            Save edits
          </button>
        </div>
      </div>
    </div>
  );
}

export function SlaRulebookPage({ organizationId }: SlaRulebookPageProps) {
  const { notify } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t === "active") return "active";
    if (t === "sources") return "sources";
    return "extraction";
  }, [searchParams]);
  const setTab = (next: "extraction" | "active" | "sources") => {
    setSearchParams({ tab: next }, { replace: true });
  };
  const rulesQ = useSlaRules(organizationId);
  const extQ = useSlaExtractions(organizationId);
  const dataSourcesQ = useDataSources(organizationId);
  const approve = useSlaBatchApprove(organizationId);
  const discard = useSlaBatchDiscard(organizationId);
  const upload = useSlaExtractionUpload(organizationId);
  const updateRule = useUpdateSlaRule(organizationId);
  const archiveRule = useArchiveSlaRule(organizationId);
  const rescanAlerts = useRescanAlerts(organizationId);
  const [filter, setFilter] = useState("");
  const [editRule, setEditRule] = useState<SlaRulebookEntry | null>(null);
  const [editCandidate, setEditCandidate] = useState<SlaExtractionCandidate | null>(null);
  const [pendingCandidateEdits, setPendingCandidateEdits] = useState<Record<number, SlaExtractionCandidateEdit>>({});
  const discardCandidate = useDiscardSlaCandidate(organizationId);

  const candidateRulesForApprove = useCallback(
    (batch: SlaExtractionBatch): SlaExtractionCandidateEdit[] =>
      batch.candidate_rules
        .filter((c) => c.status !== "discarded")
        .map((c) => pendingCandidateEdits[c.id] ?? { id: c.id }),
    [pendingCandidateEdits],
  );

  const candidateForEditModal = useMemo((): SlaExtractionCandidate | null => {
    if (!editCandidate) return null;
    const p = pendingCandidateEdits[editCandidate.id];
    if (!p) return editCandidate;
    return {
      ...editCandidate,
      name: p.name ?? editCandidate.name,
      conditions: p.conditions ?? editCandidate.conditions,
      response_deadline_hours: p.response_deadline_hours ?? editCandidate.response_deadline_hours,
      resolution_deadline_hours: p.resolution_deadline_hours ?? editCandidate.resolution_deadline_hours,
      penalty_amount: p.penalty_amount ?? editCandidate.penalty_amount,
      escalation_owner: p.escalation_owner ?? editCandidate.escalation_owner,
      business_hours_logic: p.business_hours_logic ?? editCandidate.business_hours_logic,
      auto_action_allowed: p.auto_action_allowed ?? editCandidate.auto_action_allowed,
      applies_to_payload:
        (p.applies_to as Record<string, unknown> | undefined) ?? editCandidate.applies_to_payload,
    };
  }, [editCandidate, pendingCandidateEdits]);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  const activeRules = (rulesQ.data ?? []).filter(
    (r) =>
      r.status === "active" &&
      (!filter ||
        r.name.toLowerCase().includes(filter.toLowerCase()) ||
        r.applies_to.toLowerCase().includes(filter.toLowerCase()) ||
        r.conditions.toLowerCase().includes(filter.toLowerCase())),
  );

  const visibleExtractions = useMemo(() => {
    const list = extQ.data ?? [];
    return list.filter((b) => {
      if (b.status === "discarded") return false;
      const hasActive = b.candidate_rules.some((c) => (c.status ?? "pending") !== "discarded");
      if (b.status === "pending_review" && !hasActive) return false;
      return true;
    });
  }, [extQ.data]);

  return (
    <div className="page-content">
      <PageHeader
        title="SLAs"
        subtitle="Import contracts (PDF, docs, text, image) to extract rules, then browse and govern active SLAs."
      />

      <div className="bs-sla-toolbar">
        <p className="bs-sla-toolbar-hint td-sub">
          Approve sends edited candidates to the active rulebook. Rescan alerts after big rule changes.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={rescanAlerts.isPending}
          onClick={() =>
            rescanAlerts.mutate(undefined, {
              onSuccess: () => {
                notify({
                  tone: "info",
                  title: "Alerts rescanned",
                  message: "Alert and recommendation data now reflects the latest SLA rules.",
                });
              },
              onError: () => {
                notify({
                  tone: "error",
                  title: "Rescan failed",
                  message: "Could not refresh alerts from the SLA rulebook.",
                });
              },
            })
          }
          title="Re-run detector scan so alerts and actions reflect the latest rules"
        >
          {rescanAlerts.isPending ? "Rescanning…" : "Rescan alerts"}
        </button>
      </div>

      <div className="bs-tabs">
        <button type="button" className={tab === "extraction" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("extraction")}>
          Extraction review
        </button>
        <button type="button" className={tab === "active" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("active")}>
          Active rules
        </button>
        <button type="button" className={tab === "sources" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("sources")}>
          Data sources
        </button>
      </div>

      {tab === "sources" ? (
        <>
          {dataSourcesQ.isPending ? (
            <StateBlock title="Loading data sources" loading />
          ) : dataSourcesQ.isError ? (
            <StateBlock title="Failed to load data sources" />
          ) : (
            <div className="bs-data-sources-list">
              {(dataSourcesQ.data ?? []).length === 0 ? (
                <StateBlock
                  title="No data sources"
                  description="Register connectors or uploads via the API; seeded orgs usually list SAP exports and documents here."
                />
              ) : null}
              {(dataSourcesQ.data ?? []).map((ds) => (
                <div key={ds.id} className="card bs-data-source-card">
                  <div className="card-header">
                    <div className="card-title">{ds.name}</div>
                    <div className="card-subtitle td-sub">
                      {ds.source_type} · {ds.status} · {ds.freshness_status} · {ds.health}
                    </div>
                  </div>
                  <div className="card-body">
                    <p className="td-sub" style={{ marginBottom: 8 }}>
                      Last synced {formatDateTime(ds.last_synced_at)} · {ds.record_count.toLocaleString()} records
                    </p>
                    {ds.schema_preview.length > 0 ? (
                      <div className="td-sub">
                        <strong>Schema preview:</strong> {ds.schema_preview.join(", ")}
                      </div>
                    ) : null}
                    {ds.upload_history.length > 0 ? (
                      <ul className="td-sub" style={{ marginTop: 8, paddingLeft: 18 }}>
                        {ds.upload_history.slice(0, 5).map((h, i) => (
                          <li key={i}>
                            {formatDateTime(h.at)} — {h.filename} ({h.rows} rows)
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : tab === "extraction" ? (
        <>
          <SlaDropzone
            onUpload={(file) =>
              upload.mutate(
                { file },
                {
                  onSuccess: () => {
                    notify({
                      tone: "success",
                      title: "SLA extracted",
                      message: `${file.name} was uploaded and added to the extraction review queue.`,
                    });
                  },
                  onError: () => {
                    notify({
                      tone: "error",
                      title: "Extraction failed",
                      message: `Could not process ${file.name}.`,
                    });
                  },
                },
              )
            }
            isUploading={upload.isPending}
          />
          {extQ.isPending ? (
            <StateBlock title="Loading extractions" loading />
          ) : extQ.isError ? (
            <StateBlock title="Failed to load extractions" />
          ) : visibleExtractions.length === 0 ? (
            <StateBlock
              title="No extraction reviews"
              description="Upload a document to extract rules. Discarded batches and reviews with no remaining candidates are hidden."
            />
          ) : (
            <div className="bs-extraction-list">
              {visibleExtractions.map((b) => {
                const activeCands = b.candidate_rules.filter((c) => (c.status ?? "pending") !== "discarded");
                const discardedCount = b.candidate_rules.length - activeCands.length;
                const pendingEditsCount = activeCands.filter((c) => pendingCandidateEdits[c.id]).length;
                return (
                  <div key={b.id} className="card bs-sla-batch-card">
                    <div className="card-header bs-sla-batch-header">
                      <div className="bs-sla-batch-title-block">
                        <div className="card-title">{b.source_document_name}</div>
                        <div className="card-subtitle">
                          {b.status}
                          {b.document_type ? ` · ${b.document_type}` : ""} · uploaded {formatDateTime(b.uploaded_at)}
                          {b.extraction_source ? ` · ${b.extraction_source}` : ""}
                        </div>
                        {b.contract_pdf_path ? (
                          <div className="td-sub" style={{ marginTop: 8 }}>
                            Contract PDF: {b.contract_pdf_path}
                          </div>
                        ) : null}
                        {b.run_metadata && Object.keys(b.run_metadata).length > 0 ? (
                          <ExtractionRunDetails meta={b.run_metadata} />
                        ) : null}
                      </div>
                      <div className="bs-sla-batch-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            window.open(`${API_BASE}/sla/extractions/batch/${b.id}/contract-pdf`, "_blank", "noopener,noreferrer");
                            notify({
                              tone: "info",
                              title: "Contract PDF opened",
                              message: `Opened the generated contract PDF for ${b.source_document_name}.`,
                            });
                          }}
                        >
                          View contract PDF
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={
                            approve.isPending ||
                            b.status !== "pending_review" ||
                            activeCands.length === 0
                          }
                          onClick={() =>
                            approve.mutate(
                              { batchId: b.id, candidateRules: candidateRulesForApprove(b) },
                              {
                                onSuccess: () => {
                                  notify({
                                    tone: "success",
                                    title: "Batch approved",
                                    message: `${b.source_document_name} moved into the active SLA rulebook.`,
                                  });
                                  setPendingCandidateEdits((prev) => {
                                    const next = { ...prev };
                                    for (const c of b.candidate_rules) {
                                      delete next[c.id];
                                    }
                                    return next;
                                  });
                                },
                              },
                            )
                          }
                        >
                          Approve batch
                          {pendingEditsCount > 0 ? ` (${pendingEditsCount} edited)` : ""}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost-danger btn-sm bs-sla-trash-btn"
                          title="Delete extraction review (discard entire batch)"
                          aria-label="Delete extraction review, discard entire batch"
                          disabled={discard.isPending}
                          onClick={() => {
                            if (!window.confirm(`Delete this extraction review and discard the entire batch “${b.source_document_name}”?`)) return;
                            discard.mutate(b.id, {
                              onSuccess: () => {
                                notify({
                                  tone: "warning",
                                  title: "Review deleted",
                                  message: `${b.source_document_name} was discarded from extraction review.`,
                                });
                              },
                              onError: () => {
                                notify({
                                  tone: "error",
                                  title: "Delete failed",
                                  message: `Could not discard ${b.source_document_name}.`,
                                });
                              },
                            });
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="bs-sla-candidates-head">
                        <h4 className="bs-sla-section-title">Candidate rules</h4>
                        <span className="td-sub bs-sla-count">
                          {activeCands.length} active
                          {discardedCount > 0 ? ` · ${discardedCount} discarded` : ""}
                        </span>
                      </div>
                      {activeCands.length === 0 ? (
                        <StateBlock title="No candidates left" description="Discard batch or upload a new document." />
                      ) : (
                        <div className="bs-candidate-grid">
                          {activeCands.map((c) => {
                            const edited = Boolean(pendingCandidateEdits[c.id]);
                            return (
                              <div
                                key={c.id}
                                className={`bs-candidate-card ${edited ? "bs-candidate-card-edited" : ""}`}
                              >
                                {edited ? (
                                  <span className="bs-candidate-edited-pill">Edited</span>
                                ) : null}
                                <div className="bs-candidate-header">
                                  <strong>{pendingCandidateEdits[c.id]?.name ?? c.name}</strong>
                                </div>
                                <div className="bs-candidate-body">
                                  {(pendingCandidateEdits[c.id]?.conditions ?? c.conditions) ? (
                                    <p className="bs-candidate-conditions td-sub">
                                      {pendingCandidateEdits[c.id]?.conditions ?? c.conditions}
                                    </p>
                                  ) : null}
                                  {c.business_document?.executive_summary ? (
                                    <p className="td-sub" style={{ marginBottom: 10 }}>
                                      {c.business_document.executive_summary}
                                    </p>
                                  ) : null}
                                  <div className="bs-candidate-metrics">
                                    <div className="bs-candidate-field">
                                      <span>Response</span>
                                      <strong>{pendingCandidateEdits[c.id]?.response_deadline_hours ?? c.response_deadline_hours}h</strong>
                                    </div>
                                    <div className="bs-candidate-field">
                                      <span>Resolution</span>
                                      <strong>{pendingCandidateEdits[c.id]?.resolution_deadline_hours ?? c.resolution_deadline_hours}h</strong>
                                    </div>
                                    <div className="bs-candidate-field">
                                      <span>Penalty</span>
                                      <strong>
                                        {formatMoneyInr(
                                          pendingCandidateEdits[c.id]?.penalty_amount ?? c.penalty_amount,
                                        )}
                                      </strong>
                                    </div>
                                    {c.confidence_score != null ? (
                                      <div className="bs-candidate-field">
                                        <span>Confidence</span>
                                        <strong>{Math.round(c.confidence_score * 100)}%</strong>
                                      </div>
                                    ) : null}
                                  </div>
                                  {c.parsing_notes && c.parsing_notes.length > 0 ? (
                                    <ul className="bs-candidate-notes td-sub">
                                      {c.parsing_notes.map((n, i) => (
                                        <li key={i}>{n}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  <BusinessDocSection
                                    title="Service scope"
                                    items={c.business_document?.service_scope ?? []}
                                  />
                                  <BusinessDocSection
                                    title="Commitments"
                                    items={c.business_document?.service_level_commitments ?? []}
                                  />
                                  <BusinessDocSection
                                    title="Operational obligations"
                                    items={c.business_document?.operational_obligations ?? []}
                                  />
                                  <BusinessDocSection
                                    title="Commercial terms"
                                    items={c.business_document?.commercial_terms ?? []}
                                  />
                                  <BusinessDocSection
                                    title="Approval and governance"
                                    items={c.business_document?.approval_and_governance ?? []}
                                  />
                                  <BusinessDocSection
                                    title="Risk watchouts"
                                    items={c.business_document?.risk_watchouts ?? []}
                                  />
                                  {c.extraction_source ? (
                                    <div className="bs-candidate-source td-sub">{c.extraction_source}</div>
                                  ) : null}
                                </div>
                                <div className="bs-card-actions bs-candidate-footer">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={b.status !== "pending_review"}
                                    onClick={() => setEditCandidate(c)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost-danger btn-sm bs-sla-trash-btn"
                                    title="Remove this candidate from the extraction review"
                                    aria-label="Remove candidate from extraction review"
                                    disabled={discardCandidate.isPending || b.status !== "pending_review"}
                                    onClick={() => {
                                      if (!window.confirm(`Remove this candidate from the batch?`)) return;
                                      setPendingCandidateEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[c.id];
                                        return next;
                                      });
                                      discardCandidate.mutate(String(c.id), {
                                        onSuccess: () => {
                                          notify({
                                            tone: "warning",
                                            title: "Candidate removed",
                                            message: `${c.name} was removed from the extraction batch.`,
                                          });
                                        },
                                        onError: () => {
                                          notify({
                                            tone: "error",
                                            title: "Remove failed",
                                            message: `Could not remove ${c.name}.`,
                                          });
                                        },
                                      });
                                    }}
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bs-toolbar bs-toolbar-rules">
            <input
              className="bs-input bs-input-grow"
              placeholder="Search rules…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="td-sub bs-rules-count">{activeRules.length} active</span>
          </div>
          {rulesQ.isPending ? (
            <StateBlock title="Loading rules" loading />
          ) : rulesQ.isError ? (
            <StateBlock title="Failed to load rules" />
          ) : activeRules.length === 0 ? (
            <StateBlock
              title="No active rules"
              description="Approve candidates from the Extraction review tab or create rules via the API."
            />
          ) : (
            <div className="bs-rule-grid">
              {activeRules.map((r) => (
                <div key={r.id} className="card bs-rule-card">
                  <div className="card-header bs-rule-card-header">
                    <div>
                      <div className="card-title">{r.name}</div>
                      <div className="card-subtitle">{r.source_document_name}</div>
                    </div>
                    <div className="bs-rule-badges">
                      {r.rule_version != null ? (
                        <span className="badge badge-blue">v{r.rule_version}</span>
                      ) : null}
                      <span className="badge badge-default">{r.status}</span>
                    </div>
                  </div>
                  <div className="card-body">
                    <p className="bs-rule-conditions td-sub">{r.conditions}</p>
                    <div className="bs-rule-meta">
                      <div className="bs-rule-field">
                        <span>Applies to</span>
                        <strong>{r.applies_to}</strong>
                      </div>
                      <div className="bs-rule-field">
                        <span>Response</span>
                        <strong>{r.response_deadline_hours}h</strong>
                      </div>
                      <div className="bs-rule-field">
                        <span>Resolution</span>
                        <strong>{r.resolution_deadline_hours}h</strong>
                      </div>
                      <div className="bs-rule-field">
                        <span>Penalty</span>
                        <strong>{formatMoneyInr(r.penalty_amount)}</strong>
                      </div>
                      <div className="bs-rule-field">
                        <span>Escalation</span>
                        <strong>{r.escalation_owner}</strong>
                      </div>
                    </div>
                    <div className="bs-card-actions bs-rule-footer">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={updateRule.isPending}
                        onClick={() => setEditRule(r)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost-danger btn-sm"
                        disabled={archiveRule.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Archive “${r.name}”? It will no longer match new live items until restored.`,
                            )
                          )
                            return;
                          archiveRule.mutate(
                            { ruleId: r.id, reviewed_by: "Rulebook UI" },
                            {
                              onSuccess: () => {
                                notify({
                                  tone: "warning",
                                  title: "Rule archived",
                                  message: `${r.name} is no longer active for new SLA matching.`,
                                });
                              },
                              onError: () => {
                                notify({
                                  tone: "error",
                                  title: "Archive failed",
                                  message: `Could not archive ${r.name}.`,
                                });
                              },
                            },
                          );
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editCandidate && candidateForEditModal ? (
        <CandidateEditModal
          key={editCandidate.id}
          candidate={candidateForEditModal}
          saving={false}
          onClose={() => setEditCandidate(null)}
          onSave={(edit) => {
            setPendingCandidateEdits((prev) => ({ ...prev, [edit.id]: edit }));
            setEditCandidate(null);
          }}
        />
      ) : null}

      {editRule ? (
        <RuleEditModal
          key={editRule.id}
          rule={editRule}
          saving={updateRule.isPending}
          onClose={() => setEditRule(null)}
          onSave={(body) => {
            updateRule.mutate(
              { ruleId: editRule.id, body },
              {
                onSuccess: () => {
                  notify({
                    tone: "success",
                    title: "Rule updated",
                    message: `${editRule.name} was saved to the SLA rulebook.`,
                  });
                  setEditRule(null);
                },
                onError: () => {
                  notify({
                    tone: "error",
                    title: "Save failed",
                    message: `Could not update ${editRule.name}.`,
                  });
                },
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
