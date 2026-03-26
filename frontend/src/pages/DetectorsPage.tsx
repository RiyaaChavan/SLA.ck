import { useMemo, useState } from "react";
import type { DetectorDefinition, DetectorDraft, DetectorTestResult } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { formatModuleLabel } from "../lib/formatters";

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

  return (
    <div className="page-content bs-detectors-layout">
      <PageHeader
        title="Anomaly queries"
        subtitle="Editable detector logic for vendor anomalies, SLA clusters, and resource optimization. Everything on this page is demo-driven and fully interactive."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setPromptOpen(true)}>
            Prompt to draft
          </button>
        }
      />

      <div className="bs-split-panels">
        <div className="card bs-detector-list">
          <div className="card-header">
            <div className="card-title">Detector library</div>
            <div className="card-subtitle">{detectors.length} definitions</div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <ul className="bs-detector-ul">
              {detectors.map((detector) => (
                <li key={detector.id}>
                  <button
                    type="button"
                    className={`bs-detector-item ${selectedId === detector.id ? "bs-detector-item-active" : ""}`}
                    onClick={() => openDetail(detector)}
                  >
                    <span className="bs-detector-name">{detector.name}</span>
                    <span className="bs-muted">{formatModuleLabel(detector.module)}</span>
                    <span className={`badge badge-${detector.enabled ? "default" : "high"}`}>
                      {detector.enabled ? "on" : "off"}
                    </span>
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
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setDraftLocal({ ...editor, enabled });
                      setDetectors((current) =>
                        current.map((item) => (item.id === editor.id ? { ...item, enabled } : item)),
                      );
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
                    rows={7}
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
                  {editor.expected_output_fields.map((field) => (
                    <span key={field} className="bs-pill">
                      {field}
                    </span>
                  ))}
                </div>
                <div className="bs-card-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={saveLocalDraft} disabled={saving}>
                    {saving ? "Saving…" : "Save (demo)"}
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
              <textarea
                className="bs-textarea"
                rows={5}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                disabled={drafting}
                onClick={async () => {
                  setDrafting(true);
                  await sleep(760);
                  setDraftResult(draftFromPrompt(promptText));
                  setDrafting(false);
                }}
              >
                {drafting ? "Generating…" : "Generate draft"}
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
