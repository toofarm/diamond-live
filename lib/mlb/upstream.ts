/**
 * Server-side wrapper around the MLB Stats API.
 * Uses Next 16's fetch with `next: { revalidate }` to cache responses
 * across requests for the given TTL.
 */

const BASE = "https://statsapi.mlb.com/api/v1";

export async function mlb<T>(path: string, opts: { revalidate?: number } = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    next: { revalidate: opts.revalidate ?? 60 },
    headers: { "User-Agent": "diamond-live/0.1" },
  });
  if (!res.ok) {
    throw new Error(`MLB API ${res.status} ${res.statusText}: ${path}`);
  }
  return (await res.json()) as T;
}
