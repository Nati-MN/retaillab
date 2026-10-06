/**
 * Privacy filter for AI context. Pure.
 *
 * An AIProvider never sees raw tool output — only what passes this filter,
 * governed by the organization's settings:
 *  - aiIncludeFinancials = false → monetary values and margin figures are withheld
 *    (structured fields and amounts inside sentences).
 *  - aiIncludeStoreNames = false → store names are replaced by store codes; cities are withheld.
 *  - aiIncludeResearch   = false → stored research (competitors, signals, findings, sources) is dropped.
 *
 * No AIProvider is connected in this build, so nothing is sent anywhere; the
 * filter is exercised by tests and by the preview in Settings → Privacy & AI.
 */

export interface AIPrivacySettings {
  aiIncludeFinancials: boolean;
  aiIncludeStoreNames: boolean;
  aiIncludeResearch: boolean;
}

export const WITHHELD = "[withheld]";
export const RESEARCH_WITHHELD = "[withheld: public research is excluded from AI context]";

/** Field names that carry money or margin. Matched by key, at any depth. */
const FINANCIAL_KEYS = new Set([
  "revenue", "monthlyRevenue", "averageBasket", "revenuePerCustomer", "revenuePerSqm", "revenuePerEmployee",
  "grossMarginPct", "grossProfit", "operatingCosts", "operatingProfit", "costRatioPct", "costs", "amount",
  "currentRevenue", "previousRevenue", "scenarioRevenue", "revenueDifference", "revenueChange", "revenueChangePct",
  "previousBasket", "currentBasket", "basketChange", "newBasket", "monthlyDifference", "annualizedDifference",
  "transactionsEffect", "basketEffect", "interactionEffect", "trafficEffect",
  "currentGrossProfit", "scenarioGrossProfit", "grossProfitDifference", "marginEffect",
  "cost", "estimatedCost", "costAssumption",
]);

const RESEARCH_KEYS = new Set(["research", "competitors", "signals", "findings", "sources"]);

/** "€ 487,240", "CHF 1,200.50", "−$ 12k", "1,200 EUR" … */
const MONEY_IN_TEXT = /[−+-]?(?:€|\$|£|CHF|EUR|USD|GBP)[\s  ]?[−-]?\d[\d.,]*(?:\s?[kM]\b)?|\d[\d.,]*[\s  ]?(?:€|EUR|CHF|USD|GBP)\b/g;

export interface FilterReport {
  financialFieldsWithheld: number;
  amountsInTextWithheld: number;
  storeNamesReplaced: number;
  researchDropped: boolean;
}

export interface FilterOutput<T = unknown> {
  value: T;
  report: FilterReport;
}

function collectStores(v: unknown, out: Map<string, string>): void {
  if (Array.isArray(v)) {
    for (const x of v) collectStores(x, out);
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.storeName === "string" && typeof o.storeCode === "string" && o.storeName) out.set(o.storeName, o.storeCode);
    for (const x of Object.values(o)) collectStores(x, out);
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Returns a deep copy of `toolResult` with everything the settings exclude removed.
 * `knownStores` adds name → code pairs that do not appear as { storeName, storeCode } inside the result.
 */
export function filterForAI<T>(
  toolResult: T,
  settings: AIPrivacySettings,
  knownStores: readonly { name: string; code: string }[] = [],
): FilterOutput {
  const report: FilterReport = { financialFieldsWithheld: 0, amountsInTextWithheld: 0, storeNamesReplaced: 0, researchDropped: false };
  const names = new Map<string, string>(knownStores.map((s) => [s.name, s.code]));
  collectStores(toolResult, names);
  const nameList = [...names.entries()].filter(([n]) => n.length > 0).sort((a, b) => b[0].length - a[0].length);

  const filterString = (s: string): string => {
    let out = s;
    if (!settings.aiIncludeStoreNames) {
      for (const [name, code] of nameList) {
        const re = new RegExp(escapeRe(name), "g");
        out = out.replace(re, () => {
          report.storeNamesReplaced += 1;
          return code;
        });
      }
    }
    if (!settings.aiIncludeFinancials) {
      out = out.replace(MONEY_IN_TEXT, () => {
        report.amountsInTextWithheld += 1;
        return WITHHELD;
      });
    }
    return out;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return filterString(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      // An anomaly row marks its own `value` as monetary.
      const valueIsMoney = o.monetary === true;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        if (!settings.aiIncludeResearch && RESEARCH_KEYS.has(k)) {
          report.researchDropped = true;
          out[k] = RESEARCH_WITHHELD;
          continue;
        }
        if (!settings.aiIncludeFinancials && (FINANCIAL_KEYS.has(k) || (k === "value" && valueIsMoney))) {
          if (x !== null && x !== undefined) report.financialFieldsWithheld += 1;
          out[k] = x === null || x === undefined ? x : WITHHELD;
          continue;
        }
        if (!settings.aiIncludeStoreNames && k === "storeName" && typeof x === "string") {
          report.storeNamesReplaced += 1;
          out[k] = typeof o.storeCode === "string" ? o.storeCode : WITHHELD;
          continue;
        }
        if (!settings.aiIncludeStoreNames && (k === "city" || k === "address") && typeof x === "string") {
          out[k] = WITHHELD;
          continue;
        }
        out[k] = walk(x);
      }
      return out;
    }
    return v;
  };

  return { value: walk(toolResult), report };
}
