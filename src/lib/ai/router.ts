import { findStoreMentions, type StoreMention } from "./stores";
import type { Plan, PlannedCall, StoreLite } from "./types";

/**
 * Deterministic intent router. Maps a question to a plan of tool calls with
 * extracted parameters. No model, no randomness: the same question and the
 * same store list always give the same plan. When nothing matches, the plan's
 * intent is "none" and the analyst says so instead of improvising.
 */

export interface RouteContext {
  /** Current pathname. `/stores/<id>` makes that store the default subject ("this store"). */
  pathname?: string | null;
  stores: readonly StoreLite[];
}

// ── Parameter extraction ─────────────────────────────────────────────────────

const NUM = "(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const NEGATIVE_WORDS = /\b(decreas\w*|drops?|dropped|falls?|fell|lower\w*|reduc\w*|declin\w*|shrinks?|shrank|less|fewer|minus|down|cut|loses?|lost)\b/;

/** "0,50" → 0.5 · "1.250,75" → 1250.75 · "1,250.75" → 1250.75 */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim();
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // A single comma followed by exactly three digits is a thousands separator ("1,250"); otherwise a decimal comma.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s) && !/^0\./.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface MoneyAmount {
  /** Value in currency units, signed only when the text carries an explicit sign. */
  value: number;
  explicitSign: boolean;
  raw: string;
}

/** Finds a currency amount: "€0.50", "0,50 €", "0.5 EUR", "50 cents", "+€1". Percentages are not amounts. */
export function parseMoneyAmount(text: string): MoneyAmount | null {
  const t = text.toLowerCase().replace(/[−–]/g, "-");
  const patterns: { re: RegExp; scale: number }[] = [
    { re: new RegExp(`([+-])?\\s*(?:€|eur\\b|euros?\\b|\\$|£|chf\\b|usd\\b)\\s*([+-])?\\s*${NUM}(?!\\s*(?:%|percent))`), scale: 1 },
    { re: new RegExp(`([+-])?\\s*()${NUM}\\s*(?:€|euros?\\b|eur\\b|chf\\b|usd\\b|dollars?\\b|\\$|£)`), scale: 1 },
    { re: new RegExp(`([+-])?\\s*()${NUM}\\s*(?:euro\\s*)?(?:cents?|ct)\\b`), scale: 0.01 },
  ];
  for (const { re, scale } of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const n = parseDecimal(m[3]!);
    if (n === null) continue;
    const sign = m[1] || m[2] || "";
    return { value: (sign === "-" ? -n : n) * scale, explicitSign: sign !== "", raw: m[0].trim() };
  }
  return null;
}

export interface Percentage {
  value: number;
  explicitSign: boolean;
  index: number;
}

export function parsePercentages(text: string): Percentage[] {
  const t = text.toLowerCase().replace(/[−–]/g, "-");
  const re = new RegExp(`([+-])?\\s*${NUM}\\s*(?:%|percent\\b|pct\\b|prozent\\b)`, "g");
  const out: Percentage[] = [];
  for (const m of t.matchAll(re)) {
    const n = parseDecimal(m[2]!);
    if (n === null) continue;
    out.push({ value: m[1] === "-" ? -n : n, explicitSign: !!m[1], index: m.index ?? 0 });
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, nine: 9, twelve: 12, eighteen: 18 };

/**
 * Period as a tool parameter: "<n>m" (the latest n months that have data) or "ytd".
 * RetailLab stores monthly figures, so "this month" and "last month" both mean
 * the latest month on record; the answer states the resolved window.
 */
export function parsePeriod(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(ytd|year[- ]to[- ]date|this year|since january)\b/.test(t)) return "ytd";
  const m = /\b(\d{1,2}|one|two|three|four|five|six|nine|twelve|eighteen)[- ]?(months?|mo\b|m\b)/.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!]!;
    if (n >= 1 && n <= 24) return `${n}m`;
  }
  if (/\b(this|last|latest|current|past|previous) month\b|\b30 days\b|\bmonthly\b/.test(t)) return "1m";
  if (/\b(quarter|90 days)\b/.test(t)) return "3m";
  if (/\bhalf[- ]?(a )?year\b/.test(t)) return "6m";
  if (/\b(last|past|previous) (year|12)\b|\b(12 months|annual|yearly|year over year)\b/.test(t)) return "12m";
  return null;
}

