export const DREAM_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || ""

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

export async function registerDreamWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  } catch {
    return null
  }
}

function vapidBytes(base64: string): BufferSource {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export async function subscribeDreamPush(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  if (!DREAM_VAPID_PUBLIC_KEY) return null
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidBytes(DREAM_VAPID_PUBLIC_KEY),
  })
}

export async function showDreamNotification(
  registration: ServiceWorkerRegistration,
  title = "dream about me",
  body = "notis on. we will ping you at bedtime.",
  url = "/?receive=1",
): Promise<void> {
  await registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url },
  })
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
