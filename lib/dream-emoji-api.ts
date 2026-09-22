import { randomInt } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  PRIVATE_KEY_EMOJIS,
  emojiFromMetadata,
  isCuratedEmoji,
  normalizeEmoji,
} from "@/lib/dream-auth"
import {
  authFail,
  authRetry,
  clientIp,
  dreamAuthConfigured,
  rateLimitDreamAuth,
} from "@/lib/dream-auth-server"
import { createDreamServerClient } from "@/lib/dream-supabase"

function readBearer(request: Request) {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseEmojiBody(raw: unknown): { emoji: string } | { assign: true } | null {
  if (!raw || typeof raw !== "object") return null
  const body = raw as { emoji?: unknown; assign?: unknown }
  if (body.assign === true) return { assign: true }
  if (typeof body.emoji !== "string") return null
  const emoji = normalizeEmoji(body.emoji)
  if (!isCuratedEmoji(emoji)) return null
  return { emoji }
}

export async function handleDreamEmoji(request: Request) {
  if (!rateLimitDreamAuth(clientIp(request), "emoji")) return authRetry()
  if (!dreamAuthConfigured()) return authFail(503)

  const accessToken = readBearer(request)
  if (!accessToken) return authFail(401)

  const session = await createDreamServerClient().auth.getUser(accessToken)
  if (session.error || !session.data.user) return authFail(401)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return authFail()
  }
  const parsed = parseEmojiBody(raw)
  if (!parsed) return authFail()

  const admin = serviceClient()
  if (!admin) return authFail(503)

  const me = await admin
    .from("profiles")
    .select("id, name_normalized")
    .eq("id", session.data.user.id)
    .maybeSingle()
  if (me.error || !me.data?.name_normalized) {
    if (me.error) console.error("[dream/emoji]", me.error.message)
    return authFail()
  }

  const emoji = await claimEmoji(
    admin,
    me.data.id as string,
    me.data.name_normalized as string,
    "emoji" in parsed ? parsed.emoji : null,
  )
  if (!emoji) return authFail()
  return Response.json({ emoji })
}

async function claimEmoji(
  admin: NonNullable<ReturnType<typeof serviceClient>>,
  userId: string,
  nameNormalized: string,
  requested: string | null,
): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const taken = await takenEmojis(admin, nameNormalized, userId)
    if (!taken) return null
    const emoji = requested ?? pickOpenEmoji(taken)
    if (!emoji || taken.has(emoji)) return null
    const saved = await writeEmoji(admin, userId, emoji)
    if (!saved) return null
    const again = await takenEmojis(admin, nameNormalized, userId)
    if (again && !again.has(saved)) return saved
    if (requested) return null
  }
  return null
}

async function takenEmojis(
  admin: SupabaseClient,
  nameNormalized: string,
  exceptId: string,
): Promise<Set<string> | null> {
  const rows = await admin.from("profiles").select("id").eq("name_normalized", nameNormalized)
  if (rows.error) {
    console.error("[dream/emoji]", rows.error.message)
    return null
  }
  const taken = new Set<string>()
  for (const row of rows.data ?? []) {
    if (row.id === exceptId) continue
    const emoji = await readEmoji(admin, row.id as string)
    if (emoji) taken.add(emoji)
  }
  return taken
}

async function readEmoji(admin: SupabaseClient, userId: string): Promise<string | null> {
  const user = await admin.auth.admin.getUserById(userId)
  if (user.error) return null
  return emojiFromMetadata(user.data.user?.app_metadata)
}

async function writeEmoji(admin: SupabaseClient, userId: string, emoji: string): Promise<string | null> {
  const current = await admin.auth.admin.getUserById(userId)
  if (current.error || !current.data.user) {
    if (current.error) console.error("[dream/emoji]", current.error.message)
    return null
  }
  const updated = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...current.data.user.app_metadata, emoji },
  })
  if (updated.error) {
    console.error("[dream/emoji]", updated.error.message)
    return null
  }
  return emojiFromMetadata(updated.data.user.app_metadata)
}

function pickOpenEmoji(taken: Set<string>): string | null {
  const open = PRIVATE_KEY_EMOJIS.filter((emoji) => !taken.has(emoji))
  if (!open.length) return null
  return open[randomInt(open.length)] ?? null
}
