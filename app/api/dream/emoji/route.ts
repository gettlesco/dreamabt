import { handleDreamEmoji } from "@/lib/dream-emoji-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleDreamEmoji(request)
}
