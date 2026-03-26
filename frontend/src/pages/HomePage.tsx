import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

type HomePageProps = {
  onSeed: () => void;
  seeding: boolean;
  hasData: boolean;
};

/* ── SVG Icons ─────────────────────────────────────────────── */
function IconSpinner(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.9s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function IconStar(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconSearch(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconLeak(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconShield(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconAI(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconAudit(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/* ── Feature data ─────────────────────────────────────────── */
const features = [
  {
    color: "red",
    icon: <IconLeak />,
    title: "ProcureWatch",
    desc: "Invoice, vendor, and reconciliation anomalies — duplicate risk, rate drift, and three-way match issues with money-at-risk on every case.",
    tag: "PROCUREWATCH",
  },
  {
    color: "sky",
    icon: <IconShield />,
    title: "SLA Sentinel",
    desc: "Extract SLA rules from documents, monitor live operations, predict breach risk, and drive approval-aware actions before penalties hit.",
    tag: "SLA SENTINEL",
  },
  {
    color: "lime",
    icon: <IconAI />,
    title: "Copilot",
    desc: "Plain-English investigations over your connected data — safe read-only SQL with explainability.",
    tag: "COPILOT",
  },
  {
    color: "violet",
    icon: <IconAudit />,
    title: "Audit trail",
    desc: "Every case, approval, and execution is logged for governance — exportable reports when you need them.",
    tag: "GOVERNANCE",
  },
];

/* ── Workflow steps ───────────────────────────────────────── */
const steps = [
  { label: "Connect data", desc: "Upload or connect sources — freshness, schema, and health in one place." },
  { label: "Detect issues", desc: "ProcureWatch and SLA Sentinel run continuously on your operational signals." },
  { label: "Estimate risk", desc: "Every case carries money-at-risk, confidence, and transparent formulas." },
  { label: "Suggest action", desc: "Playbooks and next steps are tied to evidence, not black-box scores." },
  { label: "Get approval", desc: "Approval chains and policies gate execution before anything changes." },
  { label: "Track outcome", desc: "Execution state and audit timeline close the loop from signal to result." },
];

/* ── Component ────────────────────────────────────────────── */
export function HomePage({ onSeed, seeding, hasData }: HomePageProps) {
  const navigate = useNavigate();

  return (
    <div className="home-page">

      {/* ══ Background Orbs ═════════════════════════════════ */}
      <div className="home-bg-orbs" aria-hidden="true">
        <div className="home-orb home-orb-1" />
        <div className="home-orb home-orb-2" />
        <div className="home-orb home-orb-3" />
        <div className="home-orb home-orb-4" />
      </div>

      {/* ══ Hero ════════════════════════════════════════════ */}
      <section className="home-hero">
        <div className="home-hero-glow" aria-hidden="true" />

        <div className="home-hero-content">

          {/* Top pill — OBSERVE • DIAGNOSE • REMEDIATE */}
          <div className="home-topbadge">
            <span className="home-topbadge-dot" />
            CONNECT • DETECT • RESOLVE
          </div>

          {/* Feature pills row */}
          <div className="home-feat-pills">
            <div className="home-feat-pill home-feat-pill-teal">
              <IconStar />
              ProcureWatch
            </div>
            <div className="home-feat-pill home-feat-pill-dark">
              <IconSearch />
              SLA Sentinel
            </div>
          </div>

          {/* Main heading — serif display font */}
          <h1 className="home-h1">
            Operational issues,<br />
            quantified like<br />
            <span className="home-h1-accent">production incidents.</span>
          </h1>

          {/* Lead copy */}
          <p className="home-lead">
            Business Sentry connects your data, detects anomalies and SLA risk, estimates money at
            risk, recommends actions, routes them through approval, and tracks outcomes — with a case
            at the center of every workflow.
          </p>

          {/* CTAs */}
          <div className="home-hero-ctas">
            <button
              className="home-cta-primary"
              onClick={onSeed}
              disabled={seeding}
            >
              {seeding ? <><IconSpinner /> Bootstrapping data...</> : "Bootstrap Demo Data →"}
            </button>
            {hasData && (
              <button
                className="home-cta-ghost"
                onClick={() => navigate("/impact")}
              >
                Open anomalies
              </button>
            )}
          </div>

          {/* Meta strip */}
          <div className="home-meta-strip">
            <span><strong>2</strong> MVP modules · ProcureWatch & SLA Sentinel</span>
            <span className="home-meta-dot">·</span>
            <span>Case-centric workflow</span>
            <span className="home-meta-dot">·</span>
            <span>Approval-aware actions</span>
            <span className="home-meta-dot">·</span>
            <span>Copilot investigations</span>
          </div>

          {/* ── Preview Cards Row ── */}
          <div className="home-hero-previews" aria-hidden="true">

            {/* Console Card */}
            <div className="home-console">
              <div className="home-console-header">
                <div className="home-console-title-group">
                  <span className="home-console-live-ring" />
                  <span className="home-console-name">Business Sentry</span>
                  <span className="home-console-live-badge">LIVE</span>
                </div>
                <span className="home-console-action">Pause</span>
              </div>

              <div className="home-console-tabs">
                <button className="home-console-tab home-console-tab-active">Procurement</button>
                <button className="home-console-tab">SLA Monitor</button>
                <button className="home-console-tab">Vendor</button>
              </div>

              <div className="home-console-feed-header">
                <span>Live Feed</span>
                <span className="home-console-dots">
                  <i /><i /><i />
                </span>
              </div>

              <div className="home-console-rows">
                <div className="home-console-row home-console-row-amber">
                  <div className="home-console-row-body">
                    <div className="home-console-row-title">TechSource duplicate invoice detected</div>
                    <div className="home-console-row-state home-console-state-amber">Verifying</div>
                  </div>
                  <span className="home-console-row-meta">Q4 2025</span>
                </div>
                <div className="home-console-row home-console-row-cobalt">
                  <div className="home-console-row-body">
                    <div className="home-console-row-title">CloudCorp SLA penalty — 3 breaches</div>
                    <div className="home-console-row-state home-console-state-cobalt">Flagged</div>
                  </div>
                  <span className="home-console-row-meta">₹4.8L</span>
                </div>
              </div>

              <div className="home-console-footer">
                <span>Anomalies detected <strong className="home-console-count">94</strong></span>
                <span>₹3.2Cr at risk</span>
              </div>
            </div>

            {/* 3D Newspaper */}
            <div className="home-newspaper-wrap">
              <div className="home-newspaper">
                <div className="home-np-header">
                  <span className="home-np-brand">SENTRY</span>
                  <span className="home-np-edition">INTELLIGENCE BRIEF</span>
                  <span className="home-np-date">Q4 2025 · Vol. 12</span>
                </div>
                <div className="home-np-rule" />
                <div className="home-np-headline">
                  Enterprise Leakage Hits Record ₹3.2Cr
                </div>
                <div className="home-np-sub">
                  Procurement anomalies detected across 7 vendors in Q4
                </div>
                <div className="home-np-rule" />
                <div className="home-np-cols">
                  <div className="home-np-col">
                    <div className="home-np-col-head">Procurement</div>
                    <div className="home-np-line" />
                    <div className="home-np-line" />
                    <div className="home-np-line short" />
                    <div className="home-np-callout amber">
                      <span className="home-np-callout-val">₹48.3L</span>
                      <span className="home-np-callout-label">overcharge</span>
                    </div>
                    <div className="home-np-line" />
                    <div className="home-np-line short" />
                  </div>
                  <div className="home-np-col">
                    <div className="home-np-col-head">SLA Breach</div>
                    <div className="home-np-line" />
                    <div className="home-np-line" />
                    <div className="home-np-line short" />
                    <div className="home-np-callout cobalt">
                      <span className="home-np-callout-val">12</span>
                      <span className="home-np-callout-label">violations</span>
                    </div>
                    <div className="home-np-line" />
                    <div className="home-np-line short" />
                  </div>
                </div>
                <div className="home-np-rule" />
                <div className="home-np-footer">
                  <span>94 alerts active</span>
                  <span>97.4% accuracy</span>
                </div>
              </div>
            </div>

          </div>{/* /home-hero-previews */}

        </div>
      </section>

      {/* ══ Impact Stats ════════════════════════════════════ */}
      <div className="home-stats-row">
        <div className="home-stat-item">
          <div className="home-stat-value"><span>15</span>–20%</div>
          <div className="home-stat-label">of enterprise spend lost to silent leakage annually</div>
        </div>
        <div className="home-stat-item">
          <div className="home-stat-value"><span>4</span> pillars</div>
          <div className="home-stat-label">Procurement · SLA · Vendor · Resources — all unified</div>
        </div>
        <div className="home-stat-item">
          <div className="home-stat-value"><span>&lt;5s</span></div>
          <div className="home-stat-label">Time from natural language question to SQL-backed answer</div>
        </div>
        <div className="home-stat-item">
          <div className="home-stat-value"><span>100%</span></div>
          <div className="home-stat-label">Audit coverage — every action logged for compliance</div>
        </div>
      </div>

      {/* ══ Features ════════════════════════════════════════ */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-eyebrow">Phase 1 focus</div>
          <h2 className="home-h2">Procurement integrity &amp; SLA protection.<br />One operational command surface.</h2>
          <p className="home-section-desc">
            Start with ProcureWatch and SLA Sentinel — everything rolls up to cases, impact, and
            auditable actions.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((f) => (
            <div key={f.title} className={`feature-card feature-card-${f.color}`}>
              <div className={`feature-card-icon feature-icon-${f.color}`}>
                {f.icon}
              </div>
              <div>
                <div className="feature-card-title">{f.title}</div>
                <div className="feature-card-desc">{f.desc}</div>
              </div>
              <div className="feature-card-tag">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {f.tag}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ Workflow ════════════════════════════════════════ */}
      <section className="home-section home-section-alt">
        <div className="home-section-header">
          <div className="home-section-eyebrow">How it works</div>
          <h2 className="home-h2">From data to approved action — then prove the outcome</h2>
          <p className="home-section-desc">
            The demo narrative is locked: connect → detect → estimate risk → suggest → approve → track.
          </p>
        </div>

        <div className="workflow-steps home-workflow-six">
          {steps.map((step, i) => (
            <div key={step.label} className="workflow-step">
              <div className="workflow-step-num">{i + 1}</div>
              <div className="workflow-step-label">{step.label}</div>
              <div className="workflow-step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA ═════════════════════════════════════════════ */}
      <section className="home-cta-section">
        <div className="home-cta-glow" aria-hidden="true" />
        <h2 className="home-cta-h2">
          Ready to run the<br />Business Sentry demo?
        </h2>
        <p className="home-cta-desc">
          Bootstrap the workspace seed, then walk Connected data → Anomaly queries → Anomalies → Tickets → Approvals
          → Audit — contracts are mocked; UX and API shapes are real.
        </p>
        <button className="home-cta-primary" onClick={onSeed} disabled={seeding}>
          {seeding ? "Bootstrapping..." : "Get Started →"}
        </button>
      </section>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
