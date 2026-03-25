import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

type HomePageProps = {
  onSeed: () => void;
  seeding: boolean;
  hasData: boolean;
};

/* ── SVG Icons ────────────────────────────────────────── */
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

/* ── Feature data ────────────────────────────────────── */
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

/* ── Workflow steps ──────────────────────────────────── */
const steps = [
  {
    label: "Observe",
    desc: "Ingest procurement, SLA, vendor, and resource data continuously",
  },
  {
    label: "Diagnose",
    desc: "AI models flag anomalies, breaches, and waste patterns",
  },
  {
    label: "Quantify",
    desc: "Every alert is priced — financial impact calculated automatically",
  },
  {
    label: "Approve",
    desc: "Human-in-the-loop review with one-click approval workflows",
  },
  {
    label: "Execute",
    desc: "Automated remediation or guided manual action with full logging",
  },
];

/* ── Component ───────────────────────────────────────── */
export function HomePage({ onSeed, seeding, hasData }: HomePageProps) {
  const navigate = useNavigate();

  return (
    <div className="home-page">

      {/* ══ Hero ══════════════════════════════════════════ */}
      <section className="home-hero">
        <div className="home-aurora-bg" />

        {/* Left: copy */}
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            Enterprise Cost Intelligence Platform
          </div>

          <h1 className="home-h1">
            Your enterprise<br />
            is leaking money.<br />
            <span className="home-h1-accent">We find it.</span>
          </h1>

          <p className="home-lead">
            CostPulse AI monitors procurement anomalies, SLA breaches, vendor billing
            discrepancies, and idle infrastructure across your entire enterprise —
            surfaces the impact, and arms your team to act.
          </p>

          <div className="home-ctas">
            <button
              className="btn btn-green btn-hero"
              onClick={onSeed}
              disabled={seeding}
            >
              {seeding ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.9s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Bootstrapping data...
                </>
              ) : "Bootstrap Demo Data →"}
            </button>

            {hasData ? (
              <button
                className="btn btn-outline btn-hero"
                onClick={() => navigate("/overview")}
              >
                Go to Dashboard
              </button>
            ) : null}
          </div>

          <div className="home-meta-strip">
            <span><strong>6</strong> intelligence modules</span>
            <span className="home-meta-dot">·</span>
            <span>Real-time cost alerts</span>
            <span className="home-meta-dot">·</span>
            <span>AI-powered investigation</span>
            <span className="home-meta-dot">·</span>
            <span>Full compliance audit trail</span>
          </div>
        </div>

        {/* Right: floating UI badge cluster */}
        <div className="hbc" aria-hidden="true">

          {/* Pill row — top */}
          <div className="hbc-pills">
            <div className="hbc-pill hbc-pill-red">
              <span className="hbc-dot red" />
              94 active alerts
            </div>
            <div className="hbc-pill hbc-pill-lime">
              <span className="hbc-dot lime" />
              12 approvals pending
            </div>
            <div className="hbc-pill hbc-pill-violet">
              <span className="hbc-dot violet" />
              3 auto-remediated
            </div>
          </div>

          {/* Badge 1 — Critical alert */}
          <div className="hbc-float hbc-f1">
            <div className="hbc-card">
              <div className="hbc-card-header">
                <div className="hbc-card-header-left">
                  <span className="hbc-status-dot red pulse" />
                  <span className="hbc-eyebrow red">Critical Alert</span>
                </div>
                <span className="hbc-time">2m ago</span>
              </div>
              <div className="hbc-card-title">₹48.3L Procurement Anomaly</div>
              <div className="hbc-card-sub">TechSource Industries · Q4 2025</div>
              <div className="hbc-card-footer">
                <span className="hbc-tag red">Pending Approval</span>
                <span className="hbc-impact">₹48.3L impact</span>
              </div>
            </div>
          </div>

          {/* Badge 2 — Savings metric */}
          <div className="hbc-float hbc-f2">
            <div className="hbc-card">
              <div className="hbc-card-header">
                <div className="hbc-card-header-left">
                  <span className="hbc-status-dot lime" />
                  <span className="hbc-eyebrow lime">Savings Surfaced</span>
                </div>
                <span className="hbc-delta">↑ +28%</span>
              </div>
              <div className="hbc-big-num">
                ₹3.2 Cr
                <span className="hbc-big-num-unit">/mo</span>
              </div>
              <div className="hbc-bars">
                <div className="hbc-bar-row">
                  <span className="hbc-bar-label">Procurement</span>
                  <div className="hbc-bar-track">
                    <div className="hbc-bar-fill violet" style={{ width: "56%" }} />
                  </div>
                  <span className="hbc-bar-val">₹1.4Cr</span>
                </div>
                <div className="hbc-bar-row">
                  <span className="hbc-bar-label">Resources</span>
                  <div className="hbc-bar-track">
                    <div className="hbc-bar-fill lime" style={{ width: "32%" }} />
                  </div>
                  <span className="hbc-bar-val">₹0.8Cr</span>
                </div>
                <div className="hbc-bar-row">
                  <span className="hbc-bar-label">Vendor SLA</span>
                  <div className="hbc-bar-track">
                    <div className="hbc-bar-fill sky" style={{ width: "24%" }} />
                  </div>
                  <span className="hbc-bar-val">₹0.6Cr</span>
                </div>
              </div>
            </div>
          </div>

          {/* Badge 3 — AI Copilot */}
          <div className="hbc-float hbc-f3">
            <div className="hbc-card hbc-card-code">
              <div className="hbc-card-header">
                <div className="hbc-card-header-left">
                  <span className="hbc-status-dot violet" />
                  <span className="hbc-eyebrow violet">AI Query Complete</span>
                </div>
                <span className="hbc-time">2.4s</span>
              </div>
              <div className="hbc-query-text">
                "Which vendors overbilled this quarter?"
              </div>
              <div className="hbc-query-result">
                <span className="hbc-arrow">→</span>
                7 vendors · ₹18.6L total discrepancy
              </div>
              <div className="hbc-query-detail">
                Highest: TechSource ₹6.2L · Infosys ₹4.8L · AWS ₹3.1L
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ══ Impact Stats ══════════════════════════════════ */}
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

      {/* ══ Features ══════════════════════════════════════ */}
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

      {/* ══ Workflow ══════════════════════════════════════ */}
      <section className="home-section" style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
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

      {/* ══ CTA ═══════════════════════════════════════════ */}
      <section className="home-cta-section">
        <div className="home-cta-aurora" />
        <h2 className="home-cta-h2">
          Ready to command<br />every rupee?
        </h2>
        <p className="home-cta-desc">
          Bootstrap the enterprise demo dataset — fully seeded with realistic
          procurement, SLA, vendor, and resource data — and explore every module instantly.
        </p>
        <button
          className="btn btn-green btn-hero"
          onClick={onSeed}
          disabled={seeding}
        >
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
