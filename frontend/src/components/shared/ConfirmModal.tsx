import type { ReactNode } from "react";

export type ConfirmVariant = "danger" | "warning" | "primary";

export type ConfirmConfig = {
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  icon?: ReactNode;
};

type ConfirmModalProps = ConfirmConfig & {
  onConfirm: () => void;
  onCancel: () => void;
};

const VARIANT_STYLES: Record<ConfirmVariant, { icon: string; badge: string; btn: string; glow: string }> = {
  danger: {
    icon: "rgba(239,68,68,0.1)",
    badge: "rgba(239,68,68,0.08)",
    btn: "background: rgba(239,68,68,0.15); color: #F87171; border: 1px solid rgba(239,68,68,0.3);",
    glow: "rgba(239,68,68,0.12)",
  },
  warning: {
    icon: "rgba(245,158,11,0.1)",
    badge: "rgba(245,158,11,0.08)",
    btn: "background: rgba(245,158,11,0.15); color: #FBB424; border: 1px solid rgba(245,158,11,0.3);",
    glow: "rgba(245,158,11,0.1)",
  },
  primary: {
    icon: "rgba(36,119,208,0.1)",
    badge: "rgba(36,119,208,0.08)",
    btn: "background: rgba(36,119,208,0.15); color: #7DB8E8; border: 1px solid rgba(36,119,208,0.3);",
    glow: "rgba(36,119,208,0.12)",
  },
};

const DEFAULT_ICONS: Record<ConfirmVariant, ReactNode> = {
  danger: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  warning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  primary: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
};

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <div
      className="bs-modal-backdrop"
      role="presentation"
      onClick={onCancel}
      style={{
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        background: "rgba(0,0,0,0.55)",
        animation: "modal-fade-in 0.18s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(10,16,30,0.92)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          padding: "28px 28px 24px",
          width: "min(440px, 92vw)",
          boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 -1px 0 ${v.glow} inset`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          animation: "modal-slide-up 0.22s cubic-bezier(0.22,1,0.36,1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top gradient shimmer line */}
        <div
          style={{
            position: "absolute",
            top: 0, left: "8%", right: "8%",
            height: 1,
            background: variant === "danger"
              ? "linear-gradient(90deg, transparent, rgba(239,68,68,0.5) 40%, rgba(239,68,68,0.7) 60%, transparent)"
              : variant === "warning"
              ? "linear-gradient(90deg, transparent, rgba(245,158,11,0.5) 40%, rgba(245,158,11,0.7) 60%, transparent)"
              : "linear-gradient(90deg, transparent, rgba(36,119,208,0.6) 40%, rgba(76,195,167,0.6) 60%, transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: v.icon,
              color: variant === "danger" ? "#F87171" : variant === "warning" ? "#FBB424" : "#7DB8E8",
              border: `1px solid ${variant === "danger" ? "rgba(239,68,68,0.2)" : variant === "warning" ? "rgba(245,158,11,0.2)" : "rgba(36,119,208,0.2)"}`,
            }}
          >
            {icon ?? DEFAULT_ICONS[variant]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="confirm-modal-title"
              style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 6, letterSpacing: "-0.01em" }}
            >
              {title}
            </h2>
            <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
              {message}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            style={{ minWidth: 80, padding: "8px 16px", fontSize: 13 }}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onConfirm}
            style={{
              minWidth: 90, padding: "8px 16px", fontSize: 13, fontWeight: 600,
              // Inline variant style since we can't use dynamic className cleanly
              ...(variant === "danger"
                ? { background: "rgba(239,68,68,0.15)", color: "#F87171", border: "1px solid rgba(239,68,68,0.3)" }
                : variant === "warning"
                ? { background: "rgba(245,158,11,0.15)", color: "#FBB424", border: "1px solid rgba(245,158,11,0.3)" }
                : { background: "rgba(36,119,208,0.15)", color: "#7DB8E8", border: "1px solid rgba(36,119,208,0.3)" }),
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
