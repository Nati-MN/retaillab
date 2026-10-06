import { addMonths, monthNumber, monthRange, monthToDate, type MonthKey } from "@/lib/period";
import type { CostTypeKey, StoreTypeKey } from "@/lib/analytics/types";

/**
 * FICTIONAL demo dataset for "AlpenMarkt GmbH".
 *
 * Nothing here describes a real company, store, competitor or place of
 * business. City centre coordinates are real so the map is meaningful; every
 * store, address, competitor, signal and number is invented. The generator is
 * deterministic (seeded PRNG) so tests and screenshots are reproducible.
 */

export const DEMO_ORG = {
  name: "AlpenMarkt GmbH",
  industry: "Grocery Retail",
  country: "Austria",
  currency: "EUR",
} as const;

export const DEMO_USER = { email: "demo@retaillab.example", name: "Demo Analyst", password: "demo" } as const;

export const DEMO_LAST_MONTH: MonthKey = "2026-09";
export const DEMO_MONTHS = monthRange(addMonths(DEMO_LAST_MONTH, -23), DEMO_LAST_MONTH);

export const DEMO_CATEGORIES = [
  "Bakery", "Beverages", "Fruit & Vegetables", "Meat", "Dairy",
  "Frozen Food", "Household", "Snacks", "Ready-to-eat", "Other",
] as const;
type Cat = (typeof DEMO_CATEGORIES)[number];

/** Base gross margin (%) and waste (% of category revenue) per category. */
const CAT_BASE: Record<Cat, { margin: number; waste: number; growth: number; stockout: number }> = {
  Bakery: { margin: 47, waste: 6.2, growth: 4, stockout: 3.5 },
  Beverages: { margin: 26, waste: 0.2, growth: 2, stockout: 2.0 },
  "Fruit & Vegetables": { margin: 33, waste: 4.8, growth: 5, stockout: 4.0 },
  Meat: { margin: 25, waste: 3.4, growth: -2, stockout: 2.5 },
  Dairy: { margin: 23, waste: 1.8, growth: 1, stockout: 2.2 },
  "Frozen Food": { margin: 30, waste: 0.3, growth: -4, stockout: 1.5 },
  Household: { margin: 29, waste: 0.1, growth: -1, stockout: 1.8 },
  Snacks: { margin: 36, waste: 0.4, growth: 3, stockout: 2.4 },
  "Ready-to-eat": { margin: 43, waste: 7.0, growth: 11, stockout: 5.5 },
  Other: { margin: 28, waste: 0.3, growth: 0, stockout: 1.5 },
};

export interface DemoStoreSpec {
  code: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
  openingDate: string;
  areaSqm: number;
  employees: number;
  parkingSpaces: number | null;
  type: StoreTypeKey;
  opensAt: string;
  closesAt: string;
  openDaysPerWeek: number;
  /** Story this store tells in the demo. */
  profile: string;
  // generator parameters
  txPerDay: number;
  basket: number;
  annualGrowthPct: number;
  marginAdj: number;
  rentPerSqm: number;
  wasteFactor: number;
  shares: Record<Cat, number>;
  hasHourly: boolean;
  hasCategoryMargins: boolean;
  hasWaste: boolean;
  summerFactor: number;
  hourly?: Record<number, number>;
}

const S = (b: number, bev: number, fv: number, meat: number, dairy: number, frozen: number, hh: number, snacks: number, rte: number, other: number): Record<Cat, number> => ({
  Bakery: b, Beverages: bev, "Fruit & Vegetables": fv, Meat: meat, Dairy: dairy,
  "Frozen Food": frozen, Household: hh, Snacks: snacks, "Ready-to-eat": rte, Other: other,
});

