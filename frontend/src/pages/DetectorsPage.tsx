import { useMemo, useState } from "react";
import type { DetectorDefinition, DetectorDraft, DetectorTestResult } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatModuleLabel } from "../lib/formatters";
import {
  useDetectors,
  usePromptDraftDetector,
  useTestDetector,
  useToggleDetector,
} from "../hooks/useBusinessSentry";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

type DetectorsPageProps = {
  organizationId?: number;
};

/* ── tiny inline SVG icons ── */
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

function severityDot(severity: string) {
  const color = severity === "critical" ? "#ef4444" : severity === "high" ? "#f59e0b" : "#3b82f6";
  return <span className="det-severity-dot" style={{ background: color }} />;
}

export function DetectorsPage({ organizationId }: DetectorsPageProps) {
  const { notify } = useNotifications();
  const q = useDetectors(organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLocal, setDraftLocal] = useState<DetectorDefinition | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [draftResult, setDraftResult] = useState<DetectorDraft | null>(null);
  const [testResult, setTestResult] = useState<DetectorTestResult | null>(null);

  const promptMut = usePromptDraftDetector();
  const testMut = useTestDetector(organizationId);
  const toggleMut = useToggleDetector(organizationId);

  const detectors = useMemo(() => q.data ?? [], [q.data]);

  // Auto-select first detector if none selected
  useMemo(() => {
    if (!selectedId && detectors.length > 0) {
      setSelectedId(detectors[0].id);
      setDraftLocal({ ...detectors[0] });
    }
  }, [detectors, selectedId]);

  const selected = useMemo(
    () => detectors.find((d) => d.id === selectedId) ?? null,
    [detectors, selectedId],
  );
  const editor = draftLocal ?? selected;

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before editing anomaly queries." />
      </div>
    );
  }

  const openDetail = (d: DetectorDefinition) => {
    setSelectedId(d.id);
    setDraftLocal({ ...d });
    setTestResult(null);
  };

  const saveLocalDraft = () => {
    if (!draftLocal) return;
    notify({
      tone: "info",
      title: "Local draft saved",
      message: "Detector edits were kept in the current browser session.",
    });
  };

  return (
    <div className="page-content bs-detectors-layout">
      <PageHeader
        title="Anomaly queries"
        subtitle="Editable detector logic for vendor anomalies, SLA clusters, and resource optimization."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setPromptOpen(true);
              setPromptText("");
              setDraftResult(null);
            }}
          >
            <IconPlus /> Prompt to draft
          </button>
        }
      />

      {q.isPending ? (
        <StateBlock title="Loading detectors" loading />
      ) : q.isError || !detectors.length ? (
        <StateBlock title="No detectors" />
      ) : (
        <div className="det-split">
          {/* ── sidebar list ── */}
          <div className="det-sidebar">
            <div className="det-sidebar-header">
              <span className="det-sidebar-title">Detector library</span>
              <span className="det-sidebar-count">{detectors.length}</span>
            </div>
            <div className="det-sidebar-list">
              {detectors.map((detector) => (
                <button
                  key={detector.id}
                  type="button"
                  className={`det-list-item ${selectedId === detector.id ? "det-list-item-active" : ""}`}
                  onClick={() => openDetail(detector)}
                >
                  <div className="det-list-item-top">
                    {severityDot(detector.severity)}
                    <span className="det-list-item-name">{detector.name}</span>
                  </div>
                  <div className="det-list-item-bottom">
                    <span className="det-list-item-module">{formatModuleLabel(detector.module)}</span>
                    <span className="det-list-item-issues">{detector.issue_count} issues</span>
                    <span className={`det-list-item-status ${detector.enabled ? "det-on" : "det-off"}`}>
                      {detector.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── detail panel ── */}
          <div className="det-detail">
            {!editor ? (
              <div className="det-detail-empty">
                <div className="det-detail-empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                </div>
                <div className="det-detail-empty-title">Select a detector</div>
                <div className="det-detail-empty-copy">Choose a detector from the library to view and edit its logic.</div>
              </div>
            ) : (
              <>
                <div className="det-detail-header">
                  <div>
                    <div className="det-detail-title">{editor.name}</div>
                    <div className="det-detail-desc">{editor.description}</div>
                  </div>
                  <div className="det-detail-header-right">
                    <span className={`badge badge-${editor.severity === "critical" ? "critical" : editor.severity === "high" ? "high" : "default"}`}>
                      {editor.severity}
                    </span>
                    <label className="bs-toggle">
                      <input
                        type="checkbox"
                        checked={editor.enabled}
                        disabled={toggleMut.isPending}
                        onChange={async (e) => {
                          const enabled = e.target.checked;
                          setDraftLocal({ ...editor, enabled });
                          try {
                            await toggleMut.mutateAsync({ id: editor.id, enabled });
                            notify({
                              tone: "success",
                              title: `Detector ${enabled ? "enabled" : "disabled"}`,
                              message: `${editor.name} is now ${enabled ? "active" : "inactive"}.`,
                            });
                          } catch {
                            notify({
                              tone: "error",
                              title: "Detector update failed",
                              message: `Could not update ${editor.name}.`,
                            });
                          }
                        }}
                      />
                      <span>{editor.enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                  </div>
                </div>

                <div className="det-detail-body">
                  <div className="det-detail-meta-strip">
                    <div className="det-meta-item">
                      <span className="det-meta-label">Owner</span>
                      <span className="det-meta-value">{editor.owner_name}</span>
                    </div>
                    <div className="det-meta-item">
                      <span className="det-meta-label">Domain</span>
                      <span className="det-meta-value">{editor.business_domain?.replaceAll("_", " ") ?? "General"}</span>
                    </div>
                    <div className="det-meta-item">
                      <span className="det-meta-label">Issues found</span>
                      <span className="det-meta-value">{editor.issue_count}</span>
                    </div>
                    <div className="det-meta-item">
                      <span className="det-meta-label">Type</span>
                      <span className="det-meta-value">{editor.logic_type?.replaceAll("_", " ") ?? "SQL Rule"}</span>
                    </div>
                  </div>

                  <label className="bs-field">
                    <span>Name</span>
                    <input
                      className="bs-input"
                      value={editor.name}
                      onChange={(e) => setDraftLocal({ ...editor, name: e.target.value })}
                    />
                  </label>
                  <label className="bs-field">
                    <span>Logic summary</span>
                    <textarea
                      className="bs-textarea"
                      rows={2}
                      value={editor.logic_summary}
                      onChange={(e) => setDraftLocal({ ...editor, logic_summary: e.target.value })}
                    />
                  </label>
                  <label className="bs-field">
                    <span>Query / logic</span>
                    <div className="bs-textarea p-0 overflow-hidden font-mono min-h-[220px]">
                      <Editor
                        value={editor.query_logic}
                        onValueChange={(code) => setDraftLocal({ ...editor, query_logic: code })}
                        highlight={(code) => Prism.highlight(code, Prism.languages.sql, "sql")}
                        padding={16}
                        style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: 13,
                          backgroundColor: "transparent",
                          height: "100%",
                          minHeight: "220px",
                          lineHeight: "1.5",
                        }}
                        className="editor-transparent"
                      />
                    </div>
                  </label>

                  <div className="det-detail-meta-cards">
                    <div className="det-mini-card">
                      <span className="det-mini-label">Linked action</span>
                      <span className="det-mini-value">{editor.linked_action_template}</span>
                    </div>
                    <div className="det-mini-card">
                      <span className="det-mini-label">Cost formula</span>
                      <span className="det-mini-value bs-mono" style={{ fontSize: 12 }}>{editor.linked_cost_formula}</span>
                    </div>
                  </div>

                  <div className="bs-pill-row" style={{ marginTop: 4 }}>
                    <span className="det-meta-label" style={{ marginRight: 4 }}>Output fields</span>
                    {editor.expected_output_fields.map((field) => (
                      <span key={field} className="bs-pill bs-pill-mono">
                        {field}
                      </span>
                    ))}
                  </div>

                  <div className="det-detail-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={saveLocalDraft}>
                      <IconSave />
                      Save changes
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={testMut.isPending}
                      onClick={async () => {
                        try {
                          const r = await testMut.mutateAsync(editor.id);
                          setTestResult(r);
                          notify({
                            tone: "success",
                            title: "Detector test completed",
                            message: `${editor.name} returned ${r.sample_rows.length} sample row(s).`,
                          });
                        } catch {
                          notify({
                            tone: "error",
                            title: "Detector test failed",
                            message: `Could not test ${editor.name}.`,
                          });
                        }
                      }}
                    >
                      {testMut.isPending ? "Testing…" : "Test on sample data"}
                    </button>
                  </div>

                  {testResult ? (
                    <div className="det-test-result">
                      <div className="det-test-result-header">
                        <span className="det-test-passed">✓ {testResult.message}</span>
                      </div>
                      <pre className="sql-box">{JSON.stringify(testResult.sample_rows, null, 2)}</pre>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {promptOpen ? (
        <div className="bs-drawer-backdrop" role="presentation" onClick={() => setPromptOpen(false)}>
          <aside className="bs-drawer bs-drawer-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="bs-drawer-header">
              <h2>Prompt to draft</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPromptOpen(false)}>
                Close
              </button>
            </div>
            <div className="bs-drawer-body">
              <p className="det-drawer-hint">
                Describe an anomaly pattern in plain English. The system will compose a reusable SQL detector you can review and save.
              </p>
              <textarea
                className="bs-textarea"
                rows={5}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. Flag invoices where billed amount exceeds contract rate for 3 consecutive cycles…"
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12, width: "100%" }}
                disabled={promptMut.isPending || !promptText.trim()}
                onClick={async () => {
                  try {
                    const r = await promptMut.mutateAsync(promptText);
                    setDraftResult(r.draft);
                    notify({
                      tone: "success",
                      title: "Draft generated",
                      message: `Created detector draft ${r.draft.name}.`,
                    });
                  } catch {
                    notify({
                      tone: "error",
                      title: "Draft generation failed",
                      message: "Could not generate a detector draft from that prompt.",
                    });
                  }
                }}
              >
                {promptMut.isPending ? "Generating…" : "Generate draft"}
              </button>

              {draftResult ? (
                <div className="det-draft-result">
                  <div className="det-draft-result-header">
                    <h4>{draftResult.name}</h4>
                  </div>
                  <p className="td-sub">{draftResult.logic_summary}</p>
                  
                  <div className="bs-detail-meta-strip mt-3 mb-4 flex gap-6 text-xs text-[#8A8A9A]">
                    <div>
                      <span className="block mb-0.5 text-[#5B6275]">Module</span>
                      <span className="text-white/80">{formatModuleLabel(draftResult.module)}</span>
                    </div>
                    <div>
                      <span className="block mb-0.5 text-[#5B6275]">Domain</span>
                      <span className="text-white/80 capitalize">{draftResult.business_domain?.replace("_", " ") ?? "General"}</span>
                    </div>
                    <div>
                      <span className="block mb-0.5 text-[#5B6275]">Severity</span>
                      <span className={`capitalize text-${draftResult.severity === 'critical' ? 'rose' : draftResult.severity === 'high' ? 'amber' : 'sky'}-400`}>{draftResult.severity}</span>
                    </div>
                  </div>

                  <div className="bs-textarea p-0 overflow-hidden font-mono mt-2 mb-4">
                    <Editor
                      value={draftResult.query_logic}
                      onValueChange={() => {}}
                      highlight={(code) => Prism.highlight(code, Prism.languages.sql, "sql")}
                      padding={16}
                      disabled
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 13,
                        backgroundColor: "transparent",
                        lineHeight: "1.5",
                      }}
                    />
                  </div>

                  <div className="det-detail-meta-cards mt-2">
                    <div className="det-mini-card bg-[#0A0F1C] border border-white/5 rounded p-2">
                      <span className="det-mini-label text-[#8A8A9A] text-[10px] uppercase">Linked action</span>
                      <span className="det-mini-value block text-xs mt-0.5">{draftResult.linked_action_template}</span>
                    </div>
                    <div className="det-mini-card bg-[#0A0F1C] border border-white/5 rounded p-2">
                      <span className="det-mini-label text-[#8A8A9A] text-[10px] uppercase">Cost formula</span>
                      <span className="det-mini-value block bs-mono text-xs mt-0.5">{draftResult.linked_cost_formula}</span>
                    </div>
                  </div>

                  <div className="bs-pill-row" style={{ marginTop: 12 }}>
                    <span className="det-meta-label text-[#8A8A9A] text-xs" style={{ marginRight: 6 }}>Output fields:</span>
                    {draftResult.expected_output_fields.map((f) => (
                      <span key={f} className="bs-pill bs-pill-mono">{f}</span>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary det-save-to-library mt-6"
                    onClick={() => {
                      notify({
                        tone: "success",
                        title: "Detector saved",
                        message: "The new detector has been added to your library.",
                      });
                      setPromptOpen(false);
                    }}
                  >
                    <IconSave /> Save to anomaly queries
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