const METRIC_WORDS: [RegExp, string][] = [
  [/\b(energy|electricity)\b/, "cost:ENERGY"],
  [/\b(waste|shrink)\b/, "cost:WASTE"],
  [/\b(personnel|staff|labou?r|payroll)\b/, "cost:PERSONNEL"],
  [/\b(margin)\b/, "grossMarginPct"],
  [/\b(basket|ticket)\b/, "averageBasket"],
  [/\b(traffic|customers?|footfall|visitors?)\b/, "customers"],
  [/\b(revenue|sales|turnover)\b/, "revenue"],
];

export function parseMetric(text: string): string | null {
  const t = text.toLowerCase();
  for (const [re, metric] of METRIC_WORDS) if (re.test(t)) return metric;
  return null;
}

export function parseExperimentStatus(text: string): "PLANNED" | "RUNNING" | "COMPLETED" | "STOPPED" | null {
  const t = text.toLowerCase();
  if (/\b(running|active|ongoing|on-going|current|currently|in progress|live|underway)\b/.test(t)) return "RUNNING";
  if (/\b(planned|upcoming|scheduled|next|not started|pipeline)\b/.test(t)) return "PLANNED";
  if (/\b(completed?|finished|done|ended|concluded|results?)\b/.test(t)) return "COMPLETED";
  if (/\b(stopped|cancell?ed|aborted|abandoned)\b/.test(t)) return "STOPPED";
  return null;
}

const TRAFFIC_WORD = /\b(traffic|customers?|footfall|visitors?|transactions?|frequency)\b/;
const BASKET_WORD = /\b(basket|ticket|bon|spend per (visit|customer|transaction))\b/;

/** Assigns each percentage to "traffic" or "basket" by the clause it appears in. */
export function parseScenarioChanges(text: string): { trafficChangePct: number | null; basketChangePct: number | null } {
  const t = text.toLowerCase().replace(/[−–]/g, "-");
  const clauses = t.split(/,|;|&|\band\b|\bwhile\b|\bbut\b|\bplus\b/);
  let traffic: number | null = null;
  let basket: number | null = null;
  const unassigned: number[] = [];
  for (const c of clauses) {
    const p = parsePercentages(c)[0];
    if (!p) continue;
    const v = !p.explicitSign && NEGATIVE_WORDS.test(c) ? -p.value : p.value;
    const iT = c.search(TRAFFIC_WORD);
    const iB = c.search(BASKET_WORD);
    if (iT !== -1 && (iB === -1 || Math.abs(iT - p.index) <= Math.abs(iB - p.index))) traffic ??= v;
    else if (iB !== -1) basket ??= v;
    else unassigned.push(v);
  }
  if (unassigned.length > 0) {
    const mentionsT = TRAFFIC_WORD.test(t);
    const mentionsB = BASKET_WORD.test(t);
    if (mentionsT && !mentionsB) traffic ??= unassigned[0]!;
    else if (mentionsB && !mentionsT) basket ??= unassigned[0]!;
  }
  return { trafficChangePct: traffic, basketChangePct: basket };
}

// ── Intent patterns ──────────────────────────────────────────────────────────

