import webpush from "web-push"
import { createClient } from "@supabase/supabase-js"
import { bedtimeDue, dreamNightDate } from "@/lib/dream-bedtime"

type PushRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  timezone: string | null
  last_notified_on: string | null
}

function vapidConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  )
}

export function dreamPushConfigured() {
  return vapidConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function zoneForDreamNight(profileZone: string | null | undefined, pushZone: string | null | undefined) {
  for (const zone of [profileZone, pushZone]) {
    const trimmed = zone?.trim()
    if (!trimmed) continue
    try {
      dreamNightDate(trimmed)
      return trimmed
    } catch {
      continue
    }
  }
  return ""
}

function applyVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails("mailto:hi@dreamabt.me", publicKey, privateKey)
  return true
}

export async function sendDreamPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title?: string; body?: string; url?: string },
) {
  if (!applyVapid()) throw new Error("vapid is not configured")
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify({
      title: payload.title || "dream about me",
      body: payload.body || "time to dream",
      url: payload.url || "/?receive=1",
    }),
  )
}

export async function expireDreams() {
  const supabase = serviceClient()
  if (!supabase) return 0
  const { data } = await supabase
    .from("dreams")
    .select("id, image_path, thumb_path")
    .lte("expires_at", new Date().toISOString())
  const rows = data || []
  const paths = rows
    .flatMap((row) => [row.image_path, row.thumb_path])
    .filter((path): path is string => Boolean(path))
  if (paths.length) await supabase.storage.from("dreams").remove(paths)
  if (rows.length) {
    await supabase.from("dreams").delete().in(
      "id",
      rows.map((row) => row.id),
    )
  }
  return rows.length
}

export async function tickDreamPushes(windowMinutes = 15) {
  const expired = await expireDreams()
  const supabase = serviceClient()
  if (!supabase || !applyVapid()) {
    return { ok: false as const, sent: 0, skipped: 0, expired, error: "push is not configured" }
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, timezone, last_notified_on")

  if (error) {
    return { ok: false as const, sent: 0, skipped: 0, expired, error: error.message }
  }

  const rows = (data || []) as PushRow[]
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const bedtimes = new Map<string, string | null>()
  const profileZones = new Map<string, string>()
  const openNights = new Map<string, Set<string>>()
  const soloUsers = new Set<string>()
  if (userIds.length) {
    const profiles = await supabase.from("profiles").select("id, bedtime, timezone").in("id", userIds)
    for (const profile of profiles.data || []) {
      const id = profile.id as string
      bedtimes.set(id, (profile.bedtime as string | null) ?? null)
      const zone = typeof profile.timezone === "string" ? profile.timezone.trim() : ""
      if (zone) profileZones.set(id, zone)
    }
    const { data: dreams } = await supabase
      .from("dreams")
      .select("recipient_id, night_date, revealed_at, expires_at")
      .in("recipient_id", userIds)
      .is("revealed_at", null)
      .gt("expires_at", new Date().toISOString())
    for (const dream of dreams || []) {
      const id = dream.recipient_id as string
      const nights = openNights.get(id) ?? new Set<string>()
      nights.add(dream.night_date as string)
      openNights.set(id, nights)
    }
    const { data: solos } = await supabase.from("solo_dreams").select("user_id").in("user_id", userIds)
    for (const solo of solos || []) soloUsers.add(solo.user_id as string)
  }

  let sent = 0
  let skipped = 0
  for (const row of rows) {
    const timeZone = zoneForDreamNight(profileZones.get(row.user_id), row.timezone)
    if (!timeZone) {
      skipped += 1
      continue
    }
    const night = dreamNightDate(timeZone)
    if (!openNights.get(row.user_id)?.has(night) && !soloUsers.has(row.user_id)) {
      skipped += 1
      continue
    }
    const { due, dateKey } = bedtimeDue(bedtimes.get(row.user_id) ?? null, timeZone, windowMinutes)
    if (!due || row.last_notified_on === night || row.last_notified_on === dateKey) {
      skipped += 1
      continue
    }
    try {
      await sendDreamPush(row, {
        body: "time to dream",
        url: "/?receive=1",
      })
      await supabase
        .from("push_subscriptions")
        .update({ last_notified_on: night })
        .eq("id", row.id)
      sent += 1
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id)
      }
      skipped += 1
    }
  }

  return { ok: true as const, sent, skipped, expired }
}
