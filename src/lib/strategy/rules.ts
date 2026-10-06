import { calculateShare, median, type ScenarioVariantKey } from "@/lib/calc";
import { computeKpis } from "@/lib/analytics/aggregate";
import type { CategoryFact, MonthFact, StoreDTO } from "@/lib/analytics/types";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { addMonths, type MonthKey } from "@/lib/period";

/**
 * Rule-based hypothesis engine.
 *
 * This is deliberately NOT an LLM. Each rule:
 *   1. checks that the data it needs exists (otherwise it stays silent),
 *   2. states an OBSERVATION made only of numbers computed by the calc engine,
 *   3. attaches a HYPOTHESIS written as a possibility, never as an outcome,
 *   4. proposes a test and a three-variant scenario whose derivation is spelled out.
 *
 * An LLM provider may later rewrite the wording, but must not alter numbers.
 */

export type StrategyCategoryKey =
  | "PRICING" | "ASSORTMENT" | "STORE_LAYOUT" | "OPENING_HOURS" | "STAFFING" | "MARKETING"
  | "CUSTOMER_RETENTION" | "CHECKOUT" | "INVENTORY" | "FOOD_WASTE" | "LOCAL_MARKETING"
  | "CONVENIENCE" | "SEASONAL" | "MERCHANDISING";

export type ScenarioKindKey =
  | "OPENING_HOURS" | "BREAK_EVEN" | "REVENUE_OPPORTUNITY" | "TRANSACTION_UPLIFT" | "COST_REDUCTION";

export interface ScenarioDraft {
  kind: ScenarioKindKey;
  name: string;
  /** Plain-language explanation of where the three variants come from. */
  derivation: string;
  variants: Record<ScenarioVariantKey, Record<string, number>>;
}

export interface StrategyDraft {
  ruleKey: string;
  storeId: string;
  libraryKey: string;
  title: string;
  category: StrategyCategoryKey;
  observation: string;
  locationSignal: string | null;
  hypothesis: string;
  whyItMayMatter: string;
  proposedTest: string;
  assumptions: string[];
  risks: string[];
  metricsToWatch: string[];
  costAssumption: number | null;
  dataConfidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceNote: string;
  scenario: ScenarioDraft;
}

export interface RuleSignal {
  storeId: string;
  type: string;
  name: string;
  distanceM: number | null;
  isDemo: boolean;
}

export interface RuleInput {
  stores: StoreDTO[];
  /** All available monthly facts (ideally 24 months). */
  facts: MonthFact[];
  /** Category facts for at least the latest 3 months. */
  categoryFacts: CategoryFact[];
  hourly: { storeId: string; hour: number; transactions: number }[];
  signals: RuleSignal[];
  latestMonth: MonthKey;
  currency: string;
}

const variants = <T extends Record<string, number>>(c: T, b: T, o: T) => ({ CONSERVATIVE: c, BASE: b, OPTIMISTIC: o });

/**
 * Data confidence is a transparent completeness rule, not a quality score:
 *   HIGH   — ≥ 18 months of history AND every input the rule uses is present AND ≥ 4 peer stores
 *   MEDIUM — ≥ 12 months of history AND ≥ 3 peer stores
 *   LOW    — otherwise
 */
