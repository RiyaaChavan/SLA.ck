import { NavLink, useNavigate } from "react-router-dom";
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

function IconVendor(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconServer(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
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
    title: "Procurement Leakage Detection",
    desc: "Spot overcharges, duplicate invoices, budget overruns, and off-contract spend before they compound into quarter-end surprises.",
    tag: "COST CONTROL",
  },
  {
    color: "sky",
    icon: <IconShield />,
    title: "SLA Compliance Monitoring",
    desc: "Track every vendor SLA commitment in real time. Quantify the financial impact of each breach and trigger escalations automatically.",
    tag: "RISK MANAGEMENT",
  },
  {
    color: "violet",
    icon: <IconVendor />,
    title: "Vendor Billing Intelligence",
    desc: "Reconcile billed amounts against contracted rates across all vendor relationships. Surface discrepancies the moment they occur.",
    tag: "VENDOR OPS",
  },
  {
    color: "amber",
    icon: <IconServer />,
    title: "Resource Optimization",
    desc: "Identify idle, overprovisioned, and underutilized infrastructure. Get actionable recommendations with projected monthly savings.",
    tag: "INFRASTRUCTURE",
  },
  {
    color: "lime",
    icon: <IconAI />,
    title: "AI Investigative Copilot",
    desc: "Ask plain-English cost questions. CostPulse AI translates them to safe, read-only SQL and returns results in seconds — no analyst needed.",
    tag: "AI / ANALYTICS",
  },
  {
    color: "violet",
    icon: <IconAudit />,
    title: "Immutable Audit Trail",
    desc: "Every alert, approval, and remediation action is logged with full context. Compliance-ready reports generated on demand.",
    tag: "GOVERNANCE",
  },
];

/* ── Workflow steps ───────────────────────────────────────── */
const steps = [
  { label: "Observe",   desc: "Ingest procurement, SLA, vendor, and resource data continuously" },
  { label: "Diagnose",  desc: "AI models flag anomalies, breaches, and waste patterns" },
  { label: "Quantify",  desc: "Every alert is priced — financial impact calculated automatically" },
  { label: "Approve",   desc: "Human-in-the-loop review with one-click approval workflows" },
  { label: "Execute",   desc: "Automated remediation or guided manual action with full logging" },
];

/* ── Nav links ────────────────────────────────────────────── */
const navLinks = [
  { to: "/overview",    label: "Dashboard" },
  { to: "/alerts",      label: "Alerts" },
  { to: "/resources",   label: "Resources" },
  { to: "/investigate", label: "Investigate" },
  { to: "/audit",       label: "Audit" },
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

      {/* ══ Top Navigation ══════════════════════════════════ */}
      <nav className="home-topnav">
        <div className="home-topnav-logo">
          <div className="home-topnav-logo-mark">CP</div>
          <div className="home-topnav-logo-text">
            <span className="home-topnav-logo-name">CostPulse AI</span>
          </div>
        </div>

        <div className="home-topnav-links">
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className="home-topnav-link">
              {l.label}
            </NavLink>
          ))}
        </div>

        <button className="home-topnav-cta" onClick={onSeed} disabled={seeding}>
          {seeding ? "Bootstrapping..." : "Bootstrap Demo →"}
        </button>
      </nav>

      {/* ══ Hero ════════════════════════════════════════════ */}
      <section className="home-hero">
        <div className="home-hero-glow" aria-hidden="true" />

        <div className="home-hero-content">

          {/* Top pill — OBSERVE • DIAGNOSE • REMEDIATE */}
          <div className="home-topbadge">
            <span className="home-topbadge-dot" />
            OBSERVE • DIAGNOSE • REMEDIATE
          </div>

          {/* Feature pills row */}
          <div className="home-feat-pills">
            <div className="home-feat-pill home-feat-pill-teal">
              <IconStar />
              Cost Intelligence
            </div>
            <div className="home-feat-pill home-feat-pill-dark">
              <IconSearch />
              AI Investigator
            </div>
          </div>

          {/* Main heading — serif display font */}
          <h1 className="home-h1">
            Your enterprise<br />
            is leaking money.<br />
            <span className="home-h1-accent">We find it.</span>
          </h1>

          {/* Lead copy */}
          <p className="home-lead">
            CostPulse AI monitors procurement anomalies, SLA breaches, vendor billing
            discrepancies, and idle infrastructure across your entire enterprise —
            surfaces the financial impact, and arms your team to act.
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
                onClick={() => navigate("/overview")}
              >
                Go to Dashboard
              </button>
            )}
          </div>

          {/* Meta strip */}
          <div className="home-meta-strip">
            <span><strong>6</strong> intelligence modules</span>
            <span className="home-meta-dot">·</span>
            <span>Real-time cost alerts</span>
            <span className="home-meta-dot">·</span>
            <span>AI-powered investigation</span>
            <span className="home-meta-dot">·</span>
            <span>Full compliance audit trail</span>
          </div>

          {/* ── Preview Cards Row ── */}
          <div className="home-hero-previews" aria-hidden="true">

            {/* Console Card */}
            <div className="home-console">
              <div className="home-console-header">
                <div className="home-console-title-group">
                  <span className="home-console-live-ring" />
                  <span className="home-console-name">Cost Monitor</span>
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
                  <span className="home-np-brand">COSTPULSE</span>
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
          <div className="home-section-eyebrow">Why leakage goes undetected</div>
          <h2 className="home-h2">Six ways enterprises lose money.<br />One platform to stop them.</h2>
          <p className="home-section-desc">
            Most cost overruns are invisible until quarter-end. CostPulse surfaces
            every signal as it happens, with financial impact attached.
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
          <h2 className="home-h2">From detection to remediation in minutes</h2>
          <p className="home-section-desc">
            A closed-loop workflow that keeps finance, procurement, and operations aligned — automatically.
          </p>
        </div>

        <div className="workflow-steps">
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
          Ready to command<br />every rupee?
        </h2>
        <p className="home-cta-desc">
          Bootstrap the enterprise demo dataset — fully seeded with realistic
          procurement, SLA, vendor, and resource data — and explore every module instantly.
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
