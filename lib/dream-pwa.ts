export const DREAM_VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || ""

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false
  const standalone = window.matchMedia("(display-mode: standalone)").matches
  const iosStandalone = "standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return standalone || iosStandalone
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

const IOS_NOT_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|Brave|Firefox|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat|LinkedInApp|WhatsApp/i

export type IosWebContext = "standalone" | "safari" | "other"

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined" || !isIosDevice()) return false
  const ua = navigator.userAgent
  if (IOS_NOT_SAFARI.test(ua)) return false
  if (!/Safari\//i.test(ua)) return false
  return "standalone" in navigator
}

/** Where an iPhone opened the page. null on Android/desktop. */
export function iosWebContext(): IosWebContext | null {
  if (typeof window === "undefined" || !isIosDevice()) {
    return isStandaloneDisplay() ? "standalone" : null
  }
  if (isStandaloneDisplay()) return "standalone"
  if (isIosSafari()) return "safari"
  return "other"
}

export function onboardingNotiHint(ctx: IosWebContext | null): string {
  if (ctx === "other") return "open this in safari to install."
  if (ctx === "safari") return "add to home screen, then turn on notis."
  return "you will get a noti at this time."
}

export function onboardingNotiLabel(ctx: IosWebContext | null): string {
  if (ctx === "other") return "open in safari"
  if (ctx === "safari") return "add to home screen"
  return "turn on notis"
}

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
