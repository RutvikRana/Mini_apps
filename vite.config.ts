import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { pinResolver } from "./plugins/pin-resolver";

export default defineConfig({
  plugins: [react(), tailwindcss(), pinResolver()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: process.env.VITE_CONVEX_URL
    ? {}
    : {
        // Fallback for builders that don't inject env vars (e.g. static
        // hosting builds): bake the public Convex deployment URL. It is not a
        // secret — it ships in the client bundle by design.
        "import.meta.env.VITE_CONVEX_URL": JSON.stringify("https://canny-perch-362.convex.cloud"),
      },
  server: {
    host: "0.0.0.0",
    hmr: false,
    // The preview is reached through a per-workspace tunnel host that changes
    // on every restart, so allow any host instead of pinning one.
    allowedHosts: true,
  },
});
