import { zonedClock } from "@/lib/dream-bedtime"
import { localTimeZone } from "@/lib/dream-pwa"
import type { GalleryItem, Person } from "@/lib/dream-about-me"
import { getDreamBrowserClient } from "@/lib/dream-supabase"
import { blobFromImageUrl, prepareDreamImage } from "@/lib/dream-image"

const SEE_MS = 10 * 60 * 1000
const MAX_MS = 2 * 24 * 60 * 60 * 1000

type InviteProfile = { id: string; name: string }

type DreamRow = {
  id: string
  sender_id: string
  recipient_id: string
  kind: "image" | "quote" | "video"
  quote: string | null
  video_url: string | null
  image_path: string | null
  thumb_path: string | null
  night_date: string
  revealed_at: string | null
  expires_at: string
}

function client() {
  return getDreamBrowserClient()
}

export function nightDateFor(timeZone = localTimeZone()) {
  return zonedClock(timeZone).dateKey
}

export async function ensureDreamCode(): Promise<string | null> {
  const supabase = client()
  if (!supabase) return null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const existing = await supabase
    .from("profiles")
    .select("dream_code")
    .eq("id", userData.user.id)
    .maybeSingle()
  if (existing.data?.dream_code) return existing.data.dream_code as string

  const alphabet = "abcdefghijklmnopqrstuvwxyz23456789"
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join("")
    const updated = await supabase
      .from("profiles")
      .update({ dream_code: code })
      .eq("id", userData.user.id)
      .is("dream_code", null)
      .select("dream_code")
      .maybeSingle()
    if (updated.data?.dream_code) return updated.data.dream_code as string
    const again = await supabase
      .from("profiles")
      .select("dream_code")
      .eq("id", userData.user.id)
      .maybeSingle()
    if (again.data?.dream_code) return again.data.dream_code as string
  }
  return null
}

export async function lookupInvite(code: string): Promise<InviteProfile | null> {
  const supabase = client()
  if (!supabase) return null
  const trimmed = code.trim().toLowerCase()
  if (!trimmed || trimmed === "1") return null
  const { data, error } = await supabase.rpc("lookup_invite", { code: trimmed })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id || !row?.name) return null
  return { id: row.id as string, name: row.name as string }
}

export async function acceptInvite(fromId: string): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user || userData.user.id === fromId) return false
  const { error } = await supabase.from("connections").upsert(
    { from_id: fromId, to_id: userData.user.id, status: "accepted" },
    { onConflict: "from_id,to_id" },
  )
  return !error
}

export async function loadPeople(): Promise<Person[]> {
  const supabase = client()
  if (!supabase) return []
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return []
  const me = userData.user.id

  const { data: rows } = await supabase
    .from("connections")
    .select("id, from_id, to_id, status")
    .or(`from_id.eq.${me},to_id.eq.${me}`)

  const list = rows || []
  const otherIds = [...new Set(list.map((row) => (row.from_id === me ? row.to_id : row.from_id)))]
  const names = new Map<string, string>()
  if (otherIds.length) {
    const profiles = await supabase.from("profiles").select("id, name").in("id", otherIds)
    for (const profile of profiles.data || []) {
      names.set(profile.id as string, profile.name as string)
    }
  }

  const tonight = nightDateFor()
  const { data: sent } = await supabase
    .from("dreams")
    .select("recipient_id, revealed_at, expires_at")
    .eq("sender_id", me)
    .eq("night_date", tonight)
    .gt("expires_at", new Date().toISOString())

  const sentStatus = new Map<string, "waiting" | "seen">()
  for (const dream of sent || []) {
    sentStatus.set(
      dream.recipient_id as string,
      dream.revealed_at ? "seen" : "waiting",
    )
  }

  const people: Person[] = []
  for (const row of list) {
    if (row.from_id === me && row.status === "accepted") {
      const id = row.to_id as string
      people.push({
        id,
        name: names.get(id) || "someone",
        status: "connected",
        sentStatus: sentStatus.get(id),
      })
    } else if (row.to_id === me && row.status === "pending") {
      const id = row.from_id as string
      people.push({
        id,
        name: names.get(id) || "someone",
        status: "pending-in",
      })
    }
  }
  return people
}

