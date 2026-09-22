import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  DREAM_AUTH_FAIL,
  readProfileRow,
  type DreamProfile,
} from "@/lib/dream-auth"

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
    return readProfileRow(data)
  } catch {
    return null
  }
}

export async function persistDreamProfile(patch: {
  bedtime?: string
  streak?: number
}): Promise<void> {
  const supabase = getDreamBrowserClient()
  if (!supabase) return
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return
  const next: { bedtime?: string; streak?: number } = {}
  if (patch.bedtime !== undefined) next.bedtime = patch.bedtime
  if (patch.streak !== undefined) next.streak = patch.streak
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
