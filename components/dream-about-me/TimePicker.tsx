import { useEffect, useRef } from "react"
import { BEDTIMES } from "@/lib/dream-about-me"
import styles from "./dream.module.css"

type TimePickerProps = {
  value: string
  onChange: (value: string) => void
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const skip = useRef(true)

  function itemH() {
    const el = ref.current
    if (!el) return 0
    return el.clientHeight / 3
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, BEDTIMES.indexOf(value))
    el.scrollTop = i * itemH()
    const id = window.setTimeout(() => {
      skip.current = false
    }, 80)
    return () => window.clearTimeout(id)
    // scroll to the initial bedtime once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const el = ref.current
    if (!el || skip.current) return
    const h = itemH()
    if (!h) return
    const i = Math.round(el.scrollTop / h)
    const clamped = Math.max(0, Math.min(BEDTIMES.length - 1, i))
    const next = BEDTIMES[clamped]
    if (next && next !== value) onChange(next)
  }

  return (
    <div className={styles.picker}>
      <div
        ref={ref}
        className={styles.scroller}
        style={{ height: "100%" }}
        onScroll={handleScroll}
        role="listbox"
        aria-label="bedtime"
        tabIndex={0}
      >
        <div className={styles.timePad} aria-hidden />
        {BEDTIMES.map((time) => {
          const selected = time === value
          return (
            <div
              key={time}
              role="option"
              aria-selected={selected}
              className={styles.timeItem}
              onClick={() => {
                const el = ref.current
                const i = BEDTIMES.indexOf(time)
                if (el && i >= 0) el.scrollTo({ top: i * itemH(), behavior: "smooth" })
                onChange(time)
              }}
              style={{ opacity: selected ? 1 : 0.28 }}
            >
              {time}
            </div>
          )
        })}
        <div className={styles.timePad} aria-hidden />
      </div>
    </div>
  )
}
