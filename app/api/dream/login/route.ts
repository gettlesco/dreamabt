import { handleDreamAuth } from "@/lib/dream-auth-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleDreamAuth(request, "login")
}
