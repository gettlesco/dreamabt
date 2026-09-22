import { randomBytes } from "node:crypto"
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
  if (existing.data) {
    const row = existing.data as ProfileRow
    if (row.dream_code) return row
    const code = newDreamCode()
    const updated = await supabase
      .from("profiles")
      .update({ dream_code: code })
      .eq("id", userId)
      .select("id, name, name_normalized, bedtime, streak, dream_code")
      .single()
    return (updated.data as ProfileRow) || row
  }
  const inserted = await supabase
    .from("profiles")
    .insert({
      id: userId,
      name,
      name_normalized: nameNormalized,
      bedtime: DEFAULT_BEDTIME,
      streak: 0,
      dream_code: newDreamCode(),
    })
    .select("id, name, name_normalized, bedtime, streak, dream_code")
    .single()
  if (inserted.error || !inserted.data) return null
  return inserted.data as ProfileRow
}

function newDreamCode() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz23456789"
  return [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join("")
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

  let session = null as Awaited<
    ReturnType<typeof supabase.auth.signInWithPassword>
  >["data"]["session"]
  let user = null as Awaited<
    ReturnType<typeof supabase.auth.signInWithPassword>
  >["data"]["user"]

  if (action === "signup") {
    const signed = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: parsed.name } },
    })
    if (signed.data.session && signed.data.user) {
      session = signed.data.session
      user = signed.data.user
    } else if (signed.error) {
      console.error("[dream/signup]", signed.error.message)
      const message = signed.error.message.toLowerCase()
      if (message.includes("already") || message.includes("registered")) {
        return authFail()
      }
    }
  }

  if (!session || !user) {
    const signed = await supabase.auth.signInWithPassword({ email, password })
    if (signed.error || !signed.data.session || !signed.data.user) {
      return authFail()
    }
    session = signed.data.session
    user = signed.data.user
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  const profile = await loadOrCreateProfile(
    supabase,
    user.id,
    parsed.name,
    parsed.nameNormalized,
  )
  if (!profile) {
    console.error("[dream/auth] profile missing after session")
    return authFail()
  }
  return sessionPayload(
    session.access_token,
    session.refresh_token,
    session.expires_in,
    readProfileRow(profile),
  )
}
