import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

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

function IconEye(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
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

function IconSparkles(): ReactNode {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
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
    iconColor: "text-rose-400",
    shadowColor: "group-hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]",
    icon: <IconEye />,
    title: "ProcureWatch",
    desc: "Invoice anomalies → money-at-risk.",
  },
  {
    iconColor: "text-sky-400",
    shadowColor: "group-hover:shadow-[0_0_20px_rgba(56,189,248,0.3)]",
    icon: <IconShield />,
    title: "SLA Sentinel",
    desc: "Breach prediction → auto-escalation.",
  },
  {
    iconColor: "text-emerald-400",
    shadowColor: "group-hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]",
    icon: <IconSparkles />,
    title: "Copilot",
    desc: "Plain-English investigations, SQL-backed.",
  },
  {
    iconColor: "text-indigo-400",
    shadowColor: "group-hover:shadow-[0_0_20px_rgba(129,140,248,0.3)]",
    icon: <IconAudit />,
    title: "Audit trail",
    desc: "Every action logged for compliance.",
  },
];

/* ── Step icons ───────────────────────────────────────────── */
function StepIconDB() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>;
}
function StepIconSearch() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function StepIconCalc() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="10" y2="14" /><line x1="14" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="16" y2="18" /></svg>;
}
function StepIconBulb() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.714V17h8v-2.286A7 7 0 0 0 12 2z" /></svg>;
}
function StepIconLock() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>;
}
function StepIconCheck() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" /></svg>;
}

const stepIcons = [<StepIconDB />, <StepIconSearch />, <StepIconCalc />, <StepIconBulb />, <StepIconLock />, <StepIconCheck />];

const steps = [
  {
    label: "Connect data",
    desc: "Link databases, data lakes, CSV exports, or upload PDFs and contracts. The schema agent infers table relationships, column semantics, and freshness windows — giving downstream detectors a semantic map of your warehouse, not just raw columns.",
  },
  {
    label: "Detect issues",
    desc: "ProcureWatch and SLA Sentinel run editable SQL-rule detectors continuously — duplicate invoices, vendor rate drift, dispatch-bay saturation, cold-chain SLA risk. Users can prompt new detectors in plain English, review the generated logic, and save to the shared library.",
  },
  {
    label: "Estimate impact",
    desc: "Every case carries a formula-backed cost estimate: SLA penalty = likely breaches × penalty per breach, invoice leakage = billed − contracted amount, overload loss = predicted missed items × financial consequence. Assumptions and confidence are always shown.",
  },
  {
    label: "Suggest action",
    desc: "The platform attaches an evidence pack — source records, root-cause summary, money at risk, and the proposed next step (hold invoice, reroute tickets, escalate, request vendor credit note). Actions are tied to the case, not generated in a vacuum.",
  },
  {
    label: "Get approval",
    desc: "Three risk tiers gate execution: low-risk actions auto-run (notify, escalate), medium-risk need one-click approval (reroute batches, shift load), high-risk always require explicit sign-off (hold funds, initiate vendor dispute). Scoped auto-mode lets approvers authorize repeated actions within a defined scope and time window.",
  },
  {
    label: "Track outcome",
    desc: "Execution state flows from proposed → pending → approved → executed → closed. A full audit timeline logs every status change, who acted, and when — closing the loop from signal to result with enterprise-grade compliance coverage.",
  },
];

