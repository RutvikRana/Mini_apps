/** End-to-end smoke test for the tasks sync API (sign in → push → pull → delete). */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = "https://canny-perch-362.convex.cloud";
const client = new ConvexHttpClient(url);

const email = "rutvikrana512@gmail.com";
const password = process.env.SEED_PASSWORD;
if (!password) {
  console.error("Set SEED_PASSWORD");
  process.exit(1);
}

const res = await client.action(api.auth.signIn, {
  provider: "password",
  params: { flow: "signIn", email, password },
});
const token = res?.tokens?.token ?? res?.tokens?.jwt;
if (!token) {
  console.error("no token returned:", JSON.stringify(res).slice(0, 200));
  process.exit(1);
}
console.log("signIn: ok");

client.setAuth(token);

const now = Date.now();
await client.mutation(api.tasks.push, {
  changes: [
    {
      client_id: "smoke-test-1",
      text: "smoke test task",
      done: false,
      due_at: null,
      repeat_min: 2,
      created_at: now,
      updated_at: now,
    },
  ],
});
console.log("push: ok");

const pulled = await client.query(api.tasks.pull, { since: 0 });
const found = pulled.changes.find((c) => c.client_id === "smoke-test-1");
console.log("pull:", found ? `ok (text=${found.text}, deleted=${found.deleted})` : "MISSING");

const listBefore = await client.query(api.tasks.list, {});
console.log("list:", listBefore.length, "live task(s)");

await client.mutation(api.tasks.push, {
  changes: [{ client_id: "smoke-test-1", updated_at: now + 1, deleted: true }],
});
const pulledAfter = await client.query(api.tasks.pull, { since: 0 });
const tombstone = pulledAfter.changes.find((c) => c.client_id === "smoke-test-1");
const listAfter = await client.query(api.tasks.list, {});
console.log(
  "tombstone:",
  tombstone?.deleted && listAfter.length === 0 ? "ok (delete propagated, list clean)" : "FAILED",
);
