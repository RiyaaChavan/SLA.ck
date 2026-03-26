import type { InvestigationResult } from "../types/api";
import { InvestigatePage } from "./InvestigatePage";

type CopilotPageProps = {
  organizationId?: number;
  onSubmit: (question: string) => Promise<InvestigationResult>;
};

export function CopilotPage({ onSubmit }: CopilotPageProps) {
  return <InvestigatePage onSubmit={onSubmit} />;
}
