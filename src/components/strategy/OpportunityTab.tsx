import { loadStorePrefills } from "./loaders";
import { OpportunityCalculator } from "./OpportunityCalculator";

export async function OpportunityTab({ orgId, currency }: { orgId: string; currency: string }) {
  const { prefills } = await loadStorePrefills(orgId);
  return <OpportunityCalculator currency={currency} stores={prefills} />;
}
