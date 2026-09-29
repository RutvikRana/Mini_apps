/* MiniMix notification service worker.
 *
 * Android Chromium browsers (Chrome, Brave, Samsung Internet…) forbid the
 * page-side `new Notification()` constructor; notifications must be shown by
 * a service worker via showNotification(). This tiny SW exists only for that.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "minimix-notify" && data.title) {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body || "",
        tag: data.tag || "minimix",
        renotify: true,
        requireInteraction: false,
        badge: undefined,
        data: { url: data.url || "/" },
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