const RE = {
  research: /\b(research|competitors?|competition|competing|rivals?|surroundings?|environment|neighbou?rhood|nearby|catchment|location signals?)\b/,
  experiments: /\b(experiments?|trials?|pilots?|a\/b tests?|tests? (that )?(are|is)? ?(currently )?(running|active|planned))\b/,
  compare: /\b(compare|compared|comparison|versus|vs\.?|against|difference between|differences? between|side by side|benchmark)\b/,
  anomalies: /\b(unusual|anomal\w*|outliers?|strange|unexpected|odd|abnormal|irregular\w*|spikes?|stands? out|out of the ordinary|suspicious|surprising)\b/,
  why: /\b(why|explain|what happened|what caused|reasons?|causes?|what drove|drivers?|what is behind|what's behind|how come)\b/,
  changeWord: /\b(revenue|sales|turnover|declin\w*|decreas\w*|drop\w*|fall\w*|fell|grow\w*|grew|increas\w*|rise|rose|risen|chang\w*|down|up|lower|higher|weak\w*)\b/,
  declineWord: /\b(declin\w*|decreas\w*|drop\w*|falling|falls?|fell|losing|loses?|lost|shrink\w*|fewer|less|down|lower|weaker|worse)\b/,
  whatIf: /\b(what (happens|if|would)|calculate|compute|simulate|scenario|how much|suppose|assume|assuming|if)\b/,
  increaseWord: /\b(increas\w*|rais\w*|rise\w*|grow\w*|higher|more|up|add\w*|plus|gain\w*|improv\w*|change\w*|lift\w*)\b/,
  kpi: /\b(kpis?|how is|how are|how did|how does|performance|performing|perform|revenue|sales|turnover|basket|margin|profit|customers|traffic|numbers|figures|doing|overview|summary|show|status|scorecard)\b/,
  listStores: /\b(which|what|list|show|all|how many)\b.*\b(stores|shops|locations|branches|outlets)\b/,
};

function currentStore(ctx: RouteContext): StoreLite | null {
  const m = /^\/stores\/([^/?#]+)/.exec(ctx.pathname ?? "");
  if (!m) return null;
  return ctx.stores.find((s) => s.id === m[1]) ?? null;
}

interface Subject {
  stores: StoreLite[];
  notes: string[];
  problems: StoreMention[];
}

function subjectOf(question: string, ctx: RouteContext): Subject {
  const mentions = findStoreMentions(question, ctx.stores);
  const stores: StoreLite[] = [];
  const notes: string[] = [];
  const problems: StoreMention[] = [];
  for (const m of mentions) {
    if (m.status === "resolved") {
      stores.push(m.store);
      if (m.note) notes.push(m.note);
    } else problems.push(m);
  }
  return { stores, notes, problems };
}

function clarifyProblem(p: StoreMention): Plan {
  if (p.status === "ambiguous") {
    return {
      intent: "clarify", calls: [], interpretations: [],
      clarification: `"${p.ref}" matches ${p.candidates.length} stores: ${p.candidates.map((s) => `${s.name} (${s.code})`).join(", ")}. Which one do you mean? Use the store name or code.`,
    };
  }
  return {
    intent: "clarify", calls: [], interpretations: [],
    clarification: p.status === "not_found" ? `${p.reason} Use a store name, code or city.` : "Which store do you mean?",
  };
}

const call = (tool: PlannedCall["tool"], input: Record<string, unknown>): PlannedCall => ({ tool, input });
const MONTHLY_NOTE = `"This month" is read as the latest month that has data — RetailLab stores monthly figures.`;

export function routeQuestion(question: string, ctx: RouteContext): Plan {
  const q = question.trim().toLowerCase().replace(/[−–]/g, "-");
  if (q.length === 0) return { intent: "none", calls: [], interpretations: [] };

  const subject = subjectOf(question, ctx);
  const here = currentStore(ctx);
  const period = parsePeriod(q);
  const periodNotes = /\b(this|current) month\b/.test(q) ? [MONTHLY_NOTE] : [];
  const money = parseMoneyAmount(q);
  const pcts = parsePercentages(q);

  /** Exactly one store: an explicit mention, else the store page the user is on. */
  const oneStore = (): { store: StoreLite | null; notes: string[] } => {
    if (subject.stores[0]) return { store: subject.stores[0], notes: subject.notes.slice(0, 1) };
    if (here) return { store: here, notes: [`No store named in the question — using the store on the current page, ${here.name} (${here.code}).`] };
    return { store: null, notes: [] };
  };

  // 1. Basket change by an absolute amount.
  if (BASKET_WORD.test(q) && money && pcts.length === 0) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const { store, notes } = oneStore();
    const delta = !money.explicitSign && NEGATIVE_WORDS.test(q) ? -money.value : money.value;
    return {
      intent: "basket_change",
      calls: [call("calculate_basket_change", { ...(store ? { store: store.id } : {}), basketDelta: delta })],
      interpretations: [...notes, ...(store ? [] : ["No store named — calculating for all stores together."])],
    };
  }

  // 2. Percentage scenario on traffic and/or basket.
  if (pcts.length > 0 && (TRAFFIC_WORD.test(q) || BASKET_WORD.test(q)) && RE.whatIf.test(q)) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const { trafficChangePct, basketChangePct } = parseScenarioChanges(q);
    if (trafficChangePct !== null || basketChangePct !== null) {
      const { store, notes } = oneStore();
      return {
        intent: "revenue_scenario",
        calls: [call("calculate_revenue_scenario", {
          ...(store ? { store: store.id } : {}),
          trafficChangePct: trafficChangePct ?? 0,
          basketChangePct: basketChangePct ?? 0,
        })],
        interpretations: [...notes, ...(store ? [] : ["No store named — calculating for all stores together."])],
      };
    }
  }

  // A basket what-if without a usable number.
  if (BASKET_WORD.test(q) && RE.whatIf.test(q) && !money && pcts.length === 0 && (RE.increaseWord.test(q) || NEGATIVE_WORDS.test(q))) {
    return { intent: "clarify", calls: [], interpretations: [], clarification: "By how much should the average basket change? Give an amount (for example €0.50) or a percentage (for example 3%)." };
  }

  // 3. Experiments.
  if (RE.experiments.test(q)) {
    const status = parseExperimentStatus(q);
    return { intent: "experiments", calls: [call("list_experiments", status ? { status } : {})], interpretations: [] };
  }

  // 4. Stored research around a store.
  if (RE.research.test(q) && !RE.compare.test(q)) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const { store, notes } = oneStore();
    if (!store) {
      return { intent: "clarify", calls: [], interpretations: [], clarification: "Research is stored per store. Which store do you mean? Use a store name, code or city." };
    }
    return { intent: "research", calls: [call("get_research", { store: store.id })], interpretations: notes };
  }

  // 5. Compare 2–4 stores.
  if (RE.compare.test(q)) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const list = [...subject.stores];
    const notes = [...subject.notes];
    if (list.length === 1 && here && here.id !== list[0]!.id) {
      list.unshift(here);
      notes.push(`Only one store named — comparing it with the store on the current page, ${here.name} (${here.code}).`);
    }
    if (list.length < 2) {
      return { intent: "clarify", calls: [], interpretations: [], clarification: "Name two to four stores to compare — by store name, code or city." };
    }
    if (list.length > 4) notes.push(`A comparison covers at most 4 stores — using the first 4 named (${list.slice(0, 4).map((s) => s.name).join(", ")}).`);
    return {
      intent: "compare",
      calls: [call("compare_stores", { stores: list.slice(0, 4).map((s) => s.id), period: period ?? "12m" })],
      interpretations: [...notes, ...periodNotes],
    };
  }

  // 6. Unusual changes.
  if (RE.anomalies.test(q)) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const store = subject.stores[0] ?? null;
    const metric = parseMetric(q);
    return {
      intent: "anomalies",
      calls: [call("find_anomalies", { period: period ?? "3m", ...(store ? { store: store.id } : {}), ...(metric ? { metric } : {}) })],
      interpretations: [...(store ? subject.notes.slice(0, 1) : []), ...periodNotes],
    };
  }

  // 7. "Why did revenue change?" — decomposition, never a cause.
  if (RE.why.test(q) && RE.changeWord.test(q)) {
    if (subject.problems[0]) return clarifyProblem(subject.problems[0]);
    const { store, notes } = oneStore();
    return {
      intent: "explain_revenue",
      calls: [call("explain_revenue_change", { ...(store ? { store: store.id } : {}), period: period ?? "3m" })],
      interpretations: [...notes, ...(store ? [] : ["No store named — looking at all stores together."]), ...periodNotes],
      ...(RE.declineWord.test(q) ? { presumes: "decline" as const } : /\b(grow\w*|grew|increas\w*|rise|rose|risen|higher|up)\b/.test(q) ? { presumes: "increase" as const } : {}),
    };
  }

  // 8. Stores with declining traffic.
  if (TRAFFIC_WORD.test(q) && RE.declineWord.test(q)) {
    const months = period === "6m" || /\bhalf[- ]?(a )?year\b/.test(q) ? 6 : 3;
    return {
      intent: "declining_traffic",
      calls: [call("find_declining_traffic", { months })],
      interpretations: period && period !== "3m" && period !== "6m" ? [`This check supports 3 or 6 months — using the last ${months} months.`] : [],
    };
  }

  // 9. KPIs of one store.
  if (subject.problems[0] && subject.stores.length === 0) return clarifyProblem(subject.problems[0]);
  if (subject.stores.length > 0 || (here && RE.kpi.test(q) && /\b(this|the|here|current)\b/.test(q))) {
    const { store, notes } = oneStore();
    if (store) {
      return {
        intent: "store_kpis",
        calls: [call("get_store_kpis", { store: store.id, period: period ?? "12m" })],
        interpretations: [...notes, ...periodNotes],
      };
    }
  }

  // 10. Store list.
  if (RE.listStores.test(q)) return { intent: "list_stores", calls: [call("list_stores", {})], interpretations: [] };

  return { intent: "none", calls: [], interpretations: [] };
}