export const DEMO_STORES: DemoStoreSpec[] = [
  {
    code: "W01", name: "Wien Donaustadt", city: "Wien", address: "Musterstraße 12, 1220 Wien (fictional)",
    lat: 48.2335, lon: 16.4418, openingDate: "2014-03-17", areaSqm: 1150, employees: 34, parkingSpaces: 85,
    type: "SUPERMARKET", opensAt: "07:00", closesAt: "20:00", openDaysPerWeek: 6,
    profile: "Highest revenue. Weak lunchtime traffic relative to peers.",
    txPerDay: 1690, basket: 14.6, annualGrowthPct: 3.2, marginAdj: -0.4, rentPerSqm: 21, wasteFactor: 1.0,
    shares: S(7, 13, 14, 13, 14, 7, 9, 8, 5, 10), hasHourly: true, hasCategoryMargins: true, hasWaste: true, summerFactor: 0.96,
    hourly: { 7: 4, 8: 6.5, 9: 8.5, 10: 9, 11: 5.6, 12: 5.8, 13: 5.4, 14: 6.8, 15: 8.2, 16: 10.5, 17: 12.2, 18: 10.5, 19: 6.0 },
  },
  {
    code: "G01", name: "Graz Lend", city: "Graz", address: "Beispielgasse 4, 8020 Graz (fictional)",
    lat: 47.0745, lon: 15.4289, openingDate: "2017-09-04", areaSqm: 720, employees: 19, parkingSpaces: 24,
    type: "SUPERMARKET", opensAt: "07:30", closesAt: "20:00", openDaysPerWeek: 6,
    profile: "Highest gross margin, driven by fresh categories.",
    txPerDay: 820, basket: 15.4, annualGrowthPct: 4.1, marginAdj: 2.6, rentPerSqm: 17, wasteFactor: 0.85,
    shares: S(11, 10, 19, 10, 14, 4, 6, 7, 9, 10), hasHourly: true, hasCategoryMargins: true, hasWaste: true, summerFactor: 0.97,
    hourly: { 7: 2.5, 8: 6, 9: 7.5, 10: 8, 11: 8.2, 12: 9, 13: 7.6, 14: 6.4, 15: 7, 16: 9, 17: 11, 18: 10.3, 19: 7.5 },
  },
  {
    code: "L01", name: "Linz Urfahr", city: "Linz", address: "Probeweg 27, 4040 Linz (fictional)",
    lat: 48.3219, lon: 14.2866, openingDate: "2011-05-09", areaSqm: 880, employees: 22, parkingSpaces: 60,
    type: "SUPERMARKET", opensAt: "07:00", closesAt: "20:00", openDaysPerWeek: 6,
    profile: "Declining since March 2026. Waste above peers.",
    txPerDay: 1210, basket: 13.4, annualGrowthPct: 0.5, marginAdj: -1.0, rentPerSqm: 14, wasteFactor: 1.55,
    shares: S(5, 13, 13, 14, 14, 8, 10, 8, 4, 11), hasHourly: true, hasCategoryMargins: true, hasWaste: true, summerFactor: 0.96,
    hourly: { 7: 3.5, 8: 6, 9: 7.8, 10: 8.2, 11: 8, 12: 8.4, 13: 7.4, 14: 6.6, 15: 7.2, 16: 9.4, 17: 11, 18: 10, 19: 6.5 },
  },
  {
    code: "S01", name: "Salzburg Lehen", city: "Salzburg", address: "Demoplatz 3, 5020 Salzburg (fictional)",
    lat: 47.8128, lon: 13.0282, openingDate: "2023-04-12", areaSqm: 650, employees: 13, parkingSpaces: null,
    type: "SUPERMARKET", opensAt: "07:30", closesAt: "19:00", openDaysPerWeek: 6,
    profile: "Opened 2023 and growing fast. Busy final opening hour. Parking count not recorded.",
    txPerDay: 690, basket: 12.9, annualGrowthPct: 17.5, marginAdj: 0.2, rentPerSqm: 19, wasteFactor: 1.05,
    shares: S(8, 12, 15, 11, 14, 6, 8, 8, 7, 11), hasHourly: true, hasCategoryMargins: true, hasWaste: true, summerFactor: 0.99,
    hourly: { 7: 2.4, 8: 6, 9: 7.5, 10: 8, 11: 8.1, 12: 8.8, 13: 7.6, 14: 6.6, 15: 7.5, 16: 10, 17: 13, 18: 14.5 },
  },
  {
    code: "I01", name: "Innsbruck Hauptbahnhof", city: "Innsbruck", address: "Bahnhofspassage Lokal 5, 6020 Innsbruck (fictional)",
    lat: 47.2636, lon: 11.4009, openingDate: "2019-11-25", areaSqm: 310, employees: 16, parkingSpaces: 0,
    type: "CONVENIENCE", opensAt: "06:00", closesAt: "22:00", openDaysPerWeek: 7,
    profile: "Very high traffic, low basket. Station location with long opening hours.",
    txPerDay: 1880, basket: 6.9, annualGrowthPct: 2.4, marginAdj: 1.2, rentPerSqm: 48, wasteFactor: 1.1,
    shares: S(14, 22, 5, 2, 7, 2, 3, 17, 21, 7), hasHourly: true, hasCategoryMargins: true, hasWaste: true, summerFactor: 1.08,
    hourly: { 6: 5, 7: 9, 8: 8.5, 9: 5.5, 10: 5, 11: 6, 12: 8, 13: 6.5, 14: 5, 15: 5.5, 16: 7.5, 17: 9, 18: 7.5, 19: 5, 20: 3.8, 21: 2.7 },
  },
  {
    code: "P01", name: "St. Pölten Süd", city: "St. Pölten", address: "Fantasiestraße 88, 3100 St. Pölten (fictional)",
    lat: 48.1885, lon: 15.6312, openingDate: "2009-10-01", areaSqm: 1400, employees: 19, parkingSpaces: 140,
    type: "SUPERMARKET", opensAt: "07:30", closesAt: "19:30", openDaysPerWeek: 6,
    profile: "Low traffic, high basket (weekly-shop store). Several data gaps on purpose.",
    txPerDay: 520, basket: 27.5, annualGrowthPct: 1.1, marginAdj: 0, rentPerSqm: 9.5, wasteFactor: 1.0,
    shares: S(5, 12, 12, 16, 13, 10, 13, 6, 2, 11), hasHourly: false, hasCategoryMargins: false, hasWaste: false, summerFactor: 0.95,
  },
];

