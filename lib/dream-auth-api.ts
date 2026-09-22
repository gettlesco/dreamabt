import { NextResponse } from "next/server"
import { readProfileRow, type DreamProfile } from "@/lib/dream-auth"
import {
  authFail,
  authRetry,
  clientIp,
  deriveSyntheticAuth,
  dreamAuthConfigured,
  parseDreamAuthBody,
  rateLimitDreamAuth,
  type DreamAuthAction,
} from "@/lib/dream-auth-server"
import { createDreamServerClient } from "@/lib/dream-supabase"
import { DEFAULT_BEDTIME } from "@/lib/dream-about-me"

type ProfileRow = {
  id: string
  name: string
  name_normalized: string
  bedtime: string | null
  streak: number
  dream_code: string | null
}

function sessionPayload(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  profile: DreamProfile,
) {
  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    profile,
  })
}

async function loadOrCreateProfile(
  supabase: ReturnType<typeof createDreamServerClient>,
  userId: string,
  name: string,
  nameNormalized: string,
): Promise<ProfileRow | null> {
  const existing = await supabase
    .from("profiles")
    .select("id, name, name_normalized, bedtime, streak, dream_code")
    .eq("id", userId)
    .maybeSingle()
  if (existing.data) return existing.data as ProfileRow
  const inserted = await supabase
    .from("profiles")
    .insert({
      id: userId,
      name,
      name_normalized: nameNormalized,
      bedtime: DEFAULT_BEDTIME,
      streak: 0,
    })
    .select("id, name, name_normalized, bedtime, streak, dream_code")
    .single()
  if (inserted.error || !inserted.data) return null
  return inserted.data as ProfileRow
}

export async function handleDreamAuth(request: Request, action: DreamAuthAction) {
  if (!rateLimitDreamAuth(clientIp(request), action)) return authRetry()
  if (!dreamAuthConfigured()) return authFail(503)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return authFail()
  }

  const parsed = parseDreamAuthBody(raw)
  if (!parsed) return authFail()

  const { email, password } = deriveSyntheticAuth(parsed.nameNormalized, parsed.key)
  const supabase = createDreamServerClient()

  if (action === "signup") {
    const signed = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: parsed.name } },
    })
    if (signed.error || !signed.data.session || !signed.data.user) {
      if (signed.error) console.error("[dream/signup]", signed.error.message)
      return authFail()
    }
    await supabase.auth.setSession({
      access_token: signed.data.session.access_token,
      refresh_token: signed.data.session.refresh_token,
    })
    const profile = await loadOrCreateProfile(
      supabase,
      signed.data.user.id,
      parsed.name,
      parsed.nameNormalized,
    )
    if (!profile) return authFail()
    return sessionPayload(
      signed.data.session.access_token,
      signed.data.session.refresh_token,
      signed.data.session.expires_in,
      readProfileRow(profile),
    )
  }

  const signed = await supabase.auth.signInWithPassword({ email, password })
  if (signed.error || !signed.data.session || !signed.data.user) {
    return authFail()
  }
  await supabase.auth.setSession({
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
  })
  const profile = await loadOrCreateProfile(
    supabase,
    signed.data.user.id,
    parsed.name,
    parsed.nameNormalized,
  )
  if (!profile) return authFail()
  return sessionPayload(
    signed.data.session.access_token,
    signed.data.session.refresh_token,
    signed.data.session.expires_in,
    readProfileRow(profile),
  )
}
