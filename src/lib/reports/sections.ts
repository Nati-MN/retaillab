import { monthLabelLong, type MonthKey } from "@/lib/period";

/** Report section keys in canonical document order. Stored in Report.sections. */
export const REPORT_SECTIONS = [
  { key: "summary", title: "Executive Summary", description: "Period revenue, change vs previous period and year, best and worst growth, anomalies, running experiments.", default: true },
  { key: "revenue", title: "Revenue Performance", description: "Revenue per store with changes and a trend chart.", default: true },
  { key: "comparison", title: "Store Comparison", description: "Efficiency KPIs per store side by side.", default: true },
  { key: "customers", title: "Customer Metrics", description: "Customers, transactions and basket per store.", default: true },
  { key: "costs", title: "Cost Analysis", description: "Cost lines and their share of revenue.", default: true },
  { key: "location", title: "Location Signals", description: "Stored competitors and surroundings per store, with sources.", default: true },
  { key: "experiments-active", title: "Active Experiments", description: "Running and planned experiments.", default: true },
  { key: "experiments-completed", title: "Completed Experiments", description: "Results, decisions and limitations of ended experiments.", default: true },
  { key: "opportunities", title: "Potential Opportunities", description: "Opportunity board entries — hypotheses with their scenario text.", default: true },
  { key: "risks", title: "Risks", description: "Anomalies in the period and sourced risk findings.", default: true },
  { key: "tests", title: "Recommended Tests", description: "Hypotheses that could be tested next. No outcome is promised.", default: true },
  { key: "sources", title: "Sources", description: "Numbered list of every source cited in the report.", default: true },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];

export const SECTION_KEYS: readonly ReportSectionKey[] = REPORT_SECTIONS.map((s) => s.key);
export const DEFAULT_SECTIONS: ReportSectionKey[] = REPORT_SECTIONS.filter((s) => s.default).map((s) => s.key);

export function isSectionKey(v: unknown): v is ReportSectionKey {
  return typeof v === "string" && (SECTION_KEYS as readonly string[]).includes(v);
}

/** Drops unknown keys and duplicates and puts the rest in canonical order. */
export function normalizeSections(keys: readonly unknown[]): ReportSectionKey[] {
  const wanted = new Set(keys.filter(isSectionKey));
  return SECTION_KEYS.filter((k) => wanted.has(k));
}

export function sectionTitle(key: ReportSectionKey): string {
  return REPORT_SECTIONS.find((s) => s.key === key)!.title;
}

export function defaultReportTitle(to: MonthKey): string {
  return `Monthly Store Performance Report — ${monthLabelLong(to)}`;
}
