import { v } from "convex/values";
import { query } from "./_generated/server";
import { auth } from "./auth";

/** Email of the signed-in user (for the account chip). */
export const me = query({
  args: {},
  returns: v.union(v.object({ email: v.string() }), v.null()),
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    return { email: user.email };
  },
});
