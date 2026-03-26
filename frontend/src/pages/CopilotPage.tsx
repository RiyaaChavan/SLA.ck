import type { InvestigationResult } from "../types/api";
import { InvestigatePage } from "./InvestigatePage";
import { StateBlock } from "../components/business-sentry/StateBlock";

type CopilotPageProps = {
  organizationId?: number;
  onSubmit: (question: string) => Promise<InvestigationResult>;
};

export function CopilotPage({ organizationId, onSubmit }: CopilotPageProps) {
  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" description="Copilot runs against the selected organization." />
      </div>
    );
  }
  return <InvestigatePage onSubmit={onSubmit} />;
}
