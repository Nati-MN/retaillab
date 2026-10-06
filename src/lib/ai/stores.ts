import type { StoreLite } from "./types";

/**
 * Store resolver: finds store references in free text. Pure and deterministic.
 *
 * Understood forms, in order of priority:
 *  1. Ordinal — "Store 4", "store #2", "3rd store": the n-th store in
 *     alphabetical order by name. This is a convention, so it is always
 *     reported back to the user as an interpretation.
 *  2. Full store name, or store code.
 *  3. City (with a few exonyms, e.g. "Vienna" → "Wien"). Ambiguous when the
 *     organization has several stores in that city.
 *  4. A distinctive word of the store name ("Urfahr").
 */

export type StoreMention = { ref: string; index: number } & (
  | { status: "resolved"; store: StoreLite; how: "ordinal" | "name" | "code" | "city" | "name_part"; note: string | null }
  | { status: "ambiguous"; candidates: StoreLite[] }
  | { status: "not_found"; reason: string }
);

/** Exonyms / spelling variants → the spelling used in Austrian city names. Applied to normalized text. */
const CITY_ALIASES: Record<string, string> = {
  vienna: "wien",
  "sankt polten": "st polten",
  "saint polten": "st polten",
  "st poelten": "st polten",
  "sankt poelten": "st polten",
  salzbourg: "salzburg",
};

const ORDINAL_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const STORE_NOUN = "(?:store|shop|filiale|branch|outlet|location|markt)";