/** The questions the rule-based analyst is known to handle. Shown when nothing matches, and as panel suggestions. */
export const EXAMPLE_QUESTIONS = [
  "Which stores have declining traffic?",
  "Find unusual changes this month.",
  "Calculate what happens if average basket increases by €0.50.",
  "Which experiments are currently running?",
  "Why did Store 4 revenue decline?",
  "Compare Vienna and Graz.",
  "Research competitors around Store 3.",
] as const;

/** The same example questions, adapted to the organization's own stores so that every one of them resolves. */
export function exampleQuestionsFor(stores: readonly StoreLite[]): string[] {
  const n = stores.length;
  const cities = [...new Set(stores.map((s) => s.city).filter(Boolean))];
  const unique = cities.filter((c) => stores.filter((s) => s.city === c).length === 1);
  const pair = unique.length >= 2 ? unique : stores.map((s) => s.name);
  return [
    "Which stores have declining traffic?",
    "Find unusual changes this month.",
    "Calculate what happens if average basket increases by €0.50.",
    "Which experiments are currently running?",
    ...(n >= 1 ? [`Why did Store ${Math.min(4, n)} revenue decline?`] : []),
    ...(pair.length >= 2 ? [`Compare ${pair[pair.length - 1]} and ${pair[0]}.`] : []),
    ...(n >= 1 ? [`Research competitors around Store ${Math.min(3, n)}.`] : []),
  ];
}

