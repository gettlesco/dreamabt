import { useState, type ReactNode } from "react"
import type { DreamItem, Person } from "@/lib/dream-about-me"
import { PRIVATE_KEY_EMOJIS, PRIVATE_KEY_LENGTH } from "@/lib/dream-auth"
import { TimePicker } from "./TimePicker"
import { VideoEmbed } from "./VideoEmbed"
import styles from "./dream.module.css"

export function TextBtn({
  children,
  onClick,
  dim,
  forest,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  dim?: boolean
  forest?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onClick}
      disabled={disabled}
      style={{
        color: forest ? "var(--dream-forest-soft)" : undefined,
        opacity: dim ? 0.45 : undefined,
      }}
    >
      {children}
    </button>
  )
}

export function Screen({
  children,
  night,
}: {
  children: ReactNode
  night?: boolean
}) {
  return (
    <div className={`${styles.frame} ${night ? styles.frameNight : ""}`}>
      <div className={styles.box}>{children}</div>
    </div>
  )
}

export function LandingScreen({
  onNew,
  onExisting,
}: {
  onNew: () => void
  onExisting: () => void
}) {
  return (
    <Screen>
      <p style={{ color: "var(--dream-forest-soft)" }}>time to dream</p>
      <h1>dream about me</h1>
      <TextBtn forest onClick={onNew}>
        new person
      </TextBtn>
      <TextBtn dim onClick={onExisting}>
        already have an account
      </TextBtn>
    </Screen>
  )
}

export function NameScreen({
  name,
  error,
  title = "what's your name?",
  onName,
  onContinue,
  onBack,
  autoFocus = true,
}: {
  name: string
  error?: string
  title?: string
  onName: (value: string) => void
  onContinue: () => void
  onBack: () => void
  autoFocus?: boolean
}) {
  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>{title}</h1>
      <input
        className={styles.field}
        value={name}
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onContinue()
        }}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={40}
        name="dream-first-name"
        inputMode="text"
      />
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      <TextBtn forest onClick={onContinue} disabled={!name.trim()}>
        continue
      </TextBtn>
    </Screen>
  )
}

export function PrivateKeyScreen({
  picked,
  returning,
  busy,
  error,
  title,
  onPick,
  onUndo,
  onContinue,
  onBack,
}: {
  picked: string[]
  returning?: boolean
  busy?: boolean
  error?: string
  title?: string
  onPick: (emoji: string) => void
  onUndo: () => void
  onContinue: () => void
  onBack: () => void
}) {
  const ready = picked.length === PRIVATE_KEY_LENGTH
  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>{title ?? (returning ? "your private key" : "choose your private key")}</h1>
      <p style={{ color: "var(--dream-pink-dim)" }}>three things. order matters.</p>
      {picked.length > 0 && (
        <button type="button" className={`${styles.btn} ${styles.keyLine}`} onClick={onUndo}>
          {picked.join(" ")}
        </button>
      )}
      <div className={styles.emojiGrid}>
        {PRIVATE_KEY_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`${styles.btn} ${styles.emojiCell}`}
            onClick={() => onPick(emoji)}
            disabled={ready || busy}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      <TextBtn forest onClick={onContinue} disabled={!ready || busy}>
        continue
      </TextBtn>
    </Screen>
  )
}

