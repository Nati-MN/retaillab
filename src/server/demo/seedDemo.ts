import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEMO_CATEGORIES, DEMO_EVENTS, DEMO_LAST_MONTH, DEMO_ORG, DEMO_PLACES, DEMO_STORES, DEMO_USER, generateDemoFacts,
} from "@/lib/demo/dataset";
import { offsetPoint } from "@/lib/geo";
import { addMonths, monthToDate } from "@/lib/period";
import { generateStrategyDrafts, type StrategyDraft } from "@/lib/strategy/rules";
import type { CategoryFact, CostTypeKey, MonthFact, StoreDTO } from "@/lib/analytics/types";

/**
 * (Re)creates the fictional demo organization. Idempotent: an existing demo
 * organization is deleted first. Does not import "server-only" modules so it
 * can run from `prisma/seed.ts` as well as from a server action.
 */
export async function seedDemo(db: PrismaClient): Promise<{ organizationId: string }> {
  const accessedAt = new Date(Date.UTC(2026, 9, 1, 9, 0, 0));

  await db.organization.deleteMany({ where: { isDemo: true } });

  const user = await db.user.upsert({
    where: { email: DEMO_USER.email },
    update: { name: DEMO_USER.name },
    create: { email: DEMO_USER.email, name: DEMO_USER.name, passwordHash: await bcrypt.hash(DEMO_USER.password, 10) },
  });

  const org = await db.organization.create({
    data: {
      ...DEMO_ORG,
      isDemo: true,
      onboardingCompletedAt: new Date(),
      memberships: { create: { userId: user.id, role: "OWNER" } },
      categories: { create: DEMO_CATEGORIES.map((name, i) => ({ name, sortOrder: i })) },
    },
    include: { categories: true },
  });
  const catId = new Map(org.categories.map((c) => [c.name, c.id]));

  await db.store.createMany({
    data: DEMO_STORES.map((s) => ({
      organizationId: org.id, name: s.name, code: s.code, address: s.address, city: s.city,
      latitude: s.lat, longitude: s.lon, openingDate: new Date(s.openingDate), areaSqm: s.areaSqm,
      employees: s.employees, parkingSpaces: s.parkingSpaces, type: s.type, opensAt: s.opensAt,
      closesAt: s.closesAt, openDaysPerWeek: s.openDaysPerWeek, isDemo: true,
    })),
  });
  const stores = await db.store.findMany({ where: { organizationId: org.id } });
  const storeId = new Map(stores.map((s) => [s.code, s.id]));
  const sid = (code: string) => storeId.get(code)!;

  // ── Monthly facts ──────────────────────────────────────────────────────────
  const { months, hourly } = generateDemoFacts();
  await db.monthlyRevenue.createMany({
    data: months.map((m) => ({
      storeId: sid(m.storeCode), month: monthToDate(m.month), revenue: m.revenue, transactions: m.transactions,
      customers: m.customers, grossMarginPct: m.grossMarginPct, openDays: m.openDays,
    })),
  });
  await db.cost.createMany({
    data: months.flatMap((m) =>
      (Object.entries(m.costs) as [CostTypeKey, number][]).map(([type, amount]) => ({
        storeId: sid(m.storeCode), month: monthToDate(m.month), type, amount,
      })),
    ),
  });
  await db.categoryMetric.createMany({
    data: months.flatMap((m) =>
      m.categories.map((c) => ({
        storeId: sid(m.storeCode), categoryId: catId.get(c.name)!, month: monthToDate(m.month), revenue: c.revenue,
        marginPct: c.marginPct, wasteValue: c.wasteValue, stockoutRatePct: c.stockoutRatePct, areaSqm: c.areaSqm,
      })),
    ),
  });
  await db.storeMetric.createMany({
    data: hourly.map((h) => ({
      storeId: sid(h.storeCode), month: monthToDate(h.month), kind: "HOURLY_TRANSACTIONS" as const, hour: h.hour, value: h.value,
    })),
  });

  await db.knownEvent.createMany({
    data: DEMO_EVENTS.map((e) => ({
      organizationId: org.id, storeId: sid(e.storeCode), date: new Date(e.date), title: e.title, description: e.description,
    })),
  });

  // ── Fictional surroundings, each with a (fictional) source ─────────────────
  const sourceByStore = new Map<string, { places: string; municipal: string }>();
  for (const s of DEMO_STORES) {
    const places = await db.researchSource.create({
      data: {
        organizationId: org.id,
        title: `Demo places dataset — surroundings of ${s.name}`,
        url: `https://demo.retaillab.invalid/places/${s.code.toLowerCase()}`,
        publisher: "RetailLab demo provider (fictional data)",
        accessedAt,
        excerpt: "Invented points of interest and competitors generated for demonstration. Not real places.",
        reliability: "DEMO",
        isDemo: true,
      },
    });
    const municipal = await db.researchSource.create({
      data: {
        organizationId: org.id,
        title: `Demo municipal bulletin — ${s.city}`,
        url: `https://demo.retaillab.invalid/municipal/${s.code.toLowerCase()}`,
        publisher: "RetailLab demo provider (fictional data)",
        publishedAt: new Date(Date.UTC(2026, 5, 15)),
        accessedAt,
        excerpt: "Invented local development notices generated for demonstration. Not a real publication.",
        reliability: "DEMO",
        isDemo: true,
      },
    });
    sourceByStore.set(s.code, { places: places.id, municipal: municipal.id });
  }

  const competitorRows: Prisma.CompetitorCreateManyInput[] = [];
  const signalRows: Prisma.LocationSignalCreateManyInput[] = [];
  for (const p of DEMO_PLACES) {
    const s = DEMO_STORES.find((x) => x.code === p.storeCode)!;
    const pt = offsetPoint(s.lat, s.lon, p.meters, p.bearing);
    const src = sourceByStore.get(p.storeCode)!;
    if (p.kind === "competitor") {
      competitorRows.push({
        storeId: sid(p.storeCode), name: p.name, category: p.category, latitude: pt.lat, longitude: pt.lon,
        distanceM: p.meters, openingHours: p.openingHours, rating: p.rating, reviewCount: p.reviewCount,
        sourceId: src.places, lastCheckedAt: accessedAt, isDemo: true,
      });
    } else {
      signalRows.push({
        storeId: sid(p.storeCode), type: p.category as Prisma.LocationSignalCreateManyInput["type"], name: p.name,
        detail: p.detail, latitude: pt.lat, longitude: pt.lon, distanceM: p.meters,
        sourceId: p.category === "DEVELOPMENT" ? src.municipal : src.places, isDemo: true,
      });
    }
  }
  await db.competitor.createMany({ data: competitorRows });
  await db.locationSignal.createMany({ data: signalRows });

  // ── Stored research results (demo provider output) ─────────────────────────
  for (const code of ["W01", "L01"]) {
    const s = DEMO_STORES.find((x) => x.code === code)!;
    const src = sourceByStore.get(code)!;
    const comps = DEMO_PLACES.filter((p) => p.storeCode === code && p.kind === "competitor" && p.meters <= 1000);
    const sigs = DEMO_PLACES.filter((p) => p.storeCode === code && p.kind === "signal" && p.meters <= 1000);
    const count = (t: string) => sigs.filter((x) => x.category === t).length;
    const facts: { text: string; sourceId: string }[] = [
      { text: `${comps.length} competing grocery outlets within 1 km; the nearest is ${comps.sort((a, b) => a.meters - b.meters)[0]!.name} at ${comps[0]!.meters} m.`, sourceId: src.places },
      { text: `${count("PUBLIC_TRANSPORT")} public transport stop(s) within 1 km.`, sourceId: src.places },
      { text: `${count("OFFICE")} office-related point(s) of interest within 1 km.`, sourceId: src.places },
      { text: `${count("SCHOOL")} school(s) within 1 km.`, sourceId: src.places },
      ...sigs.filter((x) => x.category === "DEVELOPMENT").map((d) => ({ text: d.name + ".", sourceId: src.municipal })),
    ];
    await db.researchResult.create({
      data: {
        organizationId: org.id, storeId: sid(code), query: `Analyze the environment around ${s.name}.`,
        radiusM: 1000, provider: "demo", status: "PARTIAL", sourcesChecked: 2, isDemo: true, completedAt: accessedAt,
        findings: {
          create: [
            ...facts.map((f) => ({ kind: "FACT" as const, text: f.text, sourceId: f.sourceId })),
            ...(code === "W01"
              ? [
                  { kind: "OPPORTUNITY" as const, text: "Office-related points of interest nearby may indicate weekday daytime demand. Whether these workers shop at this store is not known.", sourceId: src.places },
                  { kind: "RISK" as const, text: "A convenience competitor with longer opening hours is located 260 m away.", sourceId: src.places },
                ]
              : [
                  { kind: "RISK" as const, text: "A discount competitor opened 400 m away in March 2026. Its effect on this store has not been measured.", sourceId: src.municipal },
                  { kind: "OPPORTUNITY" as const, text: "Direct arterial road access may support car-borne shopping trips; no traffic counts are available.", sourceId: src.places },
                ]),
            { kind: "UNKNOWN" as const, text: "Resident population within the radius — no reliable source found. No demographics provider is connected." },
            { kind: "UNKNOWN" as const, text: "Daytime working population — no reliable source found." },
            { kind: "UNKNOWN" as const, text: "Competitor revenue or footfall — not publicly available." },
          ],
        },
      },
    });
  }

  // ── Hypotheses from the rule engine ────────────────────────────────────────
  const storeDTOs: StoreDTO[] = stores.map((s) => ({
    id: s.id, name: s.name, code: s.code, address: s.address, city: s.city, latitude: s.latitude, longitude: s.longitude,
    openingDate: s.openingDate?.toISOString().slice(0, 10) ?? null, areaSqm: s.areaSqm, employees: s.employees,
    parkingSpaces: s.parkingSpaces, type: s.type, opensAt: s.opensAt, closesAt: s.closesAt,
    openDaysPerWeek: s.openDaysPerWeek, isDemo: s.isDemo,
  }));
  const facts: MonthFact[] = months.map((m) => ({
    storeId: sid(m.storeCode), month: m.month, revenue: m.revenue, transactions: m.transactions, customers: m.customers,
    grossMarginPct: m.grossMarginPct, openDays: m.openDays, costs: m.costs,
    operatingCosts: Object.values(m.costs).reduce((a, b) => a + b, 0),
  }));
  const categoryFacts: CategoryFact[] = months
    .filter((m) => m.month >= addMonths(DEMO_LAST_MONTH, -2))
    .flatMap((m) => m.categories.map((c) => ({
      storeId: sid(m.storeCode), categoryId: catId.get(c.name)!, categoryName: c.name, month: m.month, revenue: c.revenue,
      marginPct: c.marginPct, wasteValue: c.wasteValue, stockoutRatePct: c.stockoutRatePct, areaSqm: c.areaSqm,
    })));
  const hourlyAvg = new Map<string, { sum: number; n: number }>();
  for (const h of hourly) {
    const key = `${h.storeCode}|${h.hour}`;
    const e = hourlyAvg.get(key) ?? { sum: 0, n: 0 };
    e.sum += h.value;
    e.n += 1;
    hourlyAvg.set(key, e);
  }
  const drafts = generateStrategyDrafts({
    stores: storeDTOs,
    facts,
    categoryFacts,
    hourly: [...hourlyAvg.entries()].map(([k, v]) => {
      const [code, hour] = k.split("|") as [string, string];
      return { storeId: sid(code), hour: Number(hour), transactions: v.sum / v.n };
    }),
    signals: signalRows.map((s) => ({ storeId: s.storeId, type: s.type, name: s.name, distanceM: s.distanceM ?? null, isDemo: true })),
    latestMonth: DEMO_LAST_MONTH,
    currency: DEMO_ORG.currency,
  });
  const strategyIds = new Map<string, string>();
  for (const d of drafts) {
    const id = await persistStrategyDraft(db, org.id, d);
    strategyIds.set(`${d.storeId}|${d.ruleKey}`, id);
  }
  const strat = (code: string, rule: string) => strategyIds.get(`${sid(code)}|${rule}`) ?? null;

  // ── Experiments ────────────────────────────────────────────────────────────
  const d = (iso: string) => new Date(iso);
  await db.experiment.create({
    data: {
      organizationId: org.id, title: "Bakery entrance placement", isDemo: true,
      hypothesis: "Moving selected bakery products closer to the entrance may increase bakery category sales.",
      testStoreId: sid("G01"), controlStoreId: sid("L01"), status: "COMPLETED",
      startDate: d("2025-09-01"), endDate: d("2025-10-12"), cost: 1800,
      notes: "Six-week test. Before = average month Jun–Aug 2025; after = test period scaled to one month. Control store had no layout change.",
      decision: "REPEAT",
      decisionNote: "Direction is encouraging but rests on one store pair and one period. Repeat in a second store before changing the layout standard.",
      metrics: {
        create: [
          { name: "Bakery revenue / month", unit: "EUR", isPrimary: true, testBefore: 12400, testAfter: 13950, controlBefore: 10000, controlAfter: 10210 },
          { name: "Total revenue / month", unit: "EUR", testBefore: 318500, testAfter: 324100, controlBefore: 421000, controlAfter: 424300 },
          { name: "Transactions / month", unit: "count", testBefore: 20650, testAfter: 20910, controlBefore: 31400, controlAfter: 31520 },
          { name: "Average basket", unit: "EUR", testBefore: 15.42, testAfter: 15.5, controlBefore: 13.41, controlAfter: 13.46 },
          { name: "Bakery waste / month", unit: "EUR", testBefore: 655, testAfter: 790, controlBefore: 930, controlAfter: 945 },
          { name: "Gross margin", unit: "pct", testBefore: 34.6, testAfter: 34.8, controlBefore: 29.9, controlAfter: 29.9 },
        ],
      },
    },
  });
  await db.experiment.create({
    data: {
      organizationId: org.id, strategyId: strat("W01", "lunch-gap"), title: "Expanded lunch assortment", isDemo: true,
      hypothesis: "A stronger ready-to-eat lunch offering could potentially attract more lunchtime customers.",
      testStoreId: sid("W01"), controlStoreId: sid("G01"), status: "RUNNING",
      startDate: d("2026-09-07"), endDate: d("2026-10-18"), cost: 2500,
      notes: "Baseline = six weeks before start. Results are entered when the test ends.",
      metrics: {
        create: [
          { name: "Transactions 11:00–14:00 / day", unit: "count", isPrimary: true, testBefore: 283, controlBefore: 203 },
          { name: "Ready-to-eat revenue / month", unit: "EUR", testBefore: 32100, controlBefore: 29400 },
          { name: "Average basket", unit: "EUR", testBefore: 15.02, controlBefore: 15.9 },
          { name: "Ready-to-eat waste / month", unit: "EUR", testBefore: 2250, controlBefore: 1750 },
        ],
      },
    },
  });
  await db.experiment.create({
    data: {
      organizationId: org.id, strategyId: strat("S01", "busy-last-hour"), title: "Close at 20:00 instead of 19:00", isDemo: true,
      hypothesis: "Demand may continue after 19:00; one additional opening hour could potentially capture some of it.",
      testStoreId: sid("S01"), controlStoreId: null, status: "PLANNED",
      startDate: d("2026-11-02"), endDate: d("2026-12-13"), cost: 5928,
      notes: "No control store selected yet — without one, the result cannot be separated from the store's own growth trend.",
      metrics: {
        create: [
          { name: "Transactions / day", unit: "count", isPrimary: true },
          { name: "Transactions 17:00–19:00 / day", unit: "count" },
          { name: "Labour cost / month", unit: "EUR" },
        ],
      },
    },
  });
  await db.experiment.create({
    data: {
      organizationId: org.id, strategyId: strat("L01", "revenue-decline"), title: "Door-drop voucher campaign", isDemo: true,
      hypothesis: "A targeted local campaign could potentially win back part of the lost visit frequency.",
      testStoreId: sid("L01"), controlStoreId: sid("W01"), status: "STOPPED",
      startDate: d("2026-05-04"), endDate: d("2026-05-17"), cost: 900,
      notes: "Stopped after two of four weeks: the printer delivered vouchers without a store-specific code, so redemptions could not be attributed.",
      decision: "INCONCLUSIVE",
      decisionNote: "Measurement failed. Not evidence for or against the hypothesis.",
      metrics: {
        create: [
          { name: "Transactions / day", unit: "count", isPrimary: true, testBefore: 1075, testAfter: 1081, controlBefore: 1640, controlAfter: 1652 },
          { name: "Voucher redemptions", unit: "count" },
        ],
      },
    },
  });
  await db.experiment.create({
    data: {
      organizationId: org.id, title: "Second self-checkout terminal", isDemo: true,
      hypothesis: "A second self-checkout may shorten queues at commuter peaks and reduce abandoned purchases.",
      testStoreId: sid("I01"), controlStoreId: null, status: "COMPLETED",
      startDate: d("2026-02-02"), endDate: d("2026-03-15"), cost: 14500,
      notes: "No control store: no other convenience-format store exists in the organization.",
      decision: "MODIFY",
      decisionNote: "Morning-peak transactions rose, but without a control the share caused by the terminal is unknown. Extend measurement with queue-length counts.",
      metrics: {
        create: [
          { name: "Transactions 07:00–09:00 / day", unit: "count", isPrimary: true, testBefore: 318, testAfter: 336 },
          { name: "Average basket", unit: "EUR", testBefore: 6.84, testAfter: 6.79 },
        ],
      },
    },
  });

  // ── Opportunity board ──────────────────────────────────────────────────────
  const statusFor: Record<string, Prisma.OpportunityCreateManyInput["status"]> = {
    "W01|lunch-gap": "TESTING",
    "S01|busy-last-hour": "READY_TO_TEST",
    "L01|revenue-decline": "INCONCLUSIVE",
    "L01|waste-above-peers": "INVESTIGATING",
  };
  const codeOf = new Map(stores.map((s) => [s.id, s.code]));
  await db.opportunity.createMany({
    data: drafts.map((dr) => {
      const key = `${codeOf.get(dr.storeId)}|${dr.ruleKey}`;
      return {
        organizationId: org.id, storeId: dr.storeId, strategyId: strategyIds.get(`${dr.storeId}|${dr.ruleKey}`),
        title: dr.title, observation: dr.observation, hypothesis: dr.hypothesis,
        impactScenario: dr.scenario.derivation, estimatedCost: dr.costAssumption,
        effort: dr.scenario.kind === "OPENING_HOURS" ? "HIGH" : dr.scenario.kind === "COST_REDUCTION" ? "LOW" : "MEDIUM",
        dataConfidence: dr.dataConfidence, suggestedExperiment: dr.proposedTest,
        status: statusFor[key] ?? "NEW",
      };
    }),
  });
  await db.strategy.updateMany({ where: { id: { in: [strat("W01", "lunch-gap")].filter((x): x is string => !!x) } }, data: { status: "TESTING" } });

  await db.report.create({
    data: {
      organizationId: org.id, createdById: user.id, title: "Monthly Store Performance Report — September 2026",
      periodStart: monthToDate(DEMO_LAST_MONTH), periodEnd: monthToDate(DEMO_LAST_MONTH),
      sections: ["summary", "revenue", "comparison", "customers", "costs", "location", "experiments-active", "experiments-completed", "opportunities", "risks", "tests", "sources"],
      storeIds: [],
    },
  });

  return { organizationId: org.id };
}

