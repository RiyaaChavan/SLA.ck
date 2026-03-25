import type { PropsWithChildren, ReactNode } from "react";

type SectionCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  flush?: boolean;
}>;

export function SectionCard({ title, subtitle, action, flush, children }: SectionCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle ? <div className="card-subtitle">{subtitle}</div> : null}
        </div>
        {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
      </div>
      <div className={flush ? "card-body-flush" : "card-body"}>{children}</div>
    </div>
  );
}
