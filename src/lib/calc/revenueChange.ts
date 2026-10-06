import { isNum, type Num } from "./kpi";

export interface RevenueChangeDecomposition {
  previousRevenue: number;
  currentRevenue: number;
  revenueChange: number;
  previousBasket: number;
  currentBasket: number;
  /** Current − previous transactions. */
  transactionsChange: number;
  /** Current − previous basket. */
  basketChange: number;
  /** Δtransactions × previous basket — the part that exists if only the number of transactions had changed. */
  transactionsEffect: number;
  /** previous transactions × Δbasket — the part that exists if only the basket had changed. */
  basketEffect: number;
  /** Δtransactions × Δbasket — exists only because both changed together. */
  interactionEffect: number;
}

/**
 * Splits an observed revenue change between two periods into a transactions
 * effect and a basket effect (same idea as calculateRevenueOpportunity, but
 * for two observed periods instead of an assumed percentage change).
 *
 *   Revenue = Transactions × Basket, with Basket = Revenue / Transactions
 *   ΔRevenue = ΔT × B₀ + T₀ × ΔB + ΔT × ΔB
 *
 * This is an accounting identity. It says HOW the change is composed, never WHY.
 * Returns null when any input is missing or a transaction count is zero.
 */
export function decomposeRevenueChange(
  previousRevenue: Num,
  previousTransactions: Num,
  currentRevenue: Num,
  currentTransactions: Num,
): RevenueChangeDecomposition | null {
  if (!isNum(previousRevenue) || !isNum(previousTransactions) || !isNum(currentRevenue) || !isNum(currentTransactions)) return null;
  if (previousTransactions === 0 || currentTransactions === 0) return null;
  const previousBasket = previousRevenue / previousTransactions;
  const currentBasket = currentRevenue / currentTransactions;
  const dT = currentTransactions - previousTransactions;
  const dB = currentBasket - previousBasket;
  return {
    previousRevenue,
    currentRevenue,
    revenueChange: currentRevenue - previousRevenue,
    previousBasket,
    currentBasket,
    transactionsChange: dT,
    basketChange: dB,
    transactionsEffect: dT * previousBasket,
    basketEffect: previousTransactions * dB,
    interactionEffect: dT * dB,
  };
}
