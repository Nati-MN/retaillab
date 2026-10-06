/** Fixed categorical order. A store keeps its slot everywhere (colour follows the entity, never its rank). */
export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"] as const;

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length]!;
}

/** Stable colour per store: index in the organization's alphabetical store list. */
export function storeColorMap(stores: ReadonlyArray<{ id: string }>): Record<string, string> {
  return Object.fromEntries(stores.map((s, i) => [s.id, seriesColor(i)]));
}