function confidence(months: number, peers: number, extra?: string): Pick<StrategyDraft, "dataConfidence" | "confidenceNote"> {
  const level = months >= 18 && peers >= 4 ? "HIGH" : months >= 12 && peers >= 3 ? "MEDIUM" : "LOW";
  return {
    dataConfidence: level,
    confidenceNote:
      `${months} months of store history, ${peers} peer stores with comparable data.` +
      (extra ? ` ${extra}` : "") +
      " Confidence describes how complete the underlying data is — not how likely the hypothesis is to be true.",
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function generateStrategyDrafts(input: RuleInput): StrategyDraft[] {
  const { stores, facts, categoryFacts, hourly, signals, latestMonth, currency } = input;
  const out: StrategyDraft[] = [];
  const last3 = { from: addMonths(latestMonth, -2), to: latestMonth };
  const last6 = { from: addMonths(latestMonth, -5), to: latestMonth };
  const prevYear6 = { from: addMonths(latestMonth, -17), to: addMonths(latestMonth, -12) };
  const within = (m: MonthKey, r: { from: MonthKey; to: MonthKey }) => m >= r.from && m <= r.to;

  const kpi3 = new Map(stores.map((s) => [s.id, computeKpis(facts.filter((f) => f.storeId === s.id && within(f.month, last3)), [s])]));
  const historyMonths = (id: string) => new Set(facts.filter((f) => f.storeId === id).map((f) => f.month)).size;

  // Hourly shares
  const hourlyByStore = new Map<string, Map<number, number>>();
  for (const h of hourly) {
    const m = hourlyByStore.get(h.storeId) ?? new Map<number, number>();
    m.set(h.hour, h.transactions);
    hourlyByStore.set(h.storeId, m);
  }
  const hourTotal = (id: string) => [...(hourlyByStore.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const hourSum = (id: string, hours: number[]) => hours.reduce((a, h) => a + (hourlyByStore.get(id)?.get(h) ?? 0), 0);

  for (const store of stores) {
    const k = kpi3.get(store.id)!;
    const months = historyMonths(store.id);
    if (k.revenue === null) continue;
    const peers = stores.filter((s) => s.id !== store.id);
    const days = k.openDays !== null && k.months > 0 ? k.openDays / k.months : null;

    // ── Rule 1: lunchtime share below peers ──────────────────────────────────
    const total = hourTotal(store.id);
    if (total > 0 && k.averageBasket !== null && k.grossMarginPct !== null && days !== null) {
      const lunchHours = [11, 12, 13];
      const share = (hourSum(store.id, lunchHours) / total) * 100;
      const peerShares = peers.filter((p) => hourTotal(p.id) > 0).map((p) => (hourSum(p.id, lunchHours) / hourTotal(p.id)) * 100);
      const peerMedian = median(peerShares);
      if (peerMedian !== null && peerShares.length >= 2 && share < peerMedian * 0.85) {
        const offices = signals.filter((s) => s.storeId === store.id && s.type === "OFFICE" && (s.distanceM ?? Infinity) <= 1000);
        const gapTx = ((peerMedian - share) / 100) * total; // transactions/day needed to reach peer share
        const rteMargin = (() => {
          const rows = categoryFacts.filter((c) => c.storeId === store.id && c.categoryName === "Ready-to-eat" && within(c.month, last3) && c.marginPct !== null);
          const rev = rows.reduce((a, c) => a + c.revenue, 0);
          return rev > 0 ? rows.reduce((a, c) => a + c.revenue * c.marginPct!, 0) / rev : null;
        })();
        const lunchBasket = r2(k.averageBasket * 0.6);
        const margin = r1(rteMargin ?? k.grossMarginPct);
        const mk = (f: number) => ({
          additionalTransactionsPerDay: Math.max(1, Math.round(gapTx * f)),
          averageBasket: lunchBasket,
          daysPerMonth: Math.round(days),
          grossMarginPct: margin,
          monthlyCost: 0,
          oneOffCost: 2500,
        });
        out.push({
          ruleKey: "lunch-gap",
          storeId: store.id,
          libraryKey: "expand-lunch-assortment",
          title: "Lunch opportunity",
          category: "CONVENIENCE",
          observation:
            `${fmtPct(share)} of ${store.name}'s daily transactions fall between 11:00 and 14:00. ` +
            `The median of ${peerShares.length} peer stores with hourly data is ${fmtPct(peerMedian)}.`,
          locationSignal: offices.length
            ? `${offices.length} office-related point${offices.length > 1 ? "s" : ""} of interest within 1 km in the stored location research` +
              (offices.some((o) => o.isDemo) ? " (demo data)." : ".")
            : null,
          hypothesis: "A stronger ready-to-eat lunch offering could potentially attract more lunchtime customers.",
          whyItMayMatter:
            "Lunch purchases are typically small, frequent and margin-rich. If nearby daytime demand exists and is not being served, it would show up as exactly this kind of midday gap — but a gap can also simply reflect a residential catchment.",
          proposedTest:
            "Expand the lunch assortment (fresh sandwiches, salads, warm items) for six weeks. Compare 11:00–14:00 transactions against the six weeks before and against a control store.",
          assumptions: [
            `Lunch basket is assumed at 60% of the store's average basket (${fmtMoney(k.averageBasket, currency, 2)} × 0.6 = ${fmtMoney(lunchBasket, currency, 2)}). Replace with measured data when available.`,
            rteMargin !== null
              ? `Gross margin uses the store's Ready-to-eat category margin (${fmtPct(margin)}).`
              : `Ready-to-eat margin is not recorded; the store's overall margin (${fmtPct(margin)}) is used instead.`,
            `One-off cost of ${fmtMoney(2500, currency)} for fixtures and signage is a placeholder assumption.`,
            "Additional lunch transactions are assumed not to replace existing purchases.",
          ],
          risks: [
            "Fresh lunch items have high waste if demand does not materialise.",
            "Additional preparation and replenishment labour around midday.",
            "Lunch purchases may partly replace purchases customers already make at other times.",
          ],
          metricsToWatch: ["Transactions 11:00–14:00", "Average basket", "Ready-to-eat revenue", "Gross margin", "Waste", "Labour hours"],
          costAssumption: 2500,
          ...confidence(months, peerShares.length, offices.length ? "Location signal available." : "No office-related location signal on file — the hypothesis rests on the internal gap alone."),
          scenario: {
            kind: "TRANSACTION_UPLIFT",
            name: `Lunch assortment — ${store.name}`,
            derivation:
              `Reaching the peer median lunch share would mean about ${fmtNumber(gapTx, 0)} more transactions per day. ` +
              "Conservative / Base / Optimistic assume closing 25% / 50% / 100% of that gap. These are arithmetic reference points, not predictions.",
            variants: variants(mk(0.25), mk(0.5), mk(1)),
          },
        });
      }

      // ── Rule 6: busy final opening hour ────────────────────────────────────
      const closeHour = store.closesAt ? Number(store.closesAt.slice(0, 2)) : null;
      if (closeHour !== null && closeHour <= 20) {
        const lastHourTx = hourlyByStore.get(store.id)?.get(closeHour - 1) ?? 0;
        const lastShare = (lastHourTx / total) * 100;
        const peerLast = peers
          .filter((p) => hourTotal(p.id) > 0 && p.closesAt)
          .map((p) => ((hourlyByStore.get(p.id)?.get(Number(p.closesAt!.slice(0, 2)) - 1) ?? 0) / hourTotal(p.id)) * 100);
        const pm = median(peerLast);
        if (pm !== null && peerLast.length >= 2 && lastShare > pm * 1.2) {
          const mk = (f: number) => ({
            additionalHoursPerDay: 1,
            additionalEmployees: 2,
            hourlyEmployeeCost: 19,
            daysPerMonth: Math.round(days),
            additionalCustomersPerHour: Math.max(1, Math.round(lastHourTx * f)),
            averageBasket: r2(k.averageBasket!),
            grossMarginPct: r1(k.grossMarginPct!),
            otherMonthlyCost: 0,
          });
          out.push({
            ruleKey: "busy-last-hour",
            storeId: store.id,
            libraryKey: "change-opening-hours",
            title: "Later closing time",
            category: "OPENING_HOURS",
            observation:
              `${fmtPct(lastShare)} of daily transactions at ${store.name} fall in the final opening hour (${closeHour - 1}:00–${closeHour}:00). ` +
              `The peer median for the final hour is ${fmtPct(pm)}.`,
            locationSignal: null,
            hypothesis: `Demand may continue after ${store.closesAt}; one additional opening hour could potentially capture some of it.`,
            whyItMayMatter:
              "A store that is still busy when it closes may be turning customers away. It may equally be that customers simply compress their shopping into the last hour and would spread out, not add up.",
            proposedTest: `Close at ${closeHour + 1}:00 instead of ${store.closesAt} for six weeks. Track transactions per hour for the last three opening hours, not only the added hour.`,
            assumptions: [
              "Two additional staff for the added hour at €19/hour total employer cost — placeholder values.",
              `Average basket (${fmtMoney(k.averageBasket, currency, 2)}) and gross margin (${fmtPct(k.grossMarginPct)}) in the added hour are assumed equal to the store average.`,
              "Customers in the added hour are assumed to be additional, not shifted from earlier hours. This is the assumption most likely to be wrong.",
              "Energy, security and cleaning costs of the extra hour are not included unless entered as other monthly cost.",
            ],
            risks: [
              "Purchases may shift from earlier hours rather than increase.",
              "Staff availability and collective-agreement surcharges for evening hours.",
              "Local opening-hour regulations must permit the change.",
            ],
            metricsToWatch: ["Transactions in added hour", "Transactions in the two hours before", "Total daily transactions", "Labour cost", "Average basket"],
            costAssumption: null,
            ...confidence(months, peerLast.length),
            scenario: {
              kind: "OPENING_HOURS",
              name: `Close one hour later — ${store.name}`,
              derivation:
                `The current final hour averages ${fmtNumber(lastHourTx, 0)} transactions. ` +
                "Conservative / Base / Optimistic assume the added hour reaches 25% / 50% / 75% of that level.",
              variants: variants(mk(0.25), mk(0.5), mk(0.75)),
            },
          });
        }
      }
    }

    // ── Rule 2: basket below peers ───────────────────────────────────────────
    if (k.averageBasket !== null && k.transactions !== null && k.grossMarginPct !== null && days !== null && k.transactionsPerDay !== null) {
      const peerBaskets = peers
        .filter((p) => p.type === store.type)
        .map((p) => kpi3.get(p.id)?.averageBasket)
        .filter((v): v is number => v != null);
      const pm = median(peerBaskets);
      if (pm !== null && peerBaskets.length >= 2 && k.averageBasket < pm * 0.9) {
        const mk = (pct: number) => ({
          // Expressed as: every transaction carries pct% more value → equivalent uplift
          additionalTransactionsPerDay: Math.round(k.transactionsPerDay!),
          averageBasket: r2(k.averageBasket! * (pct / 100)),
          daysPerMonth: Math.round(days),
          grossMarginPct: r1(k.grossMarginPct!),
          monthlyCost: 300,
          oneOffCost: 0,
        });
        out.push({
          ruleKey: "basket-below-peers",
          storeId: store.id,
          libraryKey: "cross-selling",
          title: "Basket size below comparable stores",
          category: "MERCHANDISING",
          observation:
            `Average basket at ${store.name} is ${fmtMoney(k.averageBasket, currency, 2)} over the last 3 months. ` +
            `The median of ${peerBaskets.length} stores of the same type is ${fmtMoney(pm, currency, 2)}.`,
          locationSignal: null,
          hypothesis: "Cross-selling placements or simple bundles could potentially raise the value of existing transactions.",
          whyItMayMatter:
            "Raising basket value does not require new customers. However, a low basket can be structural — a store used for top-up shopping will not behave like a weekly-shop store.",
          proposedTest:
            "Introduce two or three clearly signed cross-sell placements (e.g. bakery + coffee, pasta + sauce) for six weeks and compare average basket and items per transaction with a control store.",
          assumptions: [
            "Transaction volume is assumed unchanged.",
            "The scenario models each transaction gaining 1% / 2% / 4% in value. It is entered in the simulator as 'all current daily transactions × the additional value per transaction'.",
            `A recurring cost of ${fmtMoney(300, currency)}/month for signage and placement work is a placeholder assumption.`,
            `Gross margin on the additional value is assumed equal to the store average (${fmtPct(k.grossMarginPct)}).`,
          ],
          risks: [
            "Bundles may discount products customers would have bought at full price.",
            "Secondary placements take space from other products.",
            "Basket differences between stores may reflect customer mix, not merchandising.",
          ],
          metricsToWatch: ["Average basket", "Items per transaction", "Revenue of paired categories", "Gross margin"],
          costAssumption: 300,
          ...confidence(months, peerBaskets.length),
          scenario: {
            kind: "TRANSACTION_UPLIFT",
            name: `Basket uplift — ${store.name}`,
            derivation:
              `Current basket ${fmtMoney(k.averageBasket, currency, 2)}; peer median ${fmtMoney(pm, currency, 2)}. ` +
              "Conservative / Base / Optimistic assume +1% / +2% / +4% value per existing transaction — fixed reference steps, not derived from the peer gap.",
            variants: variants(mk(1), mk(2), mk(4)),
          },
        });
      }
    }

    // ── Rule 3: revenue decline vs same months last year ─────────────────────
    {
      const cur = facts.filter((f) => f.storeId === store.id && within(f.month, last6));
      const prev = facts.filter((f) => f.storeId === store.id && within(f.month, prevYear6));
      if (cur.length === 6 && prev.length === 6) {
        const kc = computeKpis(cur, [store]);
        const kp = computeKpis(prev, [store]);
        const change = kc.revenue !== null && kp.revenue ? ((kc.revenue - kp.revenue) / kp.revenue) * 100 : null;
        if (change !== null && change <= -5 && kc.transactionsPerDay !== null && kc.averageBasket !== null && kc.grossMarginPct !== null && kc.openDays !== null) {
          const txChange = kp.transactions ? ((kc.transactions! - kp.transactions) / kp.transactions) * 100 : null;
          const lostPerDay = kp.transactionsPerDay !== null ? Math.max(0, kp.transactionsPerDay - kc.transactionsPerDay) : 0;
          const comp = signals.filter((s) => s.storeId === store.id && s.type === "DEVELOPMENT");
          const d = Math.round(kc.openDays / 6);
          const mk = (f: number) => ({
            additionalTransactionsPerDay: Math.max(1, Math.round(lostPerDay * f)),
            averageBasket: r2(kc.averageBasket!),
            daysPerMonth: d,
            grossMarginPct: r1(kc.grossMarginPct!),
            monthlyCost: 1500,
            oneOffCost: 0,
          });
          out.push({
            ruleKey: "revenue-decline",
            storeId: store.id,
            libraryKey: "local-promotions",
            title: "Declining revenue — test local reactivation",
            category: "LOCAL_MARKETING",
            observation:
              `Revenue at ${store.name} over the last 6 months is ${fmtPct(Math.abs(change))} below the same months one year earlier.` +
              (txChange !== null ? ` Transactions changed by ${txChange >= 0 ? "+" : "−"}${fmtPct(Math.abs(txChange))} over the same comparison.` : ""),
            locationSignal: comp.length ? `${comp.length} local development signal${comp.length > 1 ? "s" : ""} on file${comp.some((c) => c.isDemo) ? " (demo data)" : ""}: ${comp.map((c) => c.name).join("; ")}.` : null,
            hypothesis: "A targeted local campaign could potentially win back part of the lost visit frequency.",
            whyItMayMatter:
              "The cause of the decline is not known from the data. A local campaign is a relatively cheap way to learn whether lapsed customers respond — but if the cause is structural (a new competitor, road changes), promotion alone may not reverse it.",
            proposedTest:
              "Run a four-week local campaign (door-drop or geo-targeted offer redeemable only at this store). Measure redemptions, transactions and whether the change persists four weeks after the campaign ends.",
            assumptions: [
              `Campaign cost of ${fmtMoney(1500, currency)}/month is a placeholder assumption.`,
              "Recovered transactions are assumed to have the current average basket and margin; promotional discounts would lower both.",
              "The comparison uses the same calendar months one year earlier, so seasonal effects largely cancel out.",
            ],
            risks: [
              "Discounts given to customers who would have come anyway.",
              "A short-lived effect that disappears when the campaign ends.",
              "Treating a symptom while the actual cause remains unknown.",
            ],
            metricsToWatch: ["Transactions per day", "Coupon redemptions", "Average basket", "Gross margin", "Transactions 4 weeks after campaign"],
            costAssumption: 1500,
            ...confidence(months, peers.length, "The decline itself is a calculated fact; its cause is unknown."),
            scenario: {
              kind: "TRANSACTION_UPLIFT",
              name: `Local reactivation — ${store.name}`,
              derivation:
                `Transactions per open day fell by about ${fmtNumber(lostPerDay, 0)} compared with the same months last year. ` +
                "Conservative / Base / Optimistic assume recovering 10% / 25% / 50% of that difference.",
              variants: variants(mk(0.1), mk(0.25), mk(0.5)),
            },
          });
        }
      }
    }

    // ── Rule 4: waste share above peers ──────────────────────────────────────
    {
      const wasteShare = (id: string) => {
        const fs = facts.filter((f) => f.storeId === id && within(f.month, last3));
        const w = fs.every((f) => f.costs.WASTE !== undefined) ? fs.reduce((a, f) => a + (f.costs.WASTE ?? 0), 0) : null;
        const rev = fs.reduce((a, f) => a + f.revenue, 0);
        return fs.length ? { share: calculateShare(w, rev), monthly: w !== null ? w / fs.length : null } : { share: null, monthly: null };
      };
      const mine = wasteShare(store.id);
      const peerShares = peers.map((p) => wasteShare(p.id).share).filter((v): v is number => v !== null);
      const pm = median(peerShares);
      if (mine.share !== null && mine.monthly !== null && pm !== null && peerShares.length >= 2 && mine.share > pm * 1.25) {
        const mk = (pct: number) => ({ baselineMonthlyCost: Math.round(mine.monthly!), reductionPct: pct, monthlyCost: 150, oneOffCost: 0 });
        out.push({
          ruleKey: "waste-above-peers",
          storeId: store.id,
          libraryKey: "markdown-routine",
          title: "Waste cost above comparable stores",
          category: "FOOD_WASTE",
          observation:
            `Waste at ${store.name} equals ${fmtPct(mine.share, 2)} of revenue over the last 3 months (${fmtMoney(mine.monthly, currency)}/month). ` +
            `The peer median is ${fmtPct(pm, 2)}.`,
          locationSignal: null,
          hypothesis: "A fixed daily markdown routine for short-dated fresh products could potentially reduce write-offs.",
          whyItMayMatter:
            "Waste is one of the few cost lines a store team can influence directly. A higher share can, however, also come from a fresher or broader assortment, which may be intentional.",
          proposedTest:
            "Introduce a fixed markdown time (e.g. 2 hours before closing) for bakery, fruit & vegetables and ready-to-eat for six weeks. Compare waste value and category margin with the prior six weeks.",
          assumptions: [
            `Labelling and handling cost of ${fmtMoney(150, currency)}/month is a placeholder assumption.`,
            "Markdown revenue and its lower margin are not modelled; only avoided write-offs are counted.",
            "Scenario reductions of 10% / 20% / 30% are fixed reference steps.",
          ],
          risks: [
            "Customers may learn to wait for markdowns, lowering full-price sales.",
            "Margin dilution in the affected categories.",
            "Staff time required at a busy time of day.",
          ],
          metricsToWatch: ["Waste value", "Waste % of revenue", "Category gross margin", "Full-price sell-through", "Markdown revenue"],
          costAssumption: 150,
          ...confidence(months, peerShares.length),
          scenario: {
            kind: "COST_REDUCTION",
            name: `Waste reduction — ${store.name}`,
            derivation: `Baseline is the average monthly waste cost of the last 3 months (${fmtMoney(mine.monthly, currency)}). Conservative / Base / Optimistic assume 10% / 20% / 30% lower waste.`,
            variants: variants(mk(10), mk(20), mk(30)),
          },
        });
      }
    }

    // ── Rule 7: high-margin category under-indexed vs peers ──────────────────
    if (k.grossMarginPct !== null && k.transactionsPerDay !== null && days !== null) {
      const shareOf = (id: string) => {
        const rows = categoryFacts.filter((c) => c.storeId === id && within(c.month, last3));
        const total = rows.reduce((a, c) => a + c.revenue, 0);
        const m = new Map<string, { rev: number; wm: number; wrev: number }>();
        for (const c of rows) {
          const e = m.get(c.categoryName) ?? { rev: 0, wm: 0, wrev: 0 };
          e.rev += c.revenue;
          if (c.marginPct !== null) {
            e.wm += c.revenue * c.marginPct;
            e.wrev += c.revenue;
          }
          m.set(c.categoryName, e);
        }
        return { total, m };
      };
      const mine = shareOf(store.id);
      const peerData = peers.filter((p) => p.type === store.type).map((p) => shareOf(p.id)).filter((p) => p.total > 0);
      if (mine.total > 0 && peerData.length >= 2) {
        let best: { name: string; share: number; peer: number; margin: number } | null = null;
        for (const [name, e] of mine.m) {
          if (name === "Other" || e.wrev === 0) continue;
          const margin = e.wm / e.wrev;
          const share = (e.rev / mine.total) * 100;
          const pm = median(peerData.map((p) => ((p.m.get(name)?.rev ?? 0) / p.total) * 100));
          if (pm === null || pm <= 0) continue;
          if (margin > k.grossMarginPct + 5 && share < pm * 0.8) {
            if (!best || pm - share > best.peer - best.share) best = { name, share, peer: pm, margin };
          }
        }
        if (best) {
          const b = best;
          const itemValue = 3.2;
          const mk = (pct: number) => ({
            additionalTransactionsPerDay: Math.max(1, Math.round(k.transactionsPerDay! * (pct / 100))),
            averageBasket: itemValue,
            daysPerMonth: Math.round(days),
            grossMarginPct: r1(b.margin),
            monthlyCost: 0,
            oneOffCost: 1800,
          });
          out.push({
            ruleKey: `category-underindex`,
            storeId: store.id,
            libraryKey: b.name === "Bakery" ? "bakery-positioning" : "improve-product-visibility",
            title: `${b.name} share below comparable stores`,
            category: "STORE_LAYOUT",
            observation:
              `${b.name} accounts for ${fmtPct(b.share)} of revenue at ${store.name} (last 3 months); the median of ${peerData.length} stores of the same type is ${fmtPct(b.peer)}. ` +
              `The category's recorded gross margin at this store is ${fmtPct(b.margin)}, above the store average of ${fmtPct(k.grossMarginPct)}.`,
            locationSignal: null,
            hypothesis: `Giving ${b.name.toLowerCase()} a more visible position could potentially increase how often it is added to a basket.`,
            whyItMayMatter:
              "A high-margin category with a lower share than in similar stores may be under-exposed. It may also reflect local demand or a nearby specialist — the data cannot tell which.",
            proposedTest: `Move selected ${b.name.toLowerCase()} products to a position near the entrance or main aisle for six weeks. Compare category revenue with the six weeks before and with a control store.`,
            assumptions: [
              `Each additional purchase is assumed to add one item worth ${fmtMoney(itemValue, currency, 2)} — a placeholder; replace with the category's real average item value.`,
              "Scenario steps assume 1% / 2% / 4% of current daily transactions add such an item.",
              `One-off cost of ${fmtMoney(1800, currency)} for fixtures is a placeholder assumption.`,
              "No cannibalisation of other categories is modelled.",
            ],
            risks: [
              "The displaced category may lose sales.",
              "Higher exposure of fresh products can raise waste.",
              "Share differences may be driven by local demand rather than placement.",
            ],
            metricsToWatch: [`${b.name} revenue`, "Total revenue", "Transactions", "Basket size", "Waste", "Gross margin"],
            costAssumption: 1800,
            ...confidence(months, peerData.length),
            scenario: {
              kind: "TRANSACTION_UPLIFT",
              name: `${b.name} placement — ${store.name}`,
              derivation:
                `The store averages ${fmtNumber(k.transactionsPerDay, 0)} transactions per day. Conservative / Base / Optimistic assume 1% / 2% / 4% of them add one ${b.name.toLowerCase()} item. Fixed reference steps, not derived from the peer gap.`,
              variants: variants(mk(1), mk(2), mk(4)),
            },
          });
        }
      }
    }
  }
  return out;
}
