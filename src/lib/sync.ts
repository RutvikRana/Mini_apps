import { api } from "../../convex/_generated/api";
import { getClient, hasToken, withToken } from "./convexClient";
import { applyRemoteTask, getTodoSnapshot, onLocalTaskChange, removeRemoteTask } from "@/apps/todo/store";
import {
  deleteToRemote,
  remoteShouldReplaceLocal,
  remoteToTask,
  taskToRemote,
  type LocalPush,
} from "./syncRules";

/**
 * Cloud sync bridge — keeps the module-level todo store mirrored to Convex
 * whenever the user is signed in.
 *
 * Local edits → pushed to Convex. Remote changes → applied to the store.
 * Signed out → the bridge is idle and the store runs on localStorage only.
 */

export type SyncState = {
  running: boolean;
  lastPush: number;
  /** Cursor (epoch ms) of the last successful pull. */
  lastPull: number;
  error: string | null;
  lastErrorAt: number | null;
};

const state: SyncState = { running: false, lastPush: 0, lastPull: 0, error: null, lastErrorAt: null };

const statusListeners = new Set<() => void>();

function notifyStatus() {
  for (const listener of statusListeners) listener();
}

export function getSyncStatus(): SyncState {
  return { ...state };
}

export function onSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function setSyncState(patch: Partial<SyncState>) {
  Object.assign(state, patch);
  notifyStatus();
}

async function pushOne(change: LocalPush): Promise<void> {
  try {
    await getClient().mutation(api.tasks.push, { changes: [change] });
    setSyncState({ running: true, lastPush: Date.now(), error: null });
  } catch (err) {
    setSyncState({ error: err instanceof Error ? err.message : String(err), lastErrorAt: Date.now() });
  }
}

async function doPull(since: number): Promise<void> {
  try {
    const result = await getClient().query(api.tasks.pull, { since });
    const byId = new Map(getTodoSnapshot().tasks.map((t) => [t.id, t]));
    for (const change of result.changes) {
      const local = byId.get(change.client_id);
      if (local && !remoteShouldReplaceLocal(local, change)) continue;
      if (change.deleted) {
        removeRemoteTask(change.client_id);
      } else {
        applyRemoteTask(remoteToTask(change));
      }
    }
    setSyncState({ running: true, lastPull: result.next_cursor, error: null });
  } catch (err) {
    setSyncState({ error: err instanceof Error ? err.message : String(err), lastErrorAt: Date.now() });
  }
}

let started = false;

/** Idempotent: starts push/pull listeners and pollers for the session. */
export function startSync(): void {
  if (started) return;
  started = true;

  // Local edits → push (only when a token exists; signed-out is a no-op).
  onLocalTaskChange((change) => {
    void withToken(async (jwt) => {
      if (!jwt) return;
      if (change.kind === "upsert") {
        await pushOne(taskToRemote(change.task));
      } else {
        await pushOne(deleteToRemote(change.id, Date.now()));
      }
    });
  });

  // Periodic pull while signed in.
  setInterval(() => {
    if (!hasToken()) return;
    void doPull(state.lastPull);
  }, 15000);

  // Pull on tab focus too.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasToken()) void doPull(state.lastPull);
  });

  // First pull shortly after boot (full sync when the cursor is still 0).
  setTimeout(() => {
    if (hasToken()) void doPull(state.lastPull || 0);
  }, 1500);
}

/** Reset pull cursor when the user signs out, so a new sign-in syncs fresh. */
export function markSignedOut(): void {
  setSyncState({ running: false, lastPull: 0, error: null });
}