export function PrivateKeyConfirmScreen({
  picked,
  busy,
  error,
  onContinue,
  onBack,
}: {
  picked: string[]
  busy?: boolean
  error?: string
  onContinue: () => void
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyKey() {
    const text = `${picked.join(" ")} dreamabt.me key, dream about me password`
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <Screen>
      <p className={styles.keyLine}>{picked.join(" ")}</p>
      <p>this is your private key.</p>
      <p>remember it.</p>
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      <TextBtn dim onClick={copyKey} disabled={busy}>
        {copied ? "copied" : "copy"}
      </TextBtn>
      <TextBtn forest onClick={onContinue} disabled={busy}>
        continue
      </TextBtn>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
    </Screen>
  )
}

export function OnboardingScreen({
  bedtime,
  onBedtime,
  notiLabel,
  notiHint = "you will get a noti at this time.",
  onNotis,
  onContinue,
}: {
  bedtime: string
  onBedtime: (value: string) => void
  notiLabel: string
  notiHint?: string
  onNotis: () => void
  onContinue: () => void
}) {
  return (
    <Screen>
      <h1>what time do you go to bed?</h1>
      <p style={{ color: "var(--dream-pink-dim)" }}>{notiHint}</p>
      <TimePicker value={bedtime} onChange={onBedtime} />
      <TextBtn dim onClick={onNotis}>
        {notiLabel}
      </TextBtn>
      <TextBtn forest onClick={onContinue}>
        continue
      </TextBtn>
    </Screen>
  )
}

export function AddFields({
  mode,
  quote,
  video,
  error,
  saveLabel,
  onQuote,
  onVideo,
  onSave,
  onCancel,
}: {
  mode: "quote" | "video"
  quote: string
  video: string
  error?: string
  saveLabel: string
  onQuote: (value: string) => void
  onVideo: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <>
      {mode === "quote" ? (
        <textarea
          className={styles.field}
          placeholder="write a little something"
          value={quote}
          onChange={(e) => onQuote(e.target.value)}
          autoFocus
        />
      ) : (
        <input
          className={styles.field}
          placeholder="youtube, tiktok, or instagram link"
          value={video}
          onChange={(e) => onVideo(e.target.value)}
          autoFocus
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
      )}
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      <TextBtn dim onClick={onCancel}>
        nevermind
      </TextBtn>
      <TextBtn forest onClick={onSave} disabled={mode === "quote" ? !quote.trim() : !video.trim()}>
        {saveLabel}
      </TextBtn>
    </>
  )
}

export function HomeScreen({
  streak,
  emoji,
  notiLabel,
  onSetMine,
  onSend,
  onEmoji,
  onDream,
  onNotis,
}: {
  streak: number
  emoji?: string | null
  notiLabel?: string
  onSetMine: () => void
  onSend: () => void
  onEmoji: () => void
  onDream: () => void
  onNotis?: () => void
}) {
  const nights = streak === 1 ? "1 night" : `${streak} nights`
  const showNotis = Boolean(onNotis && notiLabel && notiLabel !== "notis on")
  return (
    <Screen>
      <p>dream about me</p>
      <TextBtn onClick={onSetMine}>set my dream</TextBtn>
      <TextBtn onClick={onSend}>send a dream</TextBtn>
      <TextBtn onClick={onEmoji}>{emoji || "set emoji"}</TextBtn>
      <TextBtn onClick={onDream}>dream</TextBtn>
      {showNotis && (
        <TextBtn dim onClick={onNotis}>
          {notiLabel}
        </TextBtn>
      )}
      <p style={{ color: "var(--dream-pink-dim)" }}>{nights}</p>
    </Screen>
  )
}

export function EmojiScreen({
  title,
  hint,
  current,
  busy,
  error,
  onPick,
  onAssign,
  onBack,
}: {
  title: string
  hint?: string
  current?: string | null
  busy?: boolean
  error?: string
  onPick: (emoji: string) => void
  onAssign?: () => void
  onBack: () => void
}) {
  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>{title}</h1>
      {hint && <p style={{ color: "var(--dream-pink-dim)" }}>{hint}</p>}
      {current && <p className={styles.keyLine}>{current}</p>}
      <div className={styles.emojiGrid}>
        {PRIVATE_KEY_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`${styles.btn} ${styles.emojiCell}`}
            onClick={() => onPick(emoji)}
            disabled={busy}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      {onAssign && (
        <TextBtn forest onClick={onAssign} disabled={busy}>
          get one
        </TextBtn>
      )}
    </Screen>
  )
}

function personNote(person: Person): string | null {
  if (person.status === "pending-out") return "waiting to accept"
  if (person.status === "pending-in") return "wants to connect"
  if (person.sentStatus === "waiting") return "waiting for bedtime"
  if (person.sentStatus === "seen") return "saw it"
  return null
}

export function ChoosePersonScreen({
  people,
  onBack,
  onPick,
  onInvite,
  onAccept,
}: {
  people: Person[]
  onBack: () => void
  onPick: (person: Person) => void
  onInvite: () => void
  onAccept: (person: Person) => void
}) {
  const connected = people.filter((p) => p.status === "connected")
  const pending = people.filter((p) => p.status !== "connected")

  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>who is it for?</h1>
      {connected.map((person) => (
        <div key={person.id}>
          <TextBtn onClick={() => onPick(person)}>{person.name}</TextBtn>
          {personNote(person) && (
            <p style={{ color: "var(--dream-pink-dim)" }}>{personNote(person)}</p>
          )}
        </div>
      ))}
      {pending.map((person) => (
        <div key={person.id}>
          <p className="opacity-50">{person.name}</p>
          <p style={{ color: "var(--dream-pink-dim)" }}>{personNote(person)}</p>
          {person.status === "pending-in" && (
            <TextBtn forest onClick={() => onAccept(person)}>
              accept
            </TextBtn>
          )}
        </div>
      ))}
      <TextBtn dim onClick={onInvite}>
        invite someone
      </TextBtn>
    </Screen>
  )
}