/** Lowercase, strip diacritics, turn punctuation into spaces. Length is NOT preserved. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sortStoresByName<T extends { name: string; code: string }>(stores: readonly T[]): T[] {
  return [...stores].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.code.localeCompare(b.code));
}

export function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function wordIndex(haystack: string, needle: string, from = 0): number {
  if (!needle) return -1;
  let i = haystack.indexOf(needle, from);
  while (i !== -1) {
    const before = i === 0 ? " " : haystack[i - 1];
    const after = i + needle.length >= haystack.length ? " " : haystack[i + needle.length];
    if (before === " " && after === " ") return i;
    i = haystack.indexOf(needle, i + 1);
  }
  return -1;
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const label = (s: StoreLite) => `${s.name} (${s.code})`;

export function findStoreMentions(text: string, stores: readonly StoreLite[]): StoreMention[] {
  const t = normalizeText(text);
  const sorted = sortStoresByName(stores);
  const out: StoreMention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  const seen = new Set<string>();
  const addResolved = (m: Extract<StoreMention, { status: "resolved" }>, start: number, end: number) => {
    taken.push([start, end]);
    if (seen.has(m.store.id)) return;
    seen.add(m.store.id);
    out.push(m);
  };

  // 1. Ordinals.
  const ordinalRes = [
    new RegExp(`\\b${STORE_NOUN} (?:no |nr |number )?(\\d{1,3}|${Object.keys(ORDINAL_WORDS).slice(0, 10).join("|")})\\b`, "g"),
    new RegExp(`\\b(\\d{1,3})(?:st|nd|rd|th) ${STORE_NOUN}\\b`, "g"),
    new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).slice(10).join("|")}) ${STORE_NOUN}\\b`, "g"),
  ];
  for (const re of ordinalRes) {
    for (const m of t.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const raw = m[1]!;
      const n = /^\d+$/.test(raw) ? Number(raw) : ORDINAL_WORDS[raw]!;
      const ref = titleCase(m[0]);
      const store = sorted[n - 1];
      if (!store) {
        taken.push([start, end]);
        out.push({
          ref, index: start, status: "not_found",
          reason: sorted.length === 0
            ? "This organization has no stores yet."
            : `"${ref}" would be the ${ordinalSuffix(n)} store in alphabetical order, but there ${sorted.length === 1 ? "is only 1 store" : `are only ${sorted.length} stores`}.`,
        });
        continue;
      }
      addResolved({
        ref, index: start, status: "resolved", store, how: "ordinal",
        note: `Interpreting "${ref}" as ${label(store)} — the ${ordinalSuffix(n)} store in alphabetical order by name.`,
      }, start, end);
    }
  }

  // 2. Full names (longest first so "Wien Mitte Nord" wins over "Wien Mitte"), then codes.
  for (const s of [...stores].sort((a, b) => b.name.length - a.name.length)) {
    const name = normalizeText(s.name);
    const i = wordIndex(t, name);
    if (i !== -1 && !overlaps(i, i + name.length)) {
      addResolved({ ref: s.name, index: i, status: "resolved", store: s, how: "name", note: null }, i, i + name.length);
    }
  }
  for (const s of stores) {
    const code = normalizeText(s.code);
    const i = wordIndex(t, code);
    if (i !== -1 && !overlaps(i, i + code.length)) {
      addResolved({ ref: s.code, index: i, status: "resolved", store: s, how: "code", note: null }, i, i + code.length);
    }
  }

  // 3. Cities, including aliases.
  const cities = new Map<string, StoreLite[]>();
  for (const s of stores) {
    const c = normalizeText(s.city);
    if (!c) continue;
    cities.set(c, [...(cities.get(c) ?? []), s]);
  }
  const cityTerms: { term: string; city: string }[] = [...cities.keys()].map((c) => ({ term: c, city: c }));
  for (const [alias, city] of Object.entries(CITY_ALIASES)) if (cities.has(city)) cityTerms.push({ term: alias, city });
  for (const { term, city } of cityTerms.sort((a, b) => b.term.length - a.term.length)) {
    const i = wordIndex(t, term);
    if (i === -1 || overlaps(i, i + term.length)) continue;
    const inCity = cities.get(city)!;
    const ref = titleCase(term);
    if (inCity.length === 1) {
      const store = inCity[0]!;
      addResolved({
        ref, index: i, status: "resolved", store, how: "city",
        note: `Interpreting "${ref}" as ${label(store)} — the only store in ${store.city}.`,
      }, i, i + term.length);
    } else {
      taken.push([i, i + term.length]);
      const candidates = inCity.filter((s) => !seen.has(s.id));
      if (candidates.length > 0) out.push({ ref, index: i, status: "ambiguous", candidates: sortStoresByName(candidates) });
    }
  }

  // 4. Distinctive words of a store name.
  const tokenOwners = new Map<string, StoreLite[]>();
  for (const s of stores) {
    for (const tok of new Set(normalizeText(s.name).split(" "))) {
      if (tok.length < 4) continue;
      tokenOwners.set(tok, [...(tokenOwners.get(tok) ?? []), s]);
    }
  }
  for (const [tok, owners] of tokenOwners) {
    const i = wordIndex(t, tok);
    if (i === -1 || overlaps(i, i + tok.length)) continue;
    const ref = titleCase(tok);
    if (owners.length === 1) {
      const store = owners[0]!;
      addResolved({ ref, index: i, status: "resolved", store, how: "name_part", note: `Interpreting "${ref}" as ${label(store)}.` }, i, i + tok.length);
    } else {
      taken.push([i, i + tok.length]);
      const candidates = owners.filter((s) => !seen.has(s.id));
      if (candidates.length > 0) out.push({ ref, index: i, status: "ambiguous", candidates: sortStoresByName(candidates) });
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

export type StoreResolution =
  | { ok: true; store: StoreLite; note: string | null }
  | { ok: false; error: string };

/** Resolves ONE reference (an id, a code, a name, a city or an ordinal) to exactly one store. */
export function resolveStoreRef(ref: string, stores: readonly StoreLite[]): StoreResolution {
  const byId = stores.find((s) => s.id === ref);
  if (byId) return { ok: true, store: byId, note: null };
  const mentions = findStoreMentions(ref, stores);
  if (mentions.length === 0) return { ok: false, error: `No store matches "${ref}".` };
  if (mentions.length > 1) return { ok: false, error: `"${ref}" refers to more than one store.` };
  const m = mentions[0]!;
  if (m.status === "resolved") return { ok: true, store: m.store, note: m.note };
  if (m.status === "ambiguous") return { ok: false, error: `"${m.ref}" matches ${m.candidates.length} stores: ${m.candidates.map(label).join(", ")}.` };
  return { ok: false, error: m.reason };
}
