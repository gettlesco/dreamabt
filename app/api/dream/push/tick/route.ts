import { NextResponse } from "next/server"
import { tickDreamPushes } from "@/lib/dream-push-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = request.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true
  const query = new URL(request.url).searchParams.get("secret")
  return query === secret
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await tickDreamPushes()
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
