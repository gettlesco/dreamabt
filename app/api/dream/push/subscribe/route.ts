import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createDreamServerClient } from "@/lib/dream-supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
  timezone?: unknown
}

function readBearer(request: Request) {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

export async function POST(request: Request) {
  const accessToken = readBearer(request)
  if (!accessToken) return NextResponse.json({ error: "no session" }, { status: 401 })

  let raw: Body
  try {
    raw = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 })
  }

  const endpoint = typeof raw.endpoint === "string" ? raw.endpoint.trim() : ""
  const p256dh = typeof raw.keys?.p256dh === "string" ? raw.keys.p256dh.trim() : ""
  const auth = typeof raw.keys?.auth === "string" ? raw.keys.auth.trim() : ""
  const timezone = typeof raw.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim() : "UTC"
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "bad subscription" }, { status: 400 })
  }

  const config = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  }
  if (!config.url || !config.anonKey) {
    return NextResponse.json({ error: "not configured" }, { status: 503 })
  }

  const supabase = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const user = await createDreamServerClient().auth.getUser(accessToken)
  if (user.error || !user.data.user) {
    return NextResponse.json({ error: "no session" }, { status: 401 })
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.data.user.id,
      endpoint,
      p256dh,
      auth,
      timezone,
    },
    { onConflict: "endpoint" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
