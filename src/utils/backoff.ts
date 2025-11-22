export function exponentialBackoffMs(attempt: number, base = 500): number {
  // attempt starts at 1
  return Math.round(base * Math.pow(2, Math.max(0, attempt - 1)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