/* ── Component ────────────────────────────────────────────── */
export function HomePage({ onSeed, seeding, hasData }: HomePageProps) {
  const navigate = useNavigate();
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ["start center", "end center"]
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

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
            <motion.div 
              animate={{ y: [0, -10, 0] }} 
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="home-console shadow-2xl shadow-blue-500/10 border border-white/5"
            >
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
            </motion.div>

            {/* 3D Newspaper */}
            <motion.div 
              animate={{ y: [0, 10, 0], rotate: [0, 1, 0] }} 
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut", delay: 1 }}
              className="home-newspaper-wrap z-20"
            >
              <div className="home-newspaper shadow-2xl shadow-red-500/10 border border-white/5 bg-[#0C1528]/90 backdrop-blur">
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
            </motion.div>

          </div>{/* /home-hero-previews */}

        </div>
      </section>

      {/* ══ Impact Stats ════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/5 border-y border-white/5 bg-[#03060E] mt-12 max-w-[1600px] mx-auto w-full">
        <div className="flex flex-col p-8 md:p-12 lg:px-16">
          <div className="text-4xl md:text-5xl font-bold tracking-tight mb-4 flex items-baseline">
            <span className="text-white/40 font-semibold mr-1">15</span>
            <span className="text-white">–20%</span>
          </div>
          <p className="text-[#8A8A9A] text-sm leading-relaxed max-w-[240px]">
            of enterprise spend lost to silent leakage annually
          </p>
        </div>
        
        <div className="flex flex-col p-8 md:p-12 lg:px-16">
          <div className="text-4xl md:text-5xl font-bold tracking-tight mb-4 flex items-baseline">
            <span className="text-white/40 font-semibold mr-2">4</span>
            <span className="text-white">pillars</span>
          </div>
          <p className="text-[#8A8A9A] text-sm leading-relaxed max-w-[240px]">
            Procurement · SLA · Vendor · Resources — all unified
          </p>
        </div>
        
        <div className="flex flex-col p-8 md:p-12 lg:px-16">
          <div className="text-4xl md:text-5xl font-bold tracking-tight text-white/70 mb-4">
            &lt;5s
          </div>
          <p className="text-[#8A8A9A] text-sm leading-relaxed max-w-[240px]">
            Time from natural language question to SQL-backed answer
          </p>
        </div>
        
        <div className="flex flex-col p-8 md:p-12 lg:px-16">
          <div className="text-4xl md:text-5xl font-bold tracking-tight text-white/70 mb-4">
            100%
          </div>
          <p className="text-[#8A8A9A] text-sm leading-relaxed max-w-[240px]">
            Audit coverage — every action logged for compliance
          </p>
        </div>
      </div>

      {/* ══ Agentic Features ════════════════════════════════ */}
      <section className="max-w-[1250px] mx-auto w-full px-8 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
        
        {/* Left text & list — compact to match SVG height */}
        <div className="flex flex-col">
          <div className="text-[#4CC3A7] font-mono text-[11px] uppercase tracking-widest font-bold mb-4">
            UNIFIED PLATFORM
          </div>
          <h2 className="text-3xl md:text-[40px] font-bold text-white mb-5 leading-[1.1] tracking-tight">
            One surface for<br />every operational signal
          </h2>

          <div className="flex flex-col gap-5">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3 items-center group">
                <div className={`w-8 h-8 rounded-full bg-[#101E35] border border-white/5 flex items-center justify-center flex-shrink-0 ${f.iconColor} ${f.shadowColor} transition-all duration-300`}>
                  <div className="scale-90">{f.icon}</div>
                </div>
                <h3 className="text-white font-semibold text-[14px] tracking-tight">{f.title}</h3>
                <span className="text-[#8A8A9A] text-[13px] hidden sm:inline">— {f.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right contextual visual panel */}
        <div className="relative w-full h-[400px] max-w-[580px] rounded-xl bg-[#080D1A] border border-white/5 shadow-2xl overflow-hidden flex flex-col p-6 mx-auto xl:ml-auto">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTIwIDAgTTAgMjAgTDAgMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==')] opacity-[0.1]" />
          
          <div className="relative w-full h-full flex flex-col pt-2">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 z-20">
               <div className="flex items-center gap-2 text-white/90 text-sm font-bold tracking-wide">
                 <IconShield />
                 SENTRY PIPELINE
               </div>
               <div className="flex gap-2 items-center bg-[#101E35] border border-white/5 px-3 py-1.5 rounded-full">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                 <span className="text-[10px] font-mono text-white/70">LIVE INGESTION</span>
               </div>
            </div>

            {/* Simulated live feed rows */}
            <div className="flex flex-col gap-3 flex-1 overflow-hidden relative">
              <div className="absolute top-0 w-full h-6 bg-gradient-to-b from-[#0A0F1C] to-transparent z-10 pointer-events-none" />
              <div className="absolute bottom-0 w-full h-24 bg-gradient-to-t from-[#0A0F1C] to-transparent z-10 pointer-events-none" />
              
              <motion.div initial={{ y: 20, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} viewport={{ once: true }} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg p-3 w-[90%] self-end">
                <div className="flex flex-col">
                   <div className="text-white/80 text-xs font-mono mb-1">Invoice_VX_9901</div>
                   <div className="text-emerald-400 text-[10px] flex items-center gap-1">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                     Clean · No match found in history
                   </div>
                </div>
              </motion.div>
              
              <motion.div initial={{ x: 20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} transition={{ delay: 0.8 }} viewport={{ once: true }} className="flex items-center justify-between bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 w-full shadow-[0_0_20px_rgba(239,68,68,0.1)] relative z-20 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
                <div className="flex flex-col ml-3 flex-1">
                   <div className="text-white font-bold text-sm">Duplicate Payment Detected</div>
                   <div className="text-rose-200/60 text-[11px] mt-1 pr-2">Vendor TechSource matched against Inv_9012 for ₹4.8L</div>
                </div>
                <div className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider flex-shrink-0">
                  High Risk
                </div>
              </motion.div>

              <motion.div initial={{ y: -20, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} transition={{ delay: 1.4 }} viewport={{ once: true }} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg p-3 w-[85%] self-start opacity-70">
                <div className="flex flex-col">
                   <div className="text-white/80 text-xs font-mono mb-1 flex items-center gap-2">
                     <IconSpinner /> SLA_Report_Q3
                   </div>
                   <div className="text-white/40 text-[10px]">Processing 44 operational metrics...</div>
                </div>
              </motion.div>
            </div>
            
            {/* Action Bar floating block */}
            <motion.div initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} transition={{ delay: 2.2 }} viewport={{ once: true }} className="absolute bottom-6 left-6 right-6 bg-[#121A33]/90 border border-sky-500/30 shadow-[0_10px_40px_rgba(36,119,208,0.2)] p-3 rounded-xl flex items-center gap-3 z-30 backdrop-blur-md">
               <div className="w-10 h-10 rounded-full bg-[#0A0F1C] border border-white/5 flex items-center justify-center text-sky-400">
                 <IconAudit />
               </div>
               <div className="flex flex-col flex-1">
                 <div className="text-white text-[13px] font-bold mb-1.5 flex justify-between">
                   <span>Approval Context Generated</span>
                   <span className="text-sky-400">100%</span>
                 </div>
                 <div className="h-1.5 w-full bg-[#0A0F1C] rounded-full overflow-hidden border border-white/5 shadow-inner">
                   <motion.div animate={{ width: ["0%", "100%"] }} transition={{ duration: 3, ease: "easeOut" }} className="h-full bg-gradient-to-r from-sky-500 to-emerald-400" />
                 </div>
               </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ Workflow (Roadmap) ════════════════════════════════ */}
      <section className="py-24 md:py-36 relative z-10 bg-[#03060E] border-y border-white/5">
        <div className="max-w-[1150px] mx-auto px-8 w-full flex flex-col items-center">
          <div className="text-center mb-24">
            <div className="text-[#3283D0] font-mono text-[11px] uppercase tracking-widest font-bold mb-4">How it works</div>
            <h2 className="text-3xl md:text-[42px] font-bold text-white mb-5 tracking-tight">
              The Resolution Lifecycle
            </h2>
            <p className="text-[#8A8A9A] text-[15px] max-w-[500px] mx-auto leading-relaxed">
              Follow the journey from raw data ingestion to final execution. Every step is logged, verifiable, and approval-aware.
            </p>
          </div>

          <div ref={timelineRef} className="relative w-full max-w-4xl mx-auto pl-10 md:pl-0">
            {/* Background Line */}
            <div className="absolute left-[39px] md:left-1/2 md:-ml-[1px] top-4 bottom-4 w-[2px] bg-white/5 rounded-full" />
            
            {/* Animated Fill Line */}
            <motion.div 
              className="absolute left-[39px] md:left-1/2 md:-ml-[1px] top-4 w-[2px] bg-gradient-to-b from-[#3283D0] to-[#4CC3A7] rounded-full z-0"
              style={{ height: lineHeight }}
            />

            {steps.map((step, i) => {
              const isEven = i % 2 === 0;
              return (
                <div key={step.label} className={`relative flex items-center justify-between mb-20 last:mb-0 w-full ${isEven ? "md:flex-row-reverse" : "md:flex-row"}`}>
                  
                  {/* Empty space for alternating layout on desktop */}
                  <div className="hidden md:block w-[45%]" />
                  
                  {/* Central Node Indicator */}
                  <motion.div 
                    initial={{ backgroundColor: "#0A0F1C", borderColor: "rgba(255,255,255,0.1)", color: "#8A8A9A" }}
                    whileInView={{ backgroundColor: "#121A33", borderColor: "#3283D0", color: "#3283D0", boxShadow: "0 0 20px rgba(50,131,208,0.4)" }}
                    viewport={{ margin: "-50% 0px -50% 0px" }}
                    transition={{ duration: 0.4 }}
                    className="absolute left-[-17px] md:left-1/2 md:-ml-[17px] w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 font-mono text-[11px] font-bold"
                  >
                    {i + 1}
                  </motion.div>

                  {/* Content Card */}
                  <motion.div 
                    initial={{ opacity: 0.3, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ margin: "-20% 0px -20% 0px" }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="w-full md:w-[45%] pl-8 md:pl-0 text-left"
                  >
                    <div className="bg-[#0A0F1C] border border-white/5 p-7 rounded-2xl hover:bg-[#10192A] hover:border-[#3283D0]/30 transition-all duration-300 group shadow-xl">
                      <h3 className="text-white font-bold text-lg mb-2 flex items-center gap-3">
                        <span className="md:hidden text-[#3283D0] font-mono text-xs">{i + 1}</span>
                        <span className="w-8 h-8 rounded-lg bg-[#101E35] border border-white/5 flex items-center justify-center text-[#3283D0] flex-shrink-0 group-hover:border-[#3283D0]/30 group-hover:shadow-[0_0_12px_rgba(50,131,208,0.25)] transition-all duration-300">
                          {stepIcons[i]}
                        </span>
                        {step.label}
                      </h3>
                      <p className="text-[#8A8A9A] text-[14.5px] leading-relaxed group-hover:text-white/70 transition-colors">
                        {step.desc}
                      </p>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
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
