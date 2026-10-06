import { BreakEvenCalculator } from "./BreakEvenCalculator";
import { loadStorePrefills } from "./loaders";

export async function BreakEvenTab({ orgId, currency }: { orgId: string; currency: string }) {
  const { prefills } = await loadStorePrefills(orgId);
  return <BreakEvenCalculator currency={currency} stores={prefills} />;
}
