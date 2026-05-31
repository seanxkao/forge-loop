export function nextActiveCount(currentActive: number, totalCount: number): number {
  return currentActive > 0 ? 0 : totalCount;
}

export function activeAfterCountIncrease(currentActive: number, totalCount: number): number {
  return currentActive > 0 ? totalCount : 0;
}
