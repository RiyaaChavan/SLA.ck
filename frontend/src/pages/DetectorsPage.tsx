import { useMemo, useState } from "react";
import type { DetectorDefinition, DetectorDraft, DetectorTestResult } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { formatModuleLabel } from "../lib/formatters";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

type DetectorsPageProps = {
  organizationId?: number;
};

const DEMO_DETECTORS: DetectorDefinition[] = [
  {
    id: "det-rate-drift",
    name: "Contract rate drift on vendor invoices",
    description: "Flags vendors billing above contracted rates across repeated invoice cycles.",
    module: "procurewatch",
    business_domain: "finance_ap",
    severity: "critical",
    owner_name: "Ananya Shah",
    enabled: true,
    logic_type: "sql_rule",
    logic_summary: "Compare effective billed rate against contracted rate and require repeated variance over time.",
    query_logic:
      "select vendor_id, contract_id, sum(invoice_amount - billed_units * contracted_rate) as leakage_inr from invoices where variance_pct > 8 group by 1,2 having count(*) >= 2 order by leakage_inr desc limit 10;",
    expected_output_fields: ["vendor_id", "contract_id", "leakage_inr"],
    linked_action_template: "Hold disputed line items and request vendor credit note",
    linked_cost_formula: "sum(invoice_amount - billed_units * contracted_rate)",
    last_triggered_at: "2026-03-29T18:20:00+05:30",
    issue_count: 8,
  },
  {
    id: "det-dispatch-delay",
    name: "Late delivery cluster around dispatch bay saturation",
    description: "Links delay spikes to constrained dispatch throughput and rider coverage.",
    module: "sla_sentinel",
    business_domain: "last_mile_ops",
    severity: "critical",
    owner_name: "Siddharth Rao",
    enabled: true,
    logic_type: "sql_rule",
    logic_summary: "Find stores where late orders cluster on days when dispatch bay utilization is persistently high.",
    query_logic:
      "select o.store_id, count(*) as delayed_orders, avg(i.dispatch_bay_utilization_pct) as bay_util, avg(i.idle_driver_minutes) as idle_driver_min from orders o join inventory_snapshots i on o.store_id = i.store_id and date(o.delivered_at) = i.snapshot_date where o.delivered_at is not null and extract(epoch from (o.delivered_at - o.created_at))/60 > o.promised_eta_min + 8 group by 1 having count(*) >= 20 order by delayed_orders desc;",
    expected_output_fields: ["store_id", "delayed_orders", "bay_util", "idle_driver_min"],
    linked_action_template: "Rebalance riders and cap slot density",
    linked_cost_formula: "delayed_orders * average_refund_per_breach",
    last_triggered_at: "2026-03-29T18:28:00+05:30",
    issue_count: 11,
  },
  {
    id: "det-cold-chain",
    name: "Cold-chain SLA breach candidates",
    description: "Surfaces cold-chain work items likely to miss response or resolution windows.",
    module: "sla_sentinel",
    business_domain: "cold_chain",
    severity: "high",
    owner_name: "Pooja Nair",
    enabled: true,
    logic_type: "sql_rule",
    logic_summary: "Track open cold-chain and late-delivery work items against nearest SLA deadline.",
    query_logic:
      "select store_id, category, count(*) as open_cases, min(sla_deadline_at) as nearest_deadline from work_items where status = 'open' and category in ('cold_chain_breach','late_delivery_cluster') group by 1,2 order by nearest_deadline asc;",
    expected_output_fields: ["store_id", "category", "open_cases", "nearest_deadline"],
    linked_action_template: "Escalate reefer downtime and reroute chilled orders",
    linked_cost_formula: "open_cases * penalty_amount",
    last_triggered_at: "2026-03-29T18:25:00+05:30",
    issue_count: 6,
  },
  {
    id: "det-idle-riders",
    name: "Idle rider pockets during demand trough",
    description: "Detects stores carrying excess rider minutes relative to order density and dispatch load.",
    module: "procurewatch",
    business_domain: "resource_optimization",
    severity: "high",
    owner_name: "Megha Iyer",
    enabled: false,
    logic_type: "sql_rule",
    logic_summary: "Look for stores with high idle rider minutes and low dispatch bay utilization.",
    query_logic:
      "select store_id, avg(idle_driver_minutes) as avg_idle_driver_min, avg(dispatch_bay_utilization_pct) as bay_util from inventory_snapshots group by 1 having avg(idle_driver_minutes) > 45 and avg(dispatch_bay_utilization_pct) < 82 order by avg_idle_driver_min desc;",
    expected_output_fields: ["store_id", "avg_idle_driver_min", "bay_util"],
    linked_action_template: "Compress low-density shifts and move riders into flex pool",
    linked_cost_formula: "avg_idle_driver_min * blended_driver_cost_per_minute",
    last_triggered_at: "2026-03-28T17:52:00+05:30",
    issue_count: 12,
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function draftFromPrompt(prompt: string): DetectorDraft {
  return {
    name: "High-value exception detector",
    logic_summary:
      "Groups the described anomaly into a reusable SQL rule with thresholding, recurrence checks, and action fields for downstream workflows.",
    query_logic:
      `-- Drafted from prompt\n-- ${prompt}\nselect store_id, vendor_id, count(*) as exception_count, sum(projected_impact_inr) as projected_impact_inr\nfrom anomaly_candidate_facts\nwhere exception_score >= 0.82\ngroup by 1,2\nhaving count(*) >= 3\norder by projected_impact_inr desc\nlimit 25;`,
    expected_output_fields: ["store_id", "vendor_id", "exception_count", "projected_impact_inr"],
    module: "procurewatch",
    business_domain: "general",
    severity: "high",
    linked_action_template: "Review and assign action",
    linked_cost_formula: "projected_impact_inr * 1.0",
  };
}

function testRowsForDetector(detectorId: string): DetectorTestResult {
  if (detectorId === "det-dispatch-delay") {
    return {
      passed: true,
      message: "Matched 11 high-confidence store/day clusters in the current demo slice.",
      sample_rows: [
        { store_id: "BLR-HSR-04", delayed_orders: 54, bay_util: 96, idle_driver_min: 14 },
        { store_id: "MUM-AND-01", delayed_orders: 39, bay_util: 98, idle_driver_min: 12 },
      ],
    };
  }

  if (detectorId === "det-rate-drift") {
    return {
      passed: true,
      message: "Matched 8 repeated invoice variance patterns across RapidFleet and PolarNest contracts.",
      sample_rows: [
        { vendor_id: "RapidFleet Logistics", contract_id: "CTR-LM-03", leakage_inr: 684000 },
        { vendor_id: "PolarNest Cold Chain", contract_id: "CTR-COLD-01", leakage_inr: 318000 },
      ],
    };
  }

  return {
    passed: true,
    message: "Detector returned stable sample rows from the demo dataset.",
    sample_rows: [
      { store_id: "HYD-KPHB-03", open_cases: 4, nearest_deadline: "2026-03-29 19:12" },
      { store_id: "GGN-SEC54-02", open_cases: 3, nearest_deadline: "2026-03-29 19:24" },
    ],
  };
}

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

export function DetectorsPage(_: DetectorsPageProps) {
  const [detectors, setDetectors] = useState(DEMO_DETECTORS);
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_DETECTORS[0]?.id ?? null);
  const [draftLocal, setDraftLocal] = useState<DetectorDefinition | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState(
    "Flag stores where rider idle minutes stay high while dispatch utilization stays below 80% for two consecutive days.",
  );
  const [draftResult, setDraftResult] = useState<DetectorDraft | null>(null);
  const [testResult, setTestResult] = useState<DetectorTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const selected = useMemo(
    () => detectors.find((detector) => detector.id === selectedId) ?? null,
    [detectors, selectedId],
  );
  const editor = draftLocal ?? selected;

  const openDetail = (detector: DetectorDefinition) => {
    setSelectedId(detector.id);
    setDraftLocal({ ...detector });
    setTestResult(null);
  };

  const saveLocalDraft = async () => {
    if (!draftLocal) return;
    setSaving(true);
    await sleep(420);
    setDetectors((current) => current.map((item) => (item.id === draftLocal.id ? { ...draftLocal } : item)));
    setSaving(false);
  };

  const saveToAnomalyLibrary = async () => {
    if (!draftResult) return;
    setSavedToLibrary(false);
    await sleep(600);
    const newDetector: DetectorDefinition = {
      id: `det-drafted-${Date.now()}`,
      name: draftResult.name,
      description: draftResult.logic_summary,
      module: draftResult.module,
      business_domain: draftResult.business_domain,
      severity: draftResult.severity,
      owner_name: "You",
      enabled: true,
      logic_type: "sql_rule",
      logic_summary: draftResult.logic_summary,
      query_logic: draftResult.query_logic,
      expected_output_fields: draftResult.expected_output_fields,
      linked_action_template: draftResult.linked_action_template,
      linked_cost_formula: draftResult.linked_cost_formula,
      last_triggered_at: new Date().toISOString(),
      issue_count: 0,
    };
    setDetectors((current) => [...current, newDetector]);
    setSavedToLibrary(true);
  };

  return (
    <div className="page-content bs-detectors-layout">
      <PageHeader
        title="Anomaly queries"
        subtitle="Editable detector logic for vendor anomalies, SLA clusters, and resource optimization."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => { setPromptOpen(true); setSavedToLibrary(false); setDraftResult(null); }}>
            <IconPlus /> Prompt to draft
          </button>
        }
      />

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
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setDraftLocal({ ...editor, enabled });
                        setDetectors((current) =>
                          current.map((item) => (item.id === editor.id ? { ...item, enabled } : item)),
                        );
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
                    <span className="det-meta-value">{editor.business_domain.replaceAll("_", " ")}</span>
                  </div>
                  <div className="det-meta-item">
                    <span className="det-meta-label">Issues found</span>
                    <span className="det-meta-value">{editor.issue_count}</span>
                  </div>
                  <div className="det-meta-item">
                    <span className="det-meta-label">Type</span>
                    <span className="det-meta-value">{editor.logic_type.replaceAll("_", " ")}</span>
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
                  <button type="button" className="btn btn-secondary btn-sm" onClick={saveLocalDraft} disabled={saving}>
                    <IconSave />
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={testing}
                    onClick={async () => {
                      setTesting(true);
                      await sleep(680);
                      setTestResult(testRowsForDetector(editor.id));
                      setTesting(false);
                    }}
                  >
                    {testing ? "Testing…" : "Test on sample data"}
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

      {/* ── Prompt-to-draft drawer ── */}
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
                disabled={drafting || !promptText.trim()}
                onClick={async () => {
                  setDrafting(true);
                  setSavedToLibrary(false);
                  await sleep(760);
                  setDraftResult(draftFromPrompt(promptText));
                  setDrafting(false);
                }}
              >
                {drafting ? "Generating…" : "Generate draft"}
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
                      <span className="text-white/80 capitalize">{draftResult.business_domain.replace("_", " ")}</span>
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

                  {/* ── Save to anomaly library button ── */}
                  <button
                    type="button"
                    className={`btn ${savedToLibrary ? "btn-ghost" : "btn-primary"} det-save-to-library`}
                    disabled={savedToLibrary}
                    onClick={saveToAnomalyLibrary}
                  >
                    {savedToLibrary ? <><IconCheck /> Saved to anomaly queries</> : <><IconSave /> Save to anomaly queries</>}
                  </button>

                  {savedToLibrary && (
                    <div className="det-saved-confirmation">
                      Added to the detector library. It will appear in the sidebar and run against connected datasets.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
