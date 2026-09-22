const ICON = "/icons/icon-192.png"

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request))
})

self.addEventListener("push", (event) => {
  let payload = {
    title: "dream about me",
    body: "time to dream",
    url: "/?receive=1",
  }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      const text = event.data.text()
      if (text) payload.body = text
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "dream about me", {
      body: payload.body || "time to dream",
      icon: ICON,
      badge: ICON,
      data: { url: payload.url || "/?receive=1" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = event.notification.data?.url || "/?receive=1"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          if ("navigate" in client) return client.navigate(target).then(() => client.focus())
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
