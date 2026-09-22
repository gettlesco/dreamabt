import { dreamNightDate } from "@/lib/dream-bedtime"
import { localTimeZone } from "@/lib/dream-pwa"
import { isHttpUrl, type DreamItem, type Person } from "@/lib/dream-about-me"
import { getDreamBrowserClient } from "@/lib/dream-supabase"
import { blobFromImageUrl, prepareDreamImage } from "@/lib/dream-image"

type InviteProfile = { id: string; name: string }

type SendDreamResult = {
  ok?: boolean
  replaced_paths?: string[]
}

type RevealDreamResult = {
  ok?: boolean
  opened?: boolean
  streak?: number
}

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
  return dreamNightDate(timeZone)
}

function nightForZone(timeZone: string | null | undefined): string | null {
  const zone = timeZone?.trim()
  if (!zone) return null
  try {
    return dreamNightDate(zone)
  } catch {
    return null
  }
}

async function serverNights(ids: string[]): Promise<Map<string, string>> {
  const nights = new Map<string, string>()
  if (!ids.length) return nights
  const supabase = client()
  if (!supabase) return nights
  const { data, error } = await supabase.rpc("connected_dream_nights", { p_ids: ids })
  if (error || !Array.isArray(data)) return nights
  for (const row of data as { user_id?: string; night_date?: string | null }[]) {
    if (row.user_id && row.night_date) nights.set(row.user_id, row.night_date)
  }
  return nights
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

export async function hasAcceptedInvite(fromId: string): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user || userData.user.id === fromId) return false
  const { data } = await supabase
    .from("connections")
    .select("id")
    .eq("from_id", fromId)
    .eq("to_id", userData.user.id)
    .eq("status", "accepted")
    .maybeSingle()
  return Boolean(data)
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
  const zones = new Map<string, string | null>()
  if (otherIds.length) {
    const profiles = await supabase.from("profiles").select("id, name, timezone").in("id", otherIds)
    for (const profile of profiles.data || []) {
      const id = profile.id as string
      names.set(id, profile.name as string)
      zones.set(id, (profile.timezone as string | null) ?? null)
    }
  }
  const nights = await serverNights(otherIds)
  for (const id of otherIds) {
    if (nights.has(id)) continue
    const night = nightForZone(zones.get(id))
    if (night) nights.set(id, night)
  }

  const sentStatus = new Map<string, "waiting" | "seen">()
  if (otherIds.length) {
    const { data: sent } = await supabase
      .from("dreams")
      .select("recipient_id, night_date, revealed_at, expires_at")
      .eq("sender_id", me)
      .in("recipient_id", otherIds)
      .gt("expires_at", new Date().toISOString())
    for (const dream of sent || []) {
      const recipientId = dream.recipient_id as string
      if (dream.night_date !== nights.get(recipientId)) continue
      sentStatus.set(recipientId, dream.revealed_at ? "seen" : "waiting")
    }
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

async function authedDreamPost(path: string, body: unknown): Promise<Response | null> {
  const supabase = client()
  if (!supabase) return null
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return null
  try {
    return await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

export async function saveDreamEmoji(input: { emoji: string } | { assign: true }): Promise<string | null> {
  const res = await authedDreamPost("/api/dream/emoji", input)
  if (!res) return null
  const payload = (await res.json()) as { emoji?: string }
  if (!res.ok || !payload.emoji) return null
  return payload.emoji
}

export async function findDreamRecipient(
  name: string,
  emoji: string,
): Promise<{ id: string; name: string } | null> {
  const res = await authedDreamPost("/api/dream/find", { name, emoji })
  if (!res) return null
  const payload = (await res.json()) as { id?: string; name?: string }
  if (!res.ok || !payload.id || !payload.name) return null
  return { id: payload.id, name: payload.name }
}

export async function setSoloDream(item: DreamItem): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const userId = userData.user.id

  if (item.kind === "video" && (!item.videoUrl || !isHttpUrl(item.videoUrl))) return false
  if (item.kind === "quote" && !item.quote?.trim()) return false
  if (item.kind === "image" && !item.imageUrl) return false

  await supabase.from("profiles").update({ timezone: localTimeZone() }).eq("id", userId)

  let imagePath: string | null = null
  if (item.kind === "image" && item.imageUrl) {
    const blob = await blobFromImageUrl(item.imageUrl)
    if (!blob) return false
    imagePath = await uploadImage(userId, crypto.randomUUID(), blob)
  }

  const { data, error } = await supabase.rpc("set_solo_dream", {
    p_kind: item.kind,
    p_quote: item.kind === "quote" ? item.quote?.trim() ?? null : null,
    p_video_url: item.kind === "video" ? item.videoUrl?.trim() ?? null : null,
    p_image_path: imagePath,
    p_thumb_path: null,
  })
  const result = (data ?? null) as SendDreamResult | null
  if (error || !result?.ok) {
    if (imagePath) await supabase.storage.from("dreams").remove([imagePath])
    return false
  }

  const stale = (result.replaced_paths || []).filter(
    (path) => Boolean(path) && path !== imagePath && path.startsWith(`${userId}/`),
  )
  if (stale.length) await supabase.storage.from("dreams").remove(stale)
  return true
}

export async function sendDreamItem(item: DreamItem, recipientId: string): Promise<boolean> {
  const supabase = client()
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const senderId = userData.user.id
  if (senderId === recipientId) return false

  if (item.kind === "video" && (!item.videoUrl || !isHttpUrl(item.videoUrl))) return false
  if (item.kind === "quote" && !item.quote?.trim()) return false
  if (item.kind === "image" && !item.imageUrl) return false

  let imagePath: string | null = null
  if (item.kind === "image" && item.imageUrl) {
    const blob = await blobFromImageUrl(item.imageUrl)
    if (!blob) return false
    imagePath = await uploadImage(senderId, crypto.randomUUID(), blob)
  }

  const { data, error } = await supabase.rpc("send_dream", {
    p_recipient: recipientId,
    p_kind: item.kind,
    p_quote: item.kind === "quote" ? item.quote?.trim() ?? null : null,
    p_video_url: item.kind === "video" ? item.videoUrl?.trim() ?? null : null,
    p_image_path: imagePath,
    p_thumb_path: null,
  })
  const result = (data ?? null) as SendDreamResult | null
  if (error || !result?.ok) {
    if (imagePath) await supabase.storage.from("dreams").remove([imagePath])
    return false
  }

  const stale = (result.replaced_paths || []).filter(
    (path) => Boolean(path) && path !== imagePath && path.startsWith(`${senderId}/`),
  )
  if (stale.length) await supabase.storage.from("dreams").remove(stale)
  return true
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
  item: DreamItem
  fromName?: string
  revealed: boolean
  solo: boolean
} | null> {
  const supabase = client()
  if (!supabase) return null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const tz = localTimeZone()
  await supabase.from("profiles").update({ timezone: tz }).eq("id", userData.user.id)
  const nights = await serverNights([userData.user.id])
  const nightDate = nights.get(userData.user.id) ?? nightDateFor(tz)
  const { data } = await supabase
    .from("dreams")
    .select("id, sender_id, kind, quote, video_url, image_path, thumb_path, revealed_at, expires_at")
    .eq("recipient_id", userData.user.id)
    .neq("sender_id", userData.user.id)
    .eq("night_date", nightDate)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) {
    const row = data as DreamRow
    const fullUrl = await signedUrl(row.image_path)
    const profile = await supabase.from("profiles").select("name").eq("id", row.sender_id).maybeSingle()
    return {
      id: row.id,
      solo: false,
      fromName: (profile.data?.name as string | undefined) || undefined,
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

  const solo = await supabase
    .from("solo_dreams")
    .select("kind, quote, video_url, image_path")
    .eq("user_id", userData.user.id)
    .maybeSingle()
  if (!solo.data) return null
  const kept = solo.data as {
    kind: DreamRow["kind"]
    quote: string | null
    video_url: string | null
    image_path: string | null
  }
  const fullUrl = await signedUrl(kept.image_path)
  return {
    id: userData.user.id,
    solo: true,
    revealed: false,
    item: {
      id: userData.user.id,
      kind: kept.kind,
      quote: kept.quote ?? undefined,
      videoUrl: kept.video_url ?? undefined,
      imageUrl: fullUrl,
    },
  }
}

export async function revealSoloDream(): Promise<{ opened: boolean; streak: number } | null> {
  const supabase = client()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("reveal_solo_dream")
  if (error || !data || typeof data !== "object") return null
  const result = data as RevealDreamResult
  if (!result.ok || typeof result.streak !== "number") return null
  return { opened: Boolean(result.opened), streak: result.streak }
}

export async function revealTonightDream(
  dreamId: string,
): Promise<{ opened: boolean; streak: number } | null> {
  const supabase = client()
  if (!supabase) return null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase.rpc("reveal_dream", { p_dream_id: dreamId })
  if (error || !data || typeof data !== "object") return null
  const result = data as RevealDreamResult
  if (!result.ok || typeof result.streak !== "number") return null
  return { opened: Boolean(result.opened), streak: result.streak }
}

