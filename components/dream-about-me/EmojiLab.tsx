import { useEffect, useState } from "react"
import styles from "./dream.module.css"

const STORAGE_KEY = "dream-emoji-lab"

const DEFAULT_A = [
  "🌸", "🌱", "🌷", "🪴", "🌺", "🥑", "🌹",
  "🍏", "🍒", "💚", "🍓", "🐢", "🎀", "🌻",
  "🩷", "🌝", "👗", "🫐", "👚", "🐖", "🐽",
  "🪨", "👛", "🛻", "👒", "🎲", "🪭",
]

const DEFAULT_B = [
  "🪷", "🍀", "🍉", "🌳", "🍎", "🍐", "🥝",
  "🍋‍🟩", "🍰", "🥭", "🧁", "🌼", "👙", "🐝",
  "🩱", "🐦", "👑", "🥟", "💒", "🐠", "🩰",
  "🎪", "🪱", "🎵", "🧤", "🏍", "🛼", "🩴",
]

const DROPPED = new Set(["🫏", "\u{1FACD}", "\u{1FACF}"])

function asEmojiList(value: unknown) {
  if (!Array.isArray(value)) return null
  return value.filter((part): part is string => typeof part === "string" && !DROPPED.has(part))
}

function shuffled(list: string[]) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

function readSaved(): { a: string[]; b: string[] } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null
    const a = asEmojiList(saved.a)
    const b = asEmojiList(saved.b)
    if (!a || !b) return null
    return { a, b }
  } catch {
    return null
  }
}

export function EmojiLab() {
  const [{ a, b }, setPiles] = useState({ a: DEFAULT_A, b: DEFAULT_B })
  const [ready, setReady] = useState(false)

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
    const saved = readSaved()
    if (saved) setPiles(saved)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ a, b }))
  }, [ready, a, b])

  function moveFromA(index: number) {
    setPiles(({ a: left, b: right }) => {
      const emoji = left[index]
      if (emoji === undefined) return { a: left, b: right }
      return {
        a: left.filter((_, i) => i !== index),
        b: [...right, emoji],
      }
    })
  }

  function moveFromB(index: number) {
    setPiles(({ a: left, b: right }) => {
      const emoji = right[index]
      if (emoji === undefined) return { a: left, b: right }
      return {
        a: [...left, emoji],
        b: right.filter((_, i) => i !== index),
      }
    })
  }

  function reset() {
    setPiles({ a: [...DEFAULT_A], b: [...DEFAULT_B] })
  }

  function shuffleA() {
    setPiles(({ a: left, b: right }) => ({ a: shuffled(left), b: right }))
  }

  function shuffleB() {
    setPiles(({ a: left, b: right }) => ({ a: left, b: shuffled(right) }))
  }

  return (
    <div className={`${styles.shell} ${styles.lab}`}>
      <div className={styles.frame}>
        <div className={styles.labBoard}>
          <button type="button" className={`${styles.btn} ${styles.labReset}`} onClick={reset}>
            reset
          </button>
          <div className={styles.labCols}>
            <section className={styles.labCol}>
              <p className={styles.labLabel}>A</p>
              <div className={styles.emojiGrid}>
                {a.map((emoji, index) => (
                  <button
                    key={`a-${index}-${emoji}`}
                    type="button"
                    className={`${styles.btn} ${styles.emojiCell}`}
                    onClick={() => moveFromA(index)}
                    aria-label={`move ${emoji} to B`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button type="button" className={`${styles.btn} ${styles.labShuffle}`} onClick={shuffleA}>
                shuffle
              </button>
            </section>
            <section className={styles.labCol}>
              <p className={styles.labLabel}>B</p>
              <div className={styles.emojiGrid}>
                {b.map((emoji, index) => (
                  <button
                    key={`b-${index}-${emoji}`}
                    type="button"
                    className={`${styles.btn} ${styles.emojiCell}`}
                    onClick={() => moveFromB(index)}
                    aria-label={`move ${emoji} to A`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button type="button" className={`${styles.btn} ${styles.labShuffle}`} onClick={shuffleB}>
                shuffle
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
