import { useState } from "react";
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

type DetectorsPageProps = {
  organizationId?: number;
};

export function DetectorsPage({ organizationId }: DetectorsPageProps) {
  const { notify } = useNotifications();
  const q = useDetectors(organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLocal, setDraftLocal] = useState<DetectorDefinition | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState(
    "Flag invoices where billed amount is 10% higher than contract rate for three consecutive cycles.",
  );
  const [draftResult, setDraftResult] = useState<DetectorDraft | null>(null);
  const [testResult, setTestResult] = useState<DetectorTestResult | null>(null);

  const promptMut = usePromptDraftDetector();
  const testMut = useTestDetector(organizationId);
  const toggleMut = useToggleDetector(organizationId);

  const selected = q.data?.find((d) => d.id === selectedId) ?? null;
  const editor = draftLocal ?? selected;

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
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
    setDraftLocal({ ...draftLocal });
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
        subtitle="Rule-based checks your SQL agents run (editable, prompt-assisted). GNN-style signals can layer on later."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setPromptOpen(true)}>
            Prompt to draft
          </button>
        }
      />

      {q.isPending ? (
        <StateBlock title="Loading detectors" loading />
      ) : q.isError || !q.data?.length ? (
        <StateBlock title="No detectors" />
      ) : (
        <div className="bs-split-panels">
          <div className="card bs-detector-list">
            <div className="card-header">
              <div className="card-title">Detector library</div>
              <div className="card-subtitle">{q.data.length} definitions</div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <ul className="bs-detector-ul">
                {q.data.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`bs-detector-item ${selectedId === d.id ? "bs-detector-item-active" : ""}`}
                      onClick={() => openDetail(d)}
                    >
                      <span className="bs-detector-name">{d.name}</span>
                      <span className="bs-muted">{formatModuleLabel(d.module)}</span>
                      <span className={`badge badge-${d.enabled ? "default" : "high"}`}>{d.enabled ? "on" : "off"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card bs-detector-detail">
            {!editor ? (
              <div className="card-body">
                <p className="bs-muted">Select a detector from the library.</p>
              </div>
            ) : (
              <>
                <div className="card-header">
                  <div>
                    <div className="card-title">{editor.name}</div>
                    <div className="card-subtitle">{editor.description}</div>
                  </div>
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
                    <span>Enabled</span>
                  </label>
                </div>
                <div className="card-body bs-detail-form">
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
                    <textarea
                      className="bs-textarea bs-mono"
                      rows={6}
                      value={editor.query_logic}
                      onChange={(e) => setDraftLocal({ ...editor, query_logic: e.target.value })}
                    />
                  </label>
                  <div className="bs-field">
                    <span>Linked action template</span>
                    <div className="td-sub">{editor.linked_action_template}</div>
                  </div>
                  <div className="bs-field">
                    <span>Linked cost formula</span>
                    <div className="td-sub">{editor.linked_cost_formula}</div>
                  </div>
                  <div className="bs-pill-row">
                    {editor.expected_output_fields.map((f) => (
                      <span key={f} className="bs-pill">
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="bs-card-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={saveLocalDraft}>
                      Save (local demo)
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
                      Test on sample data
                    </button>
                  </div>
                  {testResult ? (
                    <div className="bs-test-result">
                      <div className="td-sub">{testResult.message}</div>
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
              <textarea className="bs-textarea" rows={5} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                disabled={promptMut.isPending}
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
                Generate draft
              </button>
              {draftResult ? (
                <div className="bs-test-result" style={{ marginTop: 16 }}>
                  <h4>{draftResult.name}</h4>
                  <p className="td-sub">{draftResult.logic_summary}</p>
                  <pre className="sql-box">{draftResult.query_logic}</pre>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