export const CAPABILITIES = [
  "Show the KPIs of a store for a period",
  "Compare two to four stores side by side",
  "List stores whose customer traffic is below the same months a year earlier",
  "Flag unusual changes (statistical rule) and list recorded events around them",
  "Split a revenue change into a transactions effect and a basket effect",
  "Calculate a basket or traffic scenario from your latest figures",
  "List experiments by status",
  "Show stored location research for a store, with sources",
] as const;

/** Suggested questions for the current page. `storeName` is the store on /stores/<id>, when known. */
export function suggestionsFor(pathname: string | null | undefined, storeName?: string | null, exampleStores: readonly string[] = []): string[] {
  const p = pathname ?? "";
  const [a, b] = exampleStores;
  const compare = a && b ? `Compare ${a} and ${b}.` : null;
  const pick = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x);
  if (storeName && /^\/stores\/[^/]+/.test(p)) {
    return pick(
      `Why did ${storeName} revenue change?`,
      `Find unusual changes at ${storeName} in the last 6 months.`,
      `What happens if average basket at ${storeName} increases by €0.50?`,
      `Research competitors around ${storeName}.`,
    );
  }
  if (p.startsWith("/compare")) return pick(compare, "Which stores have declining traffic?", "Find unusual changes this month.");
  if (p.startsWith("/analytics")) return pick("Find unusual changes this month.", "Which stores have declining traffic?", "Why did revenue change in the last 3 months?");
  if (p.startsWith("/strategies")) return pick("Calculate what happens if average basket increases by €0.50.", "What if traffic increases by 5% and basket by 2%?", "Which experiments are currently running?");
  if (p.startsWith("/experiments")) return pick("Which experiments are currently running?", "Which experiments are completed?", "Which experiments are planned?");
  if ((p.startsWith("/research") || p.startsWith("/map")) && a) return pick(`Research competitors around ${a}.`, b ? `Research competitors around ${b}.` : null, "Which stores have declining traffic?");
  return pick("Which stores have declining traffic?", "Find unusual changes this month.", compare, "Calculate what happens if average basket increases by €0.50.", "Which experiments are currently running?");
}
