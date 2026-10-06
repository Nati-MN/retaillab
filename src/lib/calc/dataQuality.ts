export interface QualityCheck {
  key: string;
  label: string;
  present: boolean;
  /** Why this input matters: which analyses are limited without it. */
  impact: string;
}

export interface DataQuality {
  /** Share of checks that are present, 0–100. Measures completeness only — NOT business quality. */
  scorePct: number;
  checks: QualityCheck[];
  missing: QualityCheck[];
}

/** Completeness = present checks / total checks × 100 (each check weighted equally). */
export function calculateDataQuality(checks: QualityCheck[]): DataQuality {
  const present = checks.filter((c) => c.present).length;
  return {
    scorePct: checks.length === 0 ? 0 : (present / checks.length) * 100,
    checks,
    missing: checks.filter((c) => !c.present),
  };
}
