import { createClient } from "@supabase/supabase-js"
import {
  displayName,
  emojiFromMetadata,
  isCuratedEmoji,
  normalizeEmoji,
  normalizeName,
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

function parseFindBody(raw: unknown): { nameNormalized: string; emoji: string } | null {
  if (!raw || typeof raw !== "object") return null
  const body = raw as { name?: unknown; emoji?: unknown }
  if (typeof body.name !== "string" || typeof body.emoji !== "string") return null
  const name = displayName(body.name)
  const nameNormalized = normalizeName(name)
  const emoji = normalizeEmoji(body.emoji)
  if (!nameNormalized || name.length > 40 || !isCuratedEmoji(emoji)) return null
  return { nameNormalized, emoji }
}

export async function handleDreamFind(request: Request) {
  if (!rateLimitDreamAuth(clientIp(request), "find")) return authRetry()
  if (!dreamAuthConfigured()) return authFail(503)

  const accessToken = readBearer(request)
  if (!accessToken) return authFail(401)

  const sender = await createDreamServerClient().auth.getUser(accessToken)
  if (sender.error || !sender.data.user) return authFail(401)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return authFail()
  }

  const parsed = parseFindBody(raw)
  if (!parsed) return authFail()

  const admin = serviceClient()
  if (!admin) return authFail(503)

  const profiles = await admin
    .from("profiles")
    .select("id, name")
    .eq("name_normalized", parsed.nameNormalized)
  if (profiles.error) {
    console.error("[dream/find]", profiles.error.message)
    return authFail()
  }

  let match: { id: string; name: string } | null = null
  for (const row of profiles.data ?? []) {
    if (!row.id || !row.name || row.id === sender.data.user.id) continue
    const user = await admin.auth.admin.getUserById(row.id)
    if (emojiFromMetadata(user.data.user?.app_metadata) !== parsed.emoji) continue
    match = { id: row.id as string, name: row.name as string }
    break
  }
  if (!match) return authFail()

  const { error } = await admin.from("connections").upsert(
    { from_id: sender.data.user.id, to_id: match.id, status: "accepted" },
    { onConflict: "from_id,to_id" },
  )
  if (error) {
    console.error("[dream/find]", error.message)
    return authFail()
  }

  return Response.json(match)
}
