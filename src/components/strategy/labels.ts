import { addMonths, periodLabel, type MonthKey } from "@/lib/period";
import type { ConfidenceKey, OpportunityStatusKey, StrategyStatusKey } from "./loaders";

export const STRATEGY_STATUS_LABELS: Record<StrategyStatusKey, { label: string; short: string; tone: "neutral" | "info" | "warn" | "pos" | "neg" }> = {
  HYPOTHESIS: { label: "Hypothesis — not validated", short: "Hypothesis", tone: "neutral" },
  SIMULATED: { label: "Simulated — scenario calculated, not validated", short: "Simulated", tone: "info" },
  TESTING: { label: "Testing — experiment under way, no result yet", short: "Testing", tone: "warn" },
  VALIDATED: { label: "Validated — marked by a user after an experiment", short: "Validated", tone: "pos" },
  REJECTED: { label: "Rejected — marked by a user", short: "Rejected", tone: "neg" },
};
export const STRATEGY_STATUSES = Object.keys(STRATEGY_STATUS_LABELS) as StrategyStatusKey[];

export const OPPORTUNITY_STATUSES: OpportunityStatusKey[] = ["NEW", "INVESTIGATING", "READY_TO_TEST", "TESTING", "VALIDATED", "REJECTED", "INCONCLUSIVE"];
export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatusKey, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  READY_TO_TEST: "Ready to Test",
  TESTING: "Testing",
  VALIDATED: "Validated",
  REJECTED: "Rejected",
  INCONCLUSIVE: "Inconclusive",
};

export const LEVEL_LABELS: Record<ConfidenceKey, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export const ORIGIN_LABELS = { RULE_ENGINE: "Rule engine", LLM: "Language model", USER: "User" } as const;

export const CONFIDENCE_EXPLAINER =
  "Data confidence measures how complete the underlying data is (months of history, comparable stores, inputs present). It does not measure how likely the hypothesis is to be true.";

/** Which internal data each rule reads, relative to the latest data month. Mirrors src/lib/strategy/rules.ts. */
export function internalSourcesFor(ruleKey: string | null, latest: MonthKey | null): string[] {
  if (!ruleKey) return [];
  if (!latest) return ["Monthly store data (no data month on file)."];
  const last3 = periodLabel({ from: addMonths(latest, -2), to: latest });
  const last6 = periodLabel({ from: addMonths(latest, -5), to: latest });
  const prev6 = periodLabel({ from: addMonths(latest, -17), to: addMonths(latest, -12) });
  const facts3 = `Monthly revenue, transactions, open days and gross margin, ${last3}`;
  const hourly = `Hourly transaction profile, average of ${last6}`;
  switch (ruleKey) {
    case "lunch-gap":
      return [hourly + " (this store and peer stores)", facts3, `Ready-to-eat category margin, ${last3} (store margin is used when not recorded)`];
    case "busy-last-hour":
      return [hourly + " (this store and peer stores)", facts3, "Store closing times"];
    case "basket-below-peers":
      return [facts3 + " (this store and stores of the same type)"];
    case "revenue-decline":
      return [`Monthly revenue and transactions, ${last6} compared with ${prev6}`];
    case "waste-above-peers":
      return [`Waste cost and revenue, ${last3} (this store and peer stores)`];
    case "category-underindex":
      return [`Category revenue and margin, ${last3} (this store and stores of the same type)`, facts3];
    default:
      return [facts3];
  }
}
