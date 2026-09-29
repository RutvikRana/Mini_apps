import type { Plugin } from "vite";

/**
 * Dev middleware for pin.it short-link resolution.
 *
 * Mirrors api/pin.py so the app works identically in preview and production.
 * The browser cannot follow the pin.it redirect itself (the shortener sends
 * no CORS headers), so this runs server-side where CORS does not apply.
 */
export function pinResolver(): Plugin {
  return {
    name: "pin-it-resolver",
    configureServer(server) {
      server.middlewares.use("/api/pin", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const code = url.searchParams.get("code") ?? (url.searchParams.get("url")?.split("/").filter(Boolean).pop() ?? null);

        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify(body));
        };

        if (!code || !/^[A-Za-z0-9]{5,20}$/.test(code)) {
          send(400, { error: "missing or invalid code" });
          return;
        }

        // Server-side, so CORS is irrelevant here — just follow the redirect.
        fetch(`https://api.pinterest.com/url_shortener/${encodeURIComponent(code)}/redirect/`, {
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MiniMixApp/1.0)" },
          signal: AbortSignal.timeout(10_000),
        })
          .then((response) => {
            const location = response.headers.get("location");
            if (response.status >= 300 && response.status < 400 && location) {
              const pinId = location.match(/\/pin\/(\d+)/)?.[1] ?? null;
              send(200, { ok: true, pinId, resolvedUrl: location });
            } else {
              send(502, { error: `unexpected status ${response.status}` });
            }
          })
          .catch(() => send(502, { error: "shortener unreachable" }));
      });
    },
  };
}
