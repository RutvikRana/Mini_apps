import type { Task } from "@/apps/todo/store";

/**
 * Merge rules between local tasks and the Convex mirror.
 *
 * - Local wins when local `updatedAt` is newer (last-writer-wins).
 * - Tombstones (deleted: true) win over any live task with an older or equal
 *   updatedAt.
 * - `nextRemindAt` is device-local scheduling noise and is intentionally not
 *   synced; reminders fire per device.
 */

export type RemoteChange = {
  client_id: string;
  text: string;
  done: boolean;
  due_at: number | null;
  repeat_min: number;
  created_at: number;
  updated_at: number;
  deleted: boolean;
};

export type LocalPush = {
  client_id: string;
  text?: string;
  done?: boolean;
  due_at?: number | null;
  repeat_min?: number;
  created_at?: number;
  updated_at: number;
  deleted?: boolean;
};

export function remoteToTask(change: RemoteChange): Task {
  return {
    id: change.client_id,
    text: change.text,
    done: change.done,
    dueAt: change.due_at === null ? null : new Date(change.due_at).toISOString(),
    repeatMin: change.repeat_min,
    // Reminders are scheduled per device; start fresh from due time.
    nextRemindAt: change.done || change.due_at === null ? null : new Date(change.due_at).toISOString(),
    createdAt: change.created_at,
    updatedAt: change.updated_at,
  };
}

export function taskToRemote(task: Task): LocalPush {
  return {
    client_id: task.id,
    text: task.text,
    done: task.done,
    due_at: task.dueAt === null ? null : Date.parse(task.dueAt),
    repeat_min: task.repeatMin,
    created_at: task.createdAt,
    updated_at: task.updatedAt ?? task.createdAt,
    deleted: false,
  };
}

export function deleteToRemote(id: string, now: number): LocalPush {
  return { client_id: id, updated_at: now, deleted: true };
}

/** True when the remote row should replace the local task. */
export function remoteShouldReplaceLocal(local: Task, remote: RemoteChange): boolean {
  const localUpdatedAt = local.updatedAt ?? local.createdAt;
  if (remote.deleted) return remote.updated_at > localUpdatedAt;
  return remote.updated_at > localUpdatedAt;
}
