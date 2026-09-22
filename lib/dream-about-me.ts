export const DREAM_FONT = "'IM Fell French Canon', 'Iowan Old Style', Georgia, serif"

export type DreamKind = "image" | "quote" | "video"

export type GalleryItem = {
  id: string
  kind: DreamKind
  quote?: string
  imageUrl?: string
  videoUrl?: string
}

export type PersonStatus = "connected" | "pending-out" | "pending-in"

export type Person = {
  id: string
  name: string
  status: PersonStatus
  /** Status of the last dream you sent them. */
  sentStatus?: "waiting" | "seen"
}

export type PendingDream = {
  item: GalleryItem
  fromName?: string
}

export type VideoKind = "youtube" | "tiktok" | "instagram" | "link"

export type ParsedVideo = {
  kind: VideoKind
  url: string
  embedSrc?: string
  thumbSrc?: string
  label: string
}

export const BEDTIMES: string[] = (() => {
  const mins = [0, 15, 30, 45]
  const out: string[] = []
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  for (const h of [7, 8, 9, 10, 11]) {
    for (const m of mins) out.push(`${h}:${pad(m)} pm`)
  }
  for (const h of [12, 1, 2]) {
    for (const m of mins) out.push(`${h}:${pad(m)} am`)
  }
  out.push("3:00 am")
  return out
})()

export const DEFAULT_BEDTIME = "11:00 pm"

function youtubeHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "")
  return (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  )
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0]
      return id || null
    }
    if (youtubeHost(u.hostname)) {
      if (u.searchParams.get("v")) return u.searchParams.get("v")
      const parts = u.pathname.split("/").filter(Boolean)
      if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
        return parts[1] || null
      }
    }
  } catch {
    return null
  }
  return null
}

function tiktokId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    if (!host.endsWith("tiktok.com")) return null
    const parts = u.pathname.split("/").filter(Boolean)
    const videoAt = parts.indexOf("video")
    if (videoAt >= 0 && parts[videoAt + 1]) return parts[videoAt + 1]
  } catch {
    return null
  }
  return null
}

function instagramCode(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    const normalized = host.replace(/^m\./, "")
    if (normalized !== "instagram.com" && normalized !== "instagr.am") return null
    const parts = u.pathname.split("/").filter(Boolean)
    if ((parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels" || parts[0] === "tv") && parts[1]) {
      return parts[1]
    }
  } catch {
    return null
  }
  return null
}

export function isHttpUrl(raw: string): boolean {
  try {
    const protocol = new URL(raw.trim()).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function parseVideoUrl(raw: string): ParsedVideo {
  const url = raw.trim()
  const yt = youtubeId(url)
  if (yt) {
    return {
      kind: "youtube",
      url,
      embedSrc: `https://www.youtube.com/embed/${yt}`,
      thumbSrc: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      label: "youtube",
    }
  }
  const tk = tiktokId(url)
  if (tk) {
    return {
      kind: "tiktok",
      url,
      embedSrc: `https://www.tiktok.com/embed/v2/${tk}`,
      label: "tiktok",
    }
  }
  const ig = instagramCode(url)
  if (ig) {
    return {
      kind: "instagram",
      url,
      embedSrc: `https://www.instagram.com/p/${ig}/embed`,
      label: "instagram",
    }
  }
  return { kind: "link", url: isHttpUrl(url) ? url : "", label: "video" }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `d-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const DEMO_GALLERY: GalleryItem[] = [
  {
    id: "demo-quote",
    kind: "quote",
    quote: "leave the window a little open.",
  },
  {
    id: "demo-video",
    kind: "video",
    videoUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
  },
]

export const DEMO_PEOPLE: Person[] = [
  { id: "macy", name: "macy", status: "connected", sentStatus: "seen" },
  { id: "sam", name: "sam", status: "pending-out" },
  { id: "jordan", name: "jordan", status: "pending-in" },
]

export const DEMO_PENDING: PendingDream = {
  fromName: "macy",
  item: {
    id: "tonight",
    kind: "quote",
    quote: "i hope you sleep.",
  },
}