async function recipientTimezone(recipientId: string): Promise<string> {
  const supabase = client()
  if (!supabase) return localTimeZone()
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", recipientId)
    .maybeSingle()
  return (data?.timezone as string | null) || localTimeZone()
}

async function uploadImage(userId: string, dreamId: string, source: Blob) {
  const supabase = client()
  if (!supabase) throw new Error("not signed in")
  const jpeg = await prepareDreamImage(source)
  const imagePath = `${userId}/${dreamId}/full.jpg`
  const full = await supabase.storage.from("dreams").upload(imagePath, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
  })
  if (full.error) throw full.error
  return imagePath
}

export async function sendDreamItem(item: GalleryItem, recipientId: string): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const senderId = userData.user.id
  const tz = await recipientTimezone(recipientId)
  const nightDate = nightDateFor(tz)
  const now = Date.now()

  const existing = await supabase
    .from("dreams")
    .select("id, revealed_at, image_path, thumb_path")
    .eq("recipient_id", recipientId)
    .eq("night_date", nightDate)
    .gt("expires_at", new Date(now).toISOString())

  const revealed = (existing.data || []).find((row) => row.revealed_at)
  if (revealed) return false

  const stale = (existing.data || []).filter((row) => !row.revealed_at)
  for (const row of stale) {
    const paths = [row.image_path, row.thumb_path].filter((path): path is string => Boolean(path))
    if (paths.length) await supabase.storage.from("dreams").remove(paths)
    await supabase.from("dreams").delete().eq("id", row.id)
  }

  const id = crypto.randomUUID()
  let imagePath: string | null = null
  if (item.kind === "image") {
    if (!item.imageUrl) return false
    const blob = await blobFromImageUrl(item.imageUrl)
    if (!blob) return false
    imagePath = await uploadImage(senderId, id, blob)
  }

  const { error } = await supabase.from("dreams").insert({
    id,
    sender_id: senderId,
    recipient_id: recipientId,
    kind: item.kind,
    quote: item.kind === "quote" ? item.quote ?? null : null,
    video_url: item.kind === "video" ? item.videoUrl ?? null : null,
    image_path: imagePath,
    night_date: nightDate,
    expires_at: new Date(now + MAX_MS).toISOString(),
  })
  return !error
}

async function signedUrl(path: string | null): Promise<string | undefined> {
  if (!path) return undefined
  const supabase = client()
  if (!supabase) return undefined
  const { data } = await supabase.storage.from("dreams").createSignedUrl(path, 60 * 15)
  return data?.signedUrl
}

export async function loadTonightDream(): Promise<{
  id: string
  item: GalleryItem
  fromName?: string
  revealed: boolean
} | null> {
  const supabase = client()
  if (!supabase) return null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const tz = localTimeZone()
  await supabase.from("profiles").update({ timezone: tz }).eq("id", userData.user.id)
  const nightDate = nightDateFor(tz)
  const { data } = await supabase
    .from("dreams")
    .select("id, sender_id, kind, quote, video_url, image_path, thumb_path, revealed_at, expires_at")
    .eq("recipient_id", userData.user.id)
    .eq("night_date", nightDate)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as DreamRow
  const fullUrl = await signedUrl(row.image_path)
  let fromName: string | undefined
  if (row.sender_id !== userData.user.id) {
    const profile = await supabase.from("profiles").select("name").eq("id", row.sender_id).maybeSingle()
    fromName = (profile.data?.name as string | undefined) || undefined
  }
  return {
    id: row.id,
    fromName,
    revealed: Boolean(row.revealed_at),
    item: {
      id: row.id,
      kind: row.kind,
      quote: row.quote ?? undefined,
      videoUrl: row.video_url ?? undefined,
      imageUrl: fullUrl,
    },
  }
}

export async function revealTonightDream(dreamId: string): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const now = new Date()
  const { error } = await supabase
    .from("dreams")
    .update({
      revealed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SEE_MS).toISOString(),
    })
    .eq("id", dreamId)
    .eq("recipient_id", userData.user.id)
    .is("revealed_at", null)
  return !error
}

