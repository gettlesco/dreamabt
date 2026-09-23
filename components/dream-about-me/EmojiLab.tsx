import { useEffect, useState } from "react"
import { PRIVATE_KEY_EMOJIS, normalizeEmoji, parseEmojiList } from "@/lib/dream-auth"
import styles from "./dream.module.css"

const STORAGE_KEY = "dream-emoji-lab"
const TEXT_MARKS = new Set([0x2764, 0x2601, 0x2600, 0x270f, 0x2663])

function canKeep(emoji: string) {
  const part = normalizeEmoji(emoji)
  if (!part.trim()) return false
  if (/^[\s\w.,!?'"/-]+$/u.test(part)) return false
  const marks = [...part]
  return !(marks.length === 1 && TEXT_MARKS.has(marks[0].codePointAt(0) ?? 0))
}

function unique(emojis: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const emoji of emojis) {
    if (!canKeep(emoji) || seen.has(emoji)) continue
    seen.add(emoji)
    next.push(emoji)
  }
  return next
}

export function EmojiLab() {
  const [picked, setPicked] = useState(PRIVATE_KEY_EMOJIS)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.background
    const prevBody = body.style.background
    html.style.background = "#3a1219"
    body.style.background = "#3a1219"
    return () => {
      html.style.background = prevHtml
      body.style.background = prevBody
    }
  }, [])

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw)
      if (!Array.isArray(saved)) return
      const parts = unique(saved.filter((part): part is string => typeof part === "string"))
      if (parts.length) setPicked(parts)
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picked))
  }, [picked])

  function addFromDraft(value: string) {
    const extras = unique(parseEmojiList(value))
    if (!extras.length) return
    setPicked((prev) => unique([...prev, ...extras]))
    setDraft("")
  }

  return (
    <div className={`${styles.shell} ${styles.lab}`}>
      <div className={styles.frame}>
        <div className={styles.box}>
          <h1>emoji set</h1>
          <p style={{ color: "var(--dream-pink-dim)" }}>click to subtract. paste to add.</p>
          <input
            className={styles.field}
            value={draft}
            onChange={(e) => {
              const value = e.target.value
              if (parseEmojiList(value).some(canKeep)) addFromDraft(value)
              else setDraft(value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addFromDraft(draft)
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="paste emoji"
            name="dream-emoji-lab"
            inputMode="text"
          />
          <div className={styles.emojiGrid}>
            {picked.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.btn} ${styles.emojiCell}`}
                onClick={() => setPicked((prev) => prev.filter((part) => part !== emoji))}
                aria-label={`remove ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <p style={{ color: "var(--dream-pink-dim)" }}>{picked.length}</p>
        </div>
      </div>
    </div>
  )
}
