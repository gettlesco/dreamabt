export const DREAM_FONT = "'IM Fell French Canon', 'Iowan Old Style', Georgia, serif"

export type DreamKind = "image" | "quote" | "video"

export type DreamItem = {
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
  item: DreamItem
  fromName?: string
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

export function isHttpUrl(raw: string): boolean {
  try {
    const protocol = new URL(raw.trim()).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export type TextPart = { kind: "text" | "link"; value: string }

function peelTrailing(raw: string): { href: string; rest: string } {
  let href = raw
  let rest = ""
  while (href.length > 0 && /[.,!?;:]$/.test(href)) {
    rest = href.slice(-1) + rest
    href = href.slice(0, -1)
  }
  let open = 0
  let close = 0
  for (const ch of href) {
    if (ch === "(") open += 1
    else if (ch === ")") close += 1
  }
  while (close > open && href.endsWith(")")) {
    rest = `)${rest}`
    href = href.slice(0, -1)
    close -= 1
  }
  return { href, rest }
}

export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  const re = /https?:\/\/[^\s<>"']+/gi
  let last = 0
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0
    const raw = match[0]
    if (index > last) parts.push({ kind: "text", value: text.slice(last, index) })
    const { href, rest } = peelTrailing(raw)
    if (isHttpUrl(href)) {
      parts.push({ kind: "link", value: href })
      if (rest) parts.push({ kind: "text", value: rest })
    } else {
      parts.push({ kind: "text", value: raw })
    }
    last = index + raw.length
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) })
  if (parts.length === 0) parts.push({ kind: "text", value: text })
  return parts
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `d-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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