// ── deterministic PRNG ───────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (rnd: () => number, amp: number) => 1 + (rnd() * 2 - 1) * amp;

/** Open days: all days for 7-day stores, otherwise days minus Sundays. */
export function openDaysInMonth(key: MonthKey, daysPerWeek: number): number {
  const d = monthToDate(key);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const total = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (daysPerWeek >= 7) return total;
  let sundays = 0;
  for (let day = 1; day <= total; day++) if (new Date(Date.UTC(y, m, day)).getUTCDay() === 0) sundays++;
  return total - sundays;
}

/** Seasonal traffic factor by calendar month (grocery pattern: strong December, soft January/February). */
const SEASON: Record<number, number> = { 1: 0.95, 2: 0.96, 3: 1.0, 4: 1.02, 5: 1.0, 6: 0.99, 7: 1.0, 8: 1.0, 9: 1.0, 10: 1.01, 11: 1.02, 12: 1.13 };
/** Basket is larger in December. */
const BASKET_SEASON: Record<number, number> = { 12: 1.08, 4: 1.02 };
/** Energy is higher in winter. */
const ENERGY_SEASON: Record<number, number> = { 1: 1.28, 2: 1.22, 3: 1.08, 4: 0.96, 5: 0.9, 6: 0.94, 7: 1.0, 8: 1.0, 9: 0.9, 10: 0.98, 11: 1.1, 12: 1.24 };

export interface DemoMonthRow {
  storeCode: string;
  month: MonthKey;
  revenue: number;
  transactions: number;
  customers: number;
  grossMarginPct: number;
  openDays: number;
  costs: Record<CostTypeKey, number> | Omit<Record<CostTypeKey, number>, "WASTE">;
  categories: { name: Cat; revenue: number; marginPct: number | null; wasteValue: number | null; stockoutRatePct: number | null; areaSqm: number }[];
}

