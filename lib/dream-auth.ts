export const PRIVATE_KEY_LENGTH = 3

/** Provisional. Replace when the final curated private-key grid is provided. */
export const PRIVATE_KEY_EMOJIS = [
  "🌸",
  "🌷",
  "🌹",
  "🌺",
  "🍒",
  "🍓",
  "🍎",
  "🍉",
  "🩷",
  "❤️",
  "🎀",
  "🦩",
  "🐸",
  "🍀",
  "🌿",
  "🌱",
  "🌲",
  "🥑",
  "🍏",
  "🍐",
  "🐢",
  "🥝",
  "💚",
  "🪴",
].map(normalizeEmoji)

const PRIVATE_KEY_SET = new Set(PRIVATE_KEY_EMOJIS)

export const DREAM_AUTH_FAIL = "that didn't work."
export const DREAM_AUTH_RETRY = "try again later."

export type DreamProfile = {
  id: string
  name: string
  nameNormalized: string
  bedtime: string | null
  streak: number
  dreamCode: string | null
  emoji: string | null
}

export function normalizeEmoji(raw: string): string {
  return raw.normalize("NFC").replace(/\uFE0E|\uFE0F/g, "")
}

function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)].map(
      (part) => part.segment,
    )
  }
  return [...value]
}

export function displayName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ")
}

export function normalizeName(raw: string): string {
  return displayName(raw).toLowerCase()
}

export function normalizePrivateKey(emojis: string[]): string[] {
  return emojis.map(normalizeEmoji).filter((part) => part.length > 0)
}

export function parsePrivateKey(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    const parts = normalizePrivateKey(raw.filter((part): part is string => typeof part === "string"))
    return parts.length ? parts : null
  }
  if (typeof raw !== "string") return null
  const parts = graphemes(raw)
    .map(normalizeEmoji)
    .filter((part) => part.trim().length > 0)
  return parts.length ? parts : null
}

export function isCuratedPrivateKey(emojis: string[]): boolean {
  const parts = normalizePrivateKey(emojis)
  return parts.length === PRIVATE_KEY_LENGTH && parts.every((part) => PRIVATE_KEY_SET.has(part))
}

export function isCuratedEmoji(emoji: string): boolean {
  return PRIVATE_KEY_SET.has(normalizeEmoji(emoji))
}

export function emojiFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const emoji = (metadata as { emoji?: unknown }).emoji
  if (typeof emoji !== "string") return null
  const normalized = normalizeEmoji(emoji)
  return isCuratedEmoji(normalized) ? normalized : null
}

export function privateKeyMaterial(emojis: string[]): string {
  return normalizePrivateKey(emojis).join("\u241f")
}

export function readProfileRow(row: {
  id: string
  name: string
  name_normalized: string
  bedtime: string | null
  streak: number
  dream_code: string | null
  emoji?: string | null
}): DreamProfile {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    bedtime: row.bedtime,
    streak: row.streak,
    dreamCode: row.dream_code,
    emoji: row.emoji ?? null,
  }
}
