import { handleDreamFind } from "@/lib/dream-find-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleDreamFind(request)
}
