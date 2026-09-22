import { createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import {
  DREAM_AUTH_FAIL,
  DREAM_AUTH_RETRY,
  displayName,
  isCuratedPrivateKey,
  normalizeName,
  parsePrivateKey,
  privateKeyMaterial,
} from "@/lib/dream-auth"

const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_MAX = 8

const attempts = new Map<string, { count: number; resetAt: number }>()

export type DreamAuthAction = "signup" | "login"

export type DreamAuthInput = {
  name: string
  nameNormalized: string
  key: string[]
}

export function dreamAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      process.env.DREAM_AUTH_PEPPER?.trim(),
  )
}

export function deriveSyntheticAuth(nameNormalized: string, key: string[]) {
  const pepper = process.env.DREAM_AUTH_PEPPER?.trim()
  if (!pepper) throw new Error("missing dream auth pepper")
  const material = `${nameNormalized}\n${privateKeyMaterial(key)}`
  const emailLocal = createHmac("sha256", pepper)
    .update("dream-email-v1\n")
    .update(material)
    .digest("hex")
    .slice(0, 32)
  const password = createHmac("sha256", pepper)
    .update("dream-password-v1\n")
    .update(material)
    .digest("hex")
  return {
    email: `${emailLocal}@users.dreamabt.me`,
    password,
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function rateLimitDreamAuth(ip: string, action: DreamAuthAction): boolean {
  const now = Date.now()
  const key = `${action}:${ip}`
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (current.count >= RATE_MAX) return false
  current.count += 1
  return true
}

export function parseDreamAuthBody(raw: unknown): DreamAuthInput | null {
  if (!raw || typeof raw !== "object") return null
  const body = raw as { name?: unknown; key?: unknown }
  if (typeof body.name !== "string") return null
  const name = displayName(body.name)
  const nameNormalized = normalizeName(name)
  if (!name || !nameNormalized || name.length > 40) return null
  const key = parsePrivateKey(body.key)
  if (!key || !isCuratedPrivateKey(key)) return null
  return { name, nameNormalized, key }
}

export function authFail(status = 400, message = DREAM_AUTH_FAIL) {
  return NextResponse.json({ error: message }, { status })
}

export function authRetry() {
  return authFail(429, DREAM_AUTH_RETRY)
}
