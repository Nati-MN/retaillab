import { Chip } from "@/components/ui";
import {
  DECISION_LABELS, STATUS_LABELS, type ExperimentDecisionKey, type ExperimentStatusKey,
} from "@/lib/experiments/model";

const STATUS_TONE = { PLANNED: "neutral", RUNNING: "info", COMPLETED: "pos", STOPPED: "neg" } as const;

export function StatusChip({ status }: { status: ExperimentStatusKey }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>;
}

const DECISION_TONE = { ADOPT: "pos", REPEAT: "info", MODIFY: "info", REJECT: "neg", INCONCLUSIVE: "neutral" } as const;

export function DecisionChip({ decision }: { decision: ExperimentDecisionKey | null }) {
  if (!decision) return <span className="text-ink-3">No decision yet</span>;
  return <Chip tone={DECISION_TONE[decision]}>{DECISION_LABELS[decision]}</Chip>;
}

export function NoControlChip() {
  return (
    <Chip tone="warn" className="whitespace-nowrap">
      <span title="Without a control store the result cannot be separated from the store's own trend.">No control</span>
    </Chip>
  );
}

/** Strategy status worded so that an adopted idea is never called proven. */
export function strategyStatusLabel(status: string): string {
  switch (status) {
    case "VALIDATED": return "Adopted after experiment";
    case "REJECTED": return "Rejected after experiment";
    case "TESTING": return "In test";
    case "SIMULATED": return "Simulated";
    default: return "Hypothesis";
  }
}
