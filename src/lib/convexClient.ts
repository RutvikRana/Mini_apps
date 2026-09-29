import { ConvexClient } from "convex/browser";
import type { AuthTokenFetcher } from "convex/browser";

/**
 * Module-level Convex client with a background JWT feed.
 *
 * The bridge (sync.ts) authenticates with the JWT that ConvexAuthProvider
 * persists under `<address>__convexAuthJWT` in localStorage. We keep that
 * value fresh and hand it to ConvexClient.setAuth, which re-fetches whenever
 * the current token expires.
 */

let client: ConvexClient | null = null;

export function getClient(): ConvexClient {
  if (!client) {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url) throw new Error("VITE_CONVEX_URL is not set — cloud sync disabled");
    client = new ConvexClient(url);
  }
  return client;
}

export const convexClient = {
  get mutation() {
    throw new Error("Use getClient().mutation instead");
  },
};

type FeedState = { started: boolean; jwt: string | null };

const feed: FeedState = { started: false, jwt: null };

function readStoredJwt(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith("__convexAuthJWT")) {
        const value = localStorage.getItem(key);
        if (value) return value;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

function startFeed() {
  if (feed.started) return;
  feed.started = true;

  const fetchToken: AuthTokenFetcher = async () => feed.jwt;

  try {
    getClient().setAuth(fetchToken, () => {
      // Auth state changes are handled by the bridge's own polling.
    });
  } catch {
    /* Convex not configured — feed stays idle, sync is disabled */
    return;
  }

  // Keep feed.jwt current; setAuth re-calls fetchToken on demand.
  setInterval(() => {
    const jwt = readStoredJwt();
    if (jwt !== feed.jwt) feed.jwt = jwt;
  }, 15000);
}

/**
 * Run `fn` with the current auth JWT (or null). Waits briefly for a JWT to
 * appear in storage, then runs. Returns null when signed out / unconfigured.
 */
export async function withToken<T>(fn: (jwt: string | null) => Promise<T>): Promise<T | null> {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) return null;
  startFeed();
  const deadline = Date.now() + 10_000;
  let jwt = readStoredJwt();
  while (!jwt && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    jwt = readStoredJwt();
  }
  feed.jwt = jwt;
  if (!jwt) return null;
  return fn(jwt);
}

/** Fast path: is a JWT present in storage right now? */
export function hasToken(): boolean {
  if (!import.meta.env.VITE_CONVEX_URL) return false;
  return readStoredJwt() !== null;
}
