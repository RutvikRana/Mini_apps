import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  // Users, authSessions and authAccounts — managed by @convex-dev/auth.
  ...authTables,

  tasks: defineTable({
    userId: v.id("users"),
    /** Client-generated stable id — matches the local Task.id. */
    client_id: v.string(),
    text: v.string(),
    done: v.boolean(),
    /** Due time as epoch ms, or null for tasks without a reminder. */
    due_at: v.union(v.number(), v.null()),
    /** Reminder repeat interval in minutes. */
    repeat_min: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    /** Tombstone: true when the task was deleted (kept for two-way sync). */
    deleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_client_id", ["userId", "client_id"]),
});
