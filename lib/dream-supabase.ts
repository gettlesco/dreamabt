import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  DREAM_AUTH_FAIL,
  emojiFromMetadata,
  readProfileRow,
  type DreamProfile,
} from "@/lib/dream-auth"
import { isValidTimeZone } from "@/lib/dream-bedtime"

const STORAGE_KEY = "dream-about-me-auth"

export type DreamAuthResult =
  | { ok: true; profile: DreamProfile }
  | { ok: false; error: string }

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function isDreamSupabaseConfigured() {
  return publicConfig() !== null
}

let browserClient: SupabaseClient | null = null

export function getDreamBrowserClient(): SupabaseClient | null {
  const config = publicConfig()
  if (!config || typeof window === "undefined") return null
  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: STORAGE_KEY,
      },
    })
  }
  return browserClient
}

export function createDreamServerClient(): SupabaseClient {
  const config = publicConfig()
  if (!config) throw new Error("dream supabase is not configured")
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function restoreDreamSession(): Promise<DreamProfile | null> {
  try {
    const supabase = getDreamBrowserClient()
    if (!supabase) return null
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return null
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, name_normalized, bedtime, streak, dream_code")
      .eq("id", sessionData.session.user.id)
      .maybeSingle()
    if (error || !data) return null
    const profile = readProfileRow(data)
    const { data: userData } = await supabase.auth.getUser()
    profile.emoji = emojiFromMetadata(userData.user?.app_metadata)
    return profile
  } catch {
    return null
  }
}

export async function persistPushSubscription(
  subscription: PushSubscription,
  timezone: string,
): Promise<boolean> {
  const json = subscription.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return false

  const supabase = getDreamBrowserClient()
  if (!supabase) return false
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return false

  const row = {
    user_id: sessionData.session.user.id,
    endpoint,
    p256dh,
    auth,
    timezone,
  }
  const direct = await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" })
  if (!direct.error) return true

  try {
    const res = await fetch("/api/dream/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({ endpoint, keys: { p256dh, auth }, timezone }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function signOutDreamSession(): Promise<void> {
  const supabase = getDreamBrowserClient()
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function persistDreamProfile(patch: {
  bedtime?: string
  timezone?: string
}): Promise<void> {
  const supabase = getDreamBrowserClient()
  if (!supabase) return
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return
  const next: { bedtime?: string; timezone?: string } = {}
  if (patch.bedtime !== undefined) next.bedtime = patch.bedtime
  if (patch.timezone !== undefined && isValidTimeZone(patch.timezone)) next.timezone = patch.timezone
  if (Object.keys(next).length === 0) return
  await supabase.from("profiles").update(next).eq("id", userData.user.id)
}

export async function postDreamAuth(
  action: "signup" | "login",
  body: { name: string; key: string[] },
): Promise<DreamAuthResult> {
  try {
    const res = await fetch(`/api/dream/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await res.json()) as {
      error?: string
      access_token?: string
      refresh_token?: string
      profile?: DreamProfile
    }
    if (!res.ok || !payload.access_token || !payload.refresh_token || !payload.profile) {
      return { ok: false, error: payload.error || DREAM_AUTH_FAIL }
    }
    const supabase = getDreamBrowserClient()
    if (!supabase) return { ok: false, error: DREAM_AUTH_FAIL }
    const { error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    })
    if (error) return { ok: false, error: DREAM_AUTH_FAIL }
    return { ok: true, profile: payload.profile }
  } catch {
    return { ok: false, error: DREAM_AUTH_FAIL }
  }
}
