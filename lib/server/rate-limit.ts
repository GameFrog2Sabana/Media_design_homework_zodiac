const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 18;

/**
 * Best-effort, in-memory abuse protection. It deliberately does not persist
 * any identifier: the session id is random and only held for the minute.
 */
export function allowGeneration(sessionId: string): boolean {
  const now = Date.now();
  const recent = (buckets.get(sessionId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS) {
    buckets.set(sessionId, recent);
    return false;
  }
  recent.push(now);
  buckets.set(sessionId, recent);
  if (buckets.size > 5000) {
    for (const [key, timestamps] of buckets) {
      if (timestamps.every((timestamp) => now - timestamp >= WINDOW_MS)) {
        buckets.delete(key);
      }
    }
  }
  return true;
}

export function resetRateLimit(): void {
  buckets.clear();
}