/** Saves a rule-engine draft as Strategy + Scenario + ScenarioInput rows. Re-running replaces the previous draft of the same rule. */
export async function persistStrategyDraft(db: PrismaClient, organizationId: string, d: StrategyDraft): Promise<string> {
  await db.strategy.deleteMany({ where: { organizationId, storeId: d.storeId, ruleKey: d.ruleKey, status: "HYPOTHESIS" } });
  const existing = await db.strategy.findFirst({ where: { organizationId, storeId: d.storeId, ruleKey: d.ruleKey } });
  if (existing) return existing.id; // already progressed beyond HYPOTHESIS — keep the user's record
  const s = await db.strategy.create({
    data: {
      organizationId, storeId: d.storeId, libraryKey: d.libraryKey, ruleKey: d.ruleKey, title: d.title,
      category: d.category, origin: "RULE_ENGINE", observation: d.observation, locationSignal: d.locationSignal,
      hypothesis: d.hypothesis, whyItMayMatter: d.whyItMayMatter, proposedTest: d.proposedTest,
      assumptions: d.assumptions, risks: d.risks, metricsToWatch: d.metricsToWatch,
      costAssumption: d.costAssumption, dataConfidence: d.dataConfidence, confidenceNote: d.confidenceNote,
      scenarios: {
        create: {
          organizationId, storeId: d.storeId, name: d.scenario.name, kind: d.scenario.kind, derivation: d.scenario.derivation,
          inputs: {
            create: (Object.entries(d.scenario.variants) as [keyof typeof d.scenario.variants, Record<string, number>][]).flatMap(
              ([variant, inputs]) => Object.entries(inputs).map(([key, value]) => ({ variant, key, value })),
            ),
          },
        },
      },
    },
  });
  return s.id;
}
