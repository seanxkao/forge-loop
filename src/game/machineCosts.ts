export function machineCostMultiplierForOwned(owned: number): number {
  if (owned >= 1000) return 15.625;
  if (owned >= 100) return 6.25;
  if (owned >= 10) return 2.5;
  return 1;
}

export function totalMachinePurchaseCost(
  baseCost: Record<string, number>,
  currentCount: number,
  qty: number,
): Record<string, number> {
  const total: Record<string, number> = {};
  for (let i = 0; i < qty; i += 1) {
    const mult = machineCostMultiplierForOwned(currentCount + i);
    for (const [mat, amount] of Object.entries(baseCost)) {
      total[mat] = (total[mat] ?? 0) + amount * mult;
    }
  }
  for (const mat of Object.keys(total)) {
    total[mat] = Math.round(total[mat]);
  }
  return total;
}
