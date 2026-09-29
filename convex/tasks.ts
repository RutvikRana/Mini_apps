import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { auth } from "./auth";

/**
 * Tasks sync with tombstones: deletions set `deleted: true` instead of
 * removing the row, so other devices learn about deletes via `pull`.
 * Tombstones carry minimal data. `clearAll` physically removes everything.
 */

async function getUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  return userId;
}

const changeSpec = v.object({
  client_id: v.string(),
  text: v.optional(v.string()),
  done: v.optional(v.boolean()),
  due_at: v.optional(v.union(v.number(), v.null())),
  repeat_min: v.optional(v.number()),
  created_at: v.optional(v.number()),
  updated_at: v.number(),
  deleted: v.optional(v.boolean()),
});

/**
 * Pull every change (live tasks + tombstones) updated after `since` (epoch ms).
 * Pass 0 for the first sync. Deletions arrive as { deleted: true } rows.
 */
export const pull = query({
  args: { since: v.number() },
  returns: v.object({
    changes: v.array(
      v.object({
        client_id: v.string(),
        text: v.string(),
        done: v.boolean(),
        due_at: v.union(v.number(), v.null()),
        repeat_min: v.number(),
        created_at: v.number(),
        updated_at: v.number(),
        deleted: v.boolean(),
      }),
    ),
    next_cursor: v.number(),
  }),
  handler: async (ctx, { since }) => {
    const userId = await getUserId(ctx);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const changes = rows
      .filter((row) => row.updated_at > since)
      .sort((a, b) => a.updated_at - b.updated_at)
      .map((row) => ({
        client_id: row.client_id,
        text: row.text,
        done: row.done,
        due_at: row.due_at,
        repeat_min: row.repeat_min,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted: row.deleted ?? false,
      }));
    return { changes, next_cursor: Date.now() };
  },
});

/**
 * Push a batch of local changes. Last-writer-wins on updated_at;
 * `deleted: true` writes a tombstone so other devices see the deletion.
 */
export const push = mutation({
  args: { changes: v.array(changeSpec) },
  returns: v.null(),
  handler: async (ctx, { changes }) => {
    const userId = await getUserId(ctx);
    for (const change of changes) {
      if (change.updated_at > Date.now() + 5 * 60 * 1000) {
        continue; // reject clock-skewed futures
      }
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_user_and_client_id", (q) =>
          q.eq("userId", userId).eq("client_id", change.client_id),
        )
        .unique();

      if (existing) {
        if (existing.updated_at >= change.updated_at) continue; // stale, server wins
        await ctx.db.patch(existing._id, {
          text: change.text ?? existing.text,
          done: change.done ?? existing.done,
          due_at: change.due_at === undefined ? existing.due_at : change.due_at,
          repeat_min: change.repeat_min ?? existing.repeat_min,
          updated_at: change.updated_at,
          deleted: change.deleted ?? existing.deleted,
        });
      } else {
        await ctx.db.insert("tasks", {
          userId,
          client_id: change.client_id,
          text: change.text ?? "",
          done: change.done ?? false,
          due_at: change.due_at ?? null,
          repeat_min: change.repeat_min ?? 2,
          created_at: change.created_at ?? change.updated_at,
          updated_at: change.updated_at,
          deleted: change.deleted ?? false,
        });
      }
    }
    return null;
  },
});

/** Live tasks of the signed-in user (tombstones excluded). */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      client_id: v.string(),
      text: v.string(),
      done: v.boolean(),
      due_at: v.union(v.number(), v.null()),
      repeat_min: v.number(),
      created_at: v.number(),
      updated_at: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((row) => !(row.deleted ?? false))
      .sort((a, b) => a.created_at - b.created_at)
      .map((row) => ({
        client_id: row.client_id,
        text: row.text,
        done: row.done,
        due_at: row.due_at,
        repeat_min: row.repeat_min,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
  },
});

/** Wipe every task row (including tombstones) for the signed-in user. */
export const clearAll = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
