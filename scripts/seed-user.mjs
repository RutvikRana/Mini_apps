/**
 * One-off: create the owner account on the Convex deployment via the
 * password provider's signUp flow. Safe to re-run (an existing account
 * just fails the signUp with "already exists").
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = "https://canny-perch-362.convex.cloud";
const client = new ConvexHttpClient(url);

const email = "rutvikrana512@gmail.com";
const password = process.env.SEED_PASSWORD;

if (!password) {
  console.error("Set SEED_PASSWORD env var");
  process.exit(1);
}

try {
  const result = await client.action(api.auth.signIn, {
    provider: "password",
    params: {
      flow: "signUp",
      email,
      password,
    },
  });
  console.log("created:", result.tokens ? "ok (tokens issued)" : JSON.stringify(result).slice(0, 200));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("already") || message.includes("exists") || message.includes("taken")) {
    console.log("account already exists — nothing to do");
  } else {
    console.error("signUp failed:", message);
    process.exit(1);
  }
}
