import webpush from "web-push"
import { createClient } from "@supabase/supabase-js"
import { bedtimeDue } from "@/lib/dream-bedtime"

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

export async function tickDreamPushes(windowMinutes = 15) {
  const supabase = serviceClient()
  if (!supabase || !applyVapid()) {
    return { ok: false as const, sent: 0, skipped: 0, error: "push is not configured" }
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, timezone, last_notified_on")

  if (error) {
    return { ok: false as const, sent: 0, skipped: 0, error: error.message }
  }

  const rows = (data || []) as PushRow[]
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const bedtimes = new Map<string, string | null>()
  if (userIds.length) {
    const profiles = await supabase.from("profiles").select("id, bedtime").in("id", userIds)
    for (const profile of profiles.data || []) {
      bedtimes.set(profile.id as string, (profile.bedtime as string | null) ?? null)
    }
  }

  let sent = 0
  let skipped = 0
  for (const row of rows) {
    const timeZone = row.timezone || "UTC"
    const { due, dateKey } = bedtimeDue(bedtimes.get(row.user_id) ?? null, timeZone, windowMinutes)
    if (!due || row.last_notified_on === dateKey) {
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
        .update({ last_notified_on: dateKey })
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

  return { ok: true as const, sent, skipped }
}