export function InviteScreen({
  link,
  copied,
  onCopy,
  onBack,
}: {
  link: string
  copied: boolean
  onCopy: () => void
  onBack: () => void
}) {
  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>invite someone</h1>
      <p style={{ color: "var(--dream-pink-dim)" }}>
        they have to accept before you can send a dream.
      </p>
      <p className="break-all">{link}</p>
      <TextBtn forest onClick={onCopy}>
        {copied ? "copied" : "copy invite"}
      </TextBtn>
    </Screen>
  )
}

export function AcceptInviteScreen({
  name,
  error,
  onAccept,
  onSkip,
}: {
  name: string
  error?: string
  onAccept: () => void
  onSkip: () => void
}) {
  return (
    <Screen>
      <h1>{name} wants to send you dreams</h1>
      {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
      <TextBtn forest onClick={onAccept}>
        accept
      </TextBtn>
      <TextBtn dim onClick={onSkip}>
        not now
      </TextBtn>
    </Screen>
  )
}

export function ComposeDreamScreen({
  mine,
  addMode,
  quote,
  video,
  busy,
  error,
  addError,
  onBack,
  onAddImage,
  onChooseQuote,
  onChooseVideo,
  onQuote,
  onVideo,
  onSaveAdd,
  onCancelAdd,
}: {
  mine?: boolean
  addMode: "quote" | "video" | null
  quote: string
  video: string
  busy?: boolean
  error?: string
  addError?: string
  onBack: () => void
  onAddImage: () => void
  onChooseQuote: () => void
  onChooseVideo: () => void
  onQuote: (value: string) => void
  onVideo: (value: string) => void
  onSaveAdd: () => void
  onCancelAdd: () => void
}) {
  return (
    <Screen>
      <TextBtn dim onClick={onBack}>
        back
      </TextBtn>
      <h1>{mine ? "set your dream" : "send a dream"}</h1>
      <p style={{ color: "var(--dream-pink-dim)" }}>
        {mine
          ? "the last thing you see before you go to bed."
          : "it'll be the last thing they see before they go to bed"}
      </p>
      {addMode ? (
        <AddFields
          mode={addMode}
          quote={quote}
          video={video}
          onQuote={onQuote}
          onVideo={onVideo}
          error={addError}
          saveLabel={mine ? "set" : "send"}
          onSave={onSaveAdd}
          onCancel={onCancelAdd}
        />
      ) : (
        <>
          <TextBtn onClick={onAddImage} disabled={busy}>
            add an image
          </TextBtn>
          <TextBtn onClick={onChooseQuote} disabled={busy}>
            add a quote
          </TextBtn>
          <TextBtn onClick={onChooseVideo} disabled={busy}>
            add a video link
          </TextBtn>
          {error && <p style={{ color: "var(--dream-pink-dim)" }}>{error}</p>}
        </>
      )}
    </Screen>
  )
}

export function DreamSentScreen({
  onDone,
  mine,
}: {
  onDone: () => void
  mine?: boolean
}) {
  return (
    <Screen>
      <h1>{mine ? "dream set" : "dream sent"}</h1>
      <p style={{ color: "var(--dream-pink-dim)" }}>
        {mine ? "you won't see it until you go to bed." : "they won't see it until they go to bed."}
      </p>
      <TextBtn dim onClick={onDone}>
        okay
      </TextBtn>
    </Screen>
  )
}

export function BedtimeGateScreen({
  onYes,
  onNotYet,
}: {
  onYes: () => void
  onNotYet: () => void
}) {
  return (
    <Screen night>
      <h1>are you going to bed?</h1>
      <TextBtn forest onClick={onYes}>
        yes
      </TextBtn>
      <TextBtn dim onClick={onNotYet}>
        not yet
      </TextBtn>
    </Screen>
  )
}

export function RevealScreen({
  item,
  fromName,
  onGoodnight,
}: {
  item: DreamItem | null
  fromName?: string
  onGoodnight: () => void
}) {
  return (
    <Screen night>
      {fromName && <p style={{ color: "var(--dream-forest-soft)" }}>from {fromName}</p>}
      {!item && <p>nothing tonight.</p>}
      {item?.kind === "quote" && <p>{item.quote}</p>}
      {item?.kind === "image" && item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className={styles.thumb} />
      )}
      {item?.kind === "video" && item.videoUrl && <VideoEmbed url={item.videoUrl} variant="full" />}
      <TextBtn dim onClick={onGoodnight}>
        goodnight
      </TextBtn>
    </Screen>
  )
}