export interface DemoHourlyRow {
  storeCode: string;
  month: MonthKey;
  hour: number;
  value: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateDemoFacts(): { months: DemoMonthRow[]; hourly: DemoHourlyRow[] } {
  const months: DemoMonthRow[] = [];
  const hourly: DemoHourlyRow[] = [];

  DEMO_STORES.forEach((s, si) => {
    const rnd = mulberry32(1000 + si * 97);
    DEMO_MONTHS.forEach((mk, mi) => {
      const mNum = monthNumber(mk);
      const openDays = openDaysInMonth(mk, s.openDaysPerWeek);
      // `txPerDay` describes the LAST month; walk the trend backwards.
      const monthsFromEnd = DEMO_MONTHS.length - 1 - mi;
      let trend = (1 + s.annualGrowthPct / 100) ** (-monthsFromEnd / 12);
      let season = SEASON[mNum]!;
      if (mNum === 7 || mNum === 8) season *= s.summerFactor;
      let traffic = noise(rnd, 0.012);
      let basketF = (BASKET_SEASON[mNum] ?? 1) * noise(rnd, 0.008);
      let energyF = 1;

      // ── Story events (all fictional; matching KnownEvent rows exist only where noted) ──
      // Linz: step decline from March 2026 (event recorded: discounter opened nearby).
      if (s.code === "L01") {
        trend = 1; // flat before the event; `txPerDay` is the pre-event level
        if (mk >= "2026-03") {
          const since = DEMO_MONTHS.indexOf(mk) - DEMO_MONTHS.indexOf("2026-03");
          traffic *= 0.9 - since * 0.012;
        }
      }
      // Salzburg: June 2025 dip (event recorded: car park resurfacing).
      if (s.code === "S01" && mk === "2025-06") traffic *= 0.84;
      // Graz: August 2026 basket jump (NO event recorded — stays unexplained).
      if (s.code === "G01" && mk === "2026-08") basketF *= 1.09;
      // Innsbruck: January 2026 energy spike (NO event recorded).
      if (s.code === "I01" && mk === "2026-01") energyF = 1.23;
      // Wien: November 2025 bakery refit (event recorded) — small traffic dip.
      if (s.code === "W01" && mk === "2025-11") traffic *= 0.965;

      const txPerDay = s.txPerDay * trend * season * traffic;
      const transactions = Math.round(txPerDay * openDays);
      const basket = s.basket * basketF * (1 + 0.015 * (mi / 12)); // mild price inflation
      const revenue = round2(transactions * basket);
      const customers = Math.round(transactions * (1.055 + (rnd() - 0.5) * 0.01));

      // Categories: shares drift with category growth, then normalise to store revenue.
      const yearsFromEnd = monthsFromEnd / 12;
      const raw = DEMO_CATEGORIES.map((c) => {
        let share = s.shares[c] * (1 + CAT_BASE[c].growth / 100) ** -yearsFromEnd * noise(rnd, 0.03);
        if (c === "Ready-to-eat" && (mNum === 7 || mNum === 8) && s.code === "I01") share *= 1.06;
        if (c === "Bakery" && s.code === "W01" && mk >= "2025-12") share *= 1.05; // after the refit
        return { c, share };
      });
      const shareSum = raw.reduce((a, r) => a + r.share, 0);
      let weightedMargin = 0;
      let wasteTotal = 0;
      const categories = raw.map(({ c, share }) => {
        const rev = round2((revenue * share) / shareSum);
        const margin = round2(CAT_BASE[c].margin + s.marginAdj + (rnd() - 0.5) * 0.8);
        const waste = round2(rev * (CAT_BASE[c].waste / 100) * s.wasteFactor * noise(rnd, 0.08) * (s.code === "L01" && mk >= "2026-03" ? 1.18 : 1));
        weightedMargin += rev * margin;
        wasteTotal += waste;
        return {
          name: c,
          revenue: rev,
          marginPct: s.hasCategoryMargins ? margin : null,
          wasteValue: s.hasWaste ? waste : null,
          stockoutRatePct: s.hasCategoryMargins ? round2(Math.max(0.3, CAT_BASE[c].stockout * (s.code === "S01" ? 1.5 : 1) * noise(rnd, 0.2))) : null,
          areaSqm: Math.round(s.areaSqm * 0.78 * (s.shares[c] / 100) * 10) / 10,
        };
      });
      const grossMarginPct = round2(weightedMargin / revenue);

      const personnel = round2(s.employees * 3150 * (1 + 0.03 * (mi / 12)) * (mNum === 6 || mNum === 11 ? 1.5 : 1) * noise(rnd, 0.01));
      const costs: Record<CostTypeKey, number> = {
        PERSONNEL: personnel,
        RENT: round2(s.areaSqm * s.rentPerSqm * (mk >= "2026-01" ? 1.035 : 1)),
        ENERGY: round2(s.areaSqm * (s.type === "CONVENIENCE" ? 9.5 : 4.3) * ENERGY_SEASON[mNum]! * energyF * noise(rnd, 0.03)),
        LOGISTICS: round2(revenue * 0.016 * noise(rnd, 0.04)),
        WASTE: round2(wasteTotal),
        MARKETING: round2(revenue * 0.008 * (mNum === 12 || mNum === 4 ? 1.4 : 1) * noise(rnd, 0.1)),
        MAINTENANCE: round2((900 + s.areaSqm * 1.6) * noise(rnd, 0.25)),
        OTHER: round2(revenue * 0.009 * noise(rnd, 0.05)),
      };
      if (!s.hasWaste) delete (costs as Partial<Record<CostTypeKey, number>>).WASTE;

      months.push({ storeCode: s.code, month: mk, revenue, transactions, customers, grossMarginPct, openDays, costs, categories });

      // Hourly profile: only the latest 6 months, only stores that record it.
      if (s.hasHourly && s.hourly && monthsFromEnd < 6) {
        const wSum = Object.values(s.hourly).reduce((a, b) => a + b, 0);
        for (const [h, w] of Object.entries(s.hourly)) {
          hourly.push({ storeCode: s.code, month: mk, hour: Number(h), value: round2((transactions / openDays) * (w / wSum) * noise(rnd, 0.02)) });
        }
      }
    });
  });
  return { months, hourly };
}

// ── Fictional surroundings ───────────────────────────────────────────────────

export interface DemoPlace {
  storeCode: string;
  kind: "competitor" | "signal";
  name: string;
  /** Competitor category or SignalType */
  category: string;
  meters: number;
  bearing: number;
  detail?: string;
  openingHours?: string;
  rating?: number;
  reviewCount?: number;
}

const c = (storeCode: string, name: string, category: string, meters: number, bearing: number, openingHours: string, rating: number, reviewCount: number): DemoPlace =>
  ({ storeCode, kind: "competitor", name, category, meters, bearing, openingHours, rating, reviewCount });
const g = (storeCode: string, category: string, name: string, meters: number, bearing: number, detail?: string): DemoPlace =>
  ({ storeCode, kind: "signal", name, category, meters, bearing, detail });

/** Invented competitor brands — not real companies. */
export const DEMO_PLACES: DemoPlace[] = [
  c("W01", "Frischhof Markt", "Supermarket", 420, 40, "Mo–Sa 07:15–19:30", 4.1, 312),
  c("W01", "Diskonto", "Discount Store", 760, 190, "Mo–Sa 07:40–20:00", 3.9, 540),
  c("W01", "Eckpunkt Express", "Convenience Store", 260, 300, "Mo–So 06:00–23:00", 3.6, 88),
  c("W01", "Marktkorb", "Supermarket", 1850, 120, "Mo–Sa 07:00–20:00", 4.2, 705),
  c("W01", "Diskonto", "Discount Store", 2900, 250, "Mo–Sa 07:40–20:00", 3.8, 410),
  g("W01", "OFFICE", "Bürozentrum Seeblick (fictional)", 380, 75, "Office complex, several tenants"),
  g("W01", "OFFICE", "Technologiepark Nord (fictional)", 640, 110, "Business park"),
  g("W01", "OFFICE", "Verwaltungsgebäude Ost (fictional)", 870, 20, "Administrative building"),
  g("W01", "PUBLIC_TRANSPORT", "U-Bahn station (fictional)", 310, 160, "Underground + 2 bus lines"),
  g("W01", "PUBLIC_TRANSPORT", "Bus stop Musterstraße (fictional)", 90, 10),
  g("W01", "SCHOOL", "Volksschule Musterstraße (fictional)", 540, 330),
  g("W01", "RESIDENTIAL", "Wohnquartier Am Park (fictional)", 450, 230, "Multi-storey housing"),
  g("W01", "SHOPPING_CENTER", "Einkaufszentrum Donaublick (fictional)", 2300, 95),
  g("W01", "PARKING", "Park+Ride facility (fictional)", 350, 165),

  c("G01", "BioAnger", "Specialty Store", 300, 60, "Mo–Fr 08:00–18:30, Sa 08:00–17:00", 4.6, 190),
  c("G01", "Marktkorb", "Supermarket", 690, 200, "Mo–Sa 07:00–20:00", 4.0, 422),
  c("G01", "Diskonto", "Discount Store", 1400, 310, "Mo–Sa 07:40–20:00", 3.9, 380),
  g("G01", "UNIVERSITY", "Fachhochschule campus (fictional)", 780, 280),
  g("G01", "PUBLIC_TRANSPORT", "Tram stop Beispielgasse (fictional)", 120, 140, "2 tram lines"),
  g("G01", "RESIDENTIAL", "Gründerzeit residential blocks (fictional)", 200, 20),
  g("G01", "POINT_OF_INTEREST", "Weekly farmers' market (fictional)", 430, 100, "Wednesday and Saturday mornings"),
  g("G01", "OFFICE", "Coworking Lendhof (fictional)", 510, 240),

  c("L01", "Diskonto", "Discount Store", 400, 135, "Mo–Sa 07:40–20:00", 4.0, 61),
  c("L01", "Frischhof Markt", "Supermarket", 950, 20, "Mo–Sa 07:15–19:30", 4.1, 288),
  c("L01", "Marktkorb", "Supermarket", 1600, 260, "Mo–Sa 07:00–20:00", 4.0, 530),
  c("L01", "Eckpunkt Express", "Convenience Store", 620, 310, "Mo–So 06:00–22:00", 3.5, 47),
  g("L01", "DEVELOPMENT", "New discount store opened 400 m away in March 2026 (fictional)", 400, 135, "Listed in the fictional municipal business register"),
  g("L01", "PUBLIC_TRANSPORT", "Tram stop Probeweg (fictional)", 240, 70),
  g("L01", "SCHOOL", "Gymnasium Urfahr (fictional)", 480, 200),
  g("L01", "RESIDENTIAL", "Single-family housing area (fictional)", 600, 340),
  g("L01", "ROAD_ACCESS", "Arterial road junction (fictional)", 300, 180, "Direct access from main road"),
  g("L01", "OFFICE", "Gewerbepark Urfahr (fictional)", 1300, 95),

  c("S01", "Frischhof Markt", "Supermarket", 520, 250, "Mo–Sa 07:15–19:30", 4.2, 266),
  c("S01", "Eckpunkt Express", "Convenience Store", 180, 80, "Mo–So 06:00–23:00", 3.7, 102),
  c("S01", "Diskonto", "Discount Store", 2100, 10, "Mo–Sa 07:40–20:00", 3.8, 345),
  g("S01", "RESIDENTIAL", "Stadtquartier Lehen (fictional)", 150, 320, "New residential development"),
  g("S01", "DEVELOPMENT", "Residential project with ~180 flats under construction (fictional)", 350, 300, "Completion announced for 2027 in the fictional municipal bulletin"),
  g("S01", "PUBLIC_TRANSPORT", "Obus stop Demoplatz (fictional)", 60, 190, "3 trolleybus lines"),
  g("S01", "SCHOOL", "Neue Mittelschule Lehen (fictional)", 390, 45),
  g("S01", "OFFICE", "Stadtwerk offices (fictional)", 700, 130),

  c("I01", "Eckpunkt Express", "Convenience Store", 150, 200, "Mo–So 05:30–23:00", 3.4, 210),
  c("I01", "Marktkorb", "Supermarket", 480, 320, "Mo–Sa 07:00–20:00", 4.1, 610),
  c("I01", "Bahnhofskiosk Tirol", "Convenience Store", 60, 30, "Mo–So 05:00–22:00", 3.8, 75),
  g("I01", "PUBLIC_TRANSPORT", "Main railway station (fictional description)", 40, 0, "Regional and long-distance rail, tram, bus"),
  g("I01", "OFFICE", "Bürohaus am Bahnhof (fictional)", 220, 270),
  g("I01", "OFFICE", "Landesverwaltung annex (fictional)", 560, 300),
  g("I01", "UNIVERSITY", "University institute building (fictional)", 900, 290),
  g("I01", "POINT_OF_INTEREST", "Hotel cluster (fictional)", 300, 240, "Several hotels"),
  g("I01", "SHOPPING_CENTER", "Station shopping arcade (fictional)", 50, 90),

  c("P01", "Diskonto", "Discount Store", 650, 60, "Mo–Sa 07:40–20:00", 3.9, 298),
  c("P01", "Marktkorb", "Supermarket", 2400, 340, "Mo–Sa 07:00–20:00", 4.0, 455),
  g("P01", "ROAD_ACCESS", "Bypass road exit (fictional)", 500, 150, "Car-oriented location"),
  g("P01", "SHOPPING_CENTER", "Fachmarktzentrum Süd (fictional)", 300, 100, "Retail park with DIY and furniture stores"),
  g("P01", "RESIDENTIAL", "Suburban housing (fictional)", 1100, 300),
  g("P01", "PARKING", "Shared retail park car park (fictional)", 120, 110),
];

export const DEMO_EVENTS: { storeCode: string; date: string; title: string; description: string }[] = [
  { storeCode: "L01", date: "2026-03-02", title: "Discount competitor opened 400 m away (fictional)", description: "A new Diskonto store opened on the arterial road. Recorded by the store manager." },
  { storeCode: "S01", date: "2025-06-09", title: "Car park resurfacing (fictional)", description: "Customer parking in front of the store was closed for roughly two weeks." },
  { storeCode: "W01", date: "2025-11-10", title: "Bakery section refit (fictional)", description: "Bakery counter rebuilt and moved towards the main aisle; partial closure of the area for one week." },
];
