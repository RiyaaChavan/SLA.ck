import { useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useSlaBatchApprove,
  useSlaBatchDiscard,
  useSlaExtractionUpload,
  useSlaExtractions,
  useSlaRules,
} from "../hooks/useBusinessSentry";

type SlaRulebookPageProps = {
  organizationId?: number;
};

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

export function SlaRulebookPage({ organizationId }: SlaRulebookPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(
    () => (searchParams.get("tab") === "active" ? "active" : "extraction"),
    [searchParams],
  );
  const setTab = (next: "extraction" | "active") => {
    setSearchParams(next === "active" ? { tab: "active" } : { tab: "extraction" }, { replace: true });
  };
  const rulesQ = useSlaRules(organizationId);
  const extQ = useSlaExtractions(organizationId);
  const approve = useSlaBatchApprove(organizationId);
  const discard = useSlaBatchDiscard(organizationId);
  const upload = useSlaExtractionUpload(organizationId);
  const [filter, setFilter] = useState("");

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  const activeRules = (rulesQ.data ?? []).filter(
    (r) =>
      !filter ||
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      r.applies_to.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="page-content">
      <PageHeader
        title="SLAs"
        subtitle="Import contracts (PDF, docs, text, image) to extract rules, then browse and govern active SLAs."
      />

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
          <SlaDropzone onUpload={(file) => upload.mutate(file.name)} isUploading={upload.isPending} />
          {extQ.isPending ? (
            <StateBlock title="Loading extractions" loading />
          ) : extQ.isError ? (
            <StateBlock title="Failed to load extractions" />
          ) : (
            <div className="bs-extraction-list">
              {(extQ.data ?? []).map((b) => (
                <div key={b.id} className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{b.source_document_name}</div>
                      <div className="card-subtitle">
                        {b.status} · uploaded {formatDateTime(b.uploaded_at)}
                      </div>
                    </div>
                    <div className="bs-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={approve.isPending || b.status !== "pending_review"}
                        onClick={() => approve.mutate(b.id)}
                      >
                        Approve batch
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={discard.isPending}
                        onClick={() => discard.mutate(b.id)}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <h4 className="td-sub" style={{ marginBottom: 12 }}>Candidate rules</h4>
                    <div className="bs-candidate-grid">
                      {b.candidate_rules.map((c) => (
                        <div key={c.temp_id} className="bs-candidate-card">
                          <div className="bs-candidate-header">
                            <strong>{c.name}</strong>
                          </div>
                          <div className="bs-candidate-body">
                            <div className="bs-candidate-field">
                              <span>Response</span>
                              <strong>{c.response_deadline_hours}h</strong>
                            </div>
                            <div className="bs-candidate-field">
                              <span>Resolution</span>
                              <strong>{c.resolution_deadline_hours}h</strong>
                            </div>
                            <div className="bs-candidate-field">
                              <span>Penalty</span>
                              <strong>{formatMoneyInr(c.penalty_amount)}</strong>
                            </div>
                          </div>
                          <div className="bs-card-actions" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                            <button type="button" className="btn btn-ghost btn-sm">
                              Edit
                            </button>
                            <button type="button" className="btn btn-ghost-danger btn-sm">
                              Discard
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bs-toolbar">
            <input
              className="bs-input bs-input-grow"
              placeholder="Search rules…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {rulesQ.isPending ? (
            <StateBlock title="Loading rules" loading />
          ) : rulesQ.isError ? (
            <StateBlock title="Failed to load rules" />
          ) : (
            <div className="bs-rule-grid">
              {activeRules.map((r) => (
                <div key={r.id} className="card bs-rule-card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{r.name}</div>
                      <div className="card-subtitle">{r.source_document_name}</div>
                    </div>
                    <span className="badge badge-default">{r.status}</span>
                  </div>
                  <div className="card-body">
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
                    </div>
                    <div className="bs-card-actions" style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <button type="button" className="btn btn-ghost btn-sm">
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost-danger btn-sm">
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
    </div>
  );
}
