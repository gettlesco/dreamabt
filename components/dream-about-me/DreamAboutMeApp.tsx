import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/router"
import { DEFAULT_BEDTIME, isHttpUrl, newId, type DreamItem, type PendingDream, type Person } from "@/lib/dream-about-me"
import { PRIVATE_KEY_LENGTH, displayName } from "@/lib/dream-auth"
import {
  persistDreamProfile,
  persistPushSubscription,
  postDreamAuth,
  restoreDreamSession,
  signOutDreamSession,
} from "@/lib/dream-supabase"
import {
  acceptInvite as acceptInviteLink,
  ensureDreamCode,
  findDreamRecipient,
  saveDreamEmoji,
  hasAcceptedInvite,
  loadPeople,
  loadTonightDream,
  lookupInvite,
  revealSoloDream,
  revealTonightDream,
  sendDreamItem,
  setSoloDream,
} from "@/lib/dream-social"
import {
  iosWebContext,
  localTimeZone,
  onboardingNotiHint,
  onboardingNotiLabel,
  pushSupported,
  registerDreamWorker,
  showDreamNotification,
  subscribeDreamPush,
  type IosWebContext,
} from "@/lib/dream-pwa"
import {
  AcceptInviteScreen,
  BedtimeGateScreen,
  ChoosePersonScreen,
  ComposeDreamScreen,
  DreamSentScreen,
  EmojiScreen,
  HomeScreen,
  InviteScreen,
  LandingScreen,
  NameScreen,
  OnboardingScreen,
  PrivateKeyConfirmScreen,
  PrivateKeyScreen,
  RevealScreen,
} from "./screens"
import styles from "./dream.module.css"

type Screen =
  | "landing"
  | "name"
  | "private-key"
  | "private-key-confirm"
  | "onboarding"
  | "home"
  | "choose-person"
  | "invite"
  | "accept"
  | "compose"
  | "send-name"
  | "send-emoji"
  | "emoji"
  | "sent"
  | "bedtime"
  | "reveal"

type AuthMode = "new" | "return"

type AddMode = "quote" | "video" | null

export function DreamAboutMeApp() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [screen, setScreen] = useState<Screen>("landing")
  const [booting, setBooting] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>("new")
  const [name, setName] = useState("")
  const [privateKey, setPrivateKey] = useState<string[]>([])
  const [authError, setAuthError] = useState("")
  const [busy, setBusy] = useState(false)
  const [bedtime, setBedtime] = useState(DEFAULT_BEDTIME)
  const [notiLabel, setNotiLabel] = useState("turn on notis")
  const [installCtx, setInstallCtx] = useState<IosWebContext | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [streak, setStreak] = useState(0)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [draftQuote, setDraftQuote] = useState("")
  const [draftVideo, setDraftVideo] = useState("")
  const [sendTo, setSendTo] = useState<Person | "me" | null>(null)
  const [recipientName, setRecipientName] = useState("")
  const [myEmoji, setMyEmoji] = useState<string | null>(null)
  const [emojiError, setEmojiError] = useState("")
  const [inviteLink, setInviteLink] = useState("dreamabt.me")
  const [copied, setCopied] = useState(false)
  const [inviteName, setInviteName] = useState("")
  const [inviteFromId, setInviteFromId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState("")
  const [addError, setAddError] = useState("")
  const [dreamCode, setDreamCode] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<PendingDream | null>(null)
  const [sendError, setSendError] = useState("")
  const ritualLock = useRef(false)
  const sendLock = useRef(false)
  const authIgnore = useRef(false)
  const findIgnore = useRef(false)
  const emojiIgnore = useRef(false)
  const [sending, setSending] = useState(false)

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
    const code = dreamCode || "1"
    setInviteLink(`${window.location.origin}/?invite=${code}`)
  }, [dreamCode])

  useEffect(() => {
    const ctx = iosWebContext()
    setInstallCtx(ctx)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setNotiLabel("notis on")
      return
    }
    if (screen === "onboarding" || screen === "home") setNotiLabel(onboardingNotiLabel(ctx))
  }, [screen])

  useEffect(() => {
    if (!router.isReady) return
    let cancelled = false
    const invite = router.query.invite
    const receive = router.query.receive
    void restoreDreamSession()
      .then(async (profile) => {
        if (cancelled) return
        if (profile) {
          setName(profile.name)
          setUserId(profile.id)
          if (profile.bedtime) setBedtime(profile.bedtime)
          setStreak(profile.streak)
          setMyEmoji(profile.emoji)
          void persistDreamProfile({ timezone: localTimeZone() })
          const code = profile.dreamCode || (await ensureDreamCode())
          if (code) setDreamCode(code)
          void loadPeople().then((next) => {
            if (!cancelled) setPeople(next)
          })
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            setNotiLabel("notis on")
            void syncPushSubscription()
          }
        }
        if (invite != null) {
          const raw = Array.isArray(invite) ? invite[0] : invite
          const found = raw ? await lookupInvite(raw) : null
          if (found && found.id !== profile?.id) {
            if (profile && (await hasAcceptedInvite(found.id))) {
              setScreen("home")
            } else {
              setInviteName(found.name)
              setInviteFromId(found.id)
              setInviteError("")
              setScreen("accept")
            }
          } else if (profile) {
            setScreen("home")
          }
        } else if (receive != null && profile) {
          setScreen("bedtime")
        } else if (profile) {
          setScreen("home")
        }
        setBooting(false)
      })
      .catch(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [router.isReady, router.query.invite, router.query.receive])

  function resetAuth() {
    setAuthError("")
    setBusy(false)
    setPrivateKey([])
  }

  function goLanding() {
    resetAuth()
    setName("")
    setAuthMode("new")
    setScreen("landing")
  }

  async function logOut() {
    await signOutDreamSession()
    resetAuth()
    setName("")
    setAuthMode("new")
    setBedtime(DEFAULT_BEDTIME)
    setNotiLabel("turn on notis")
    setPeople([])
    setStreak(0)
    setAddMode(null)
    setDraftQuote("")
    setDraftVideo("")
    setSendTo(null)
    setRecipientName("")
    setMyEmoji(null)
    setEmojiError("")
    setRevealed(null)
    setSendError("")
    setInviteFromId(null)
    setInviteName("")
    setDreamCode(null)
    setUserId(null)
    setScreen("landing")
  }

  function startNew() {
    resetAuth()
    setName("")
    setAuthMode("new")
    setScreen("name")
  }

  function startReturn() {
    resetAuth()
    setName("")
    setAuthMode("return")
    setScreen("name")
  }

  function pickEmoji(emoji: string) {
    setAuthError("")
    setPrivateKey((prev) => (prev.length >= PRIVATE_KEY_LENGTH ? prev : [...prev, emoji]))
  }

  async function submitAuth() {
    if (busy) return
    authIgnore.current = false
    setBusy(true)
    setAuthError("")
    const result = await postDreamAuth(authMode === "new" ? "signup" : "login", {
      name: displayName(name),
      key: privateKey,
    })
    setBusy(false)
    if (authIgnore.current) return
    if (!result.ok) {
      setAuthError(result.error)
      return
    }
    setName(result.profile.name)
    setUserId(result.profile.id)
    if (result.profile.bedtime) setBedtime(result.profile.bedtime)
    setStreak(result.profile.streak)
    setMyEmoji(result.profile.emoji)
    void persistDreamProfile({ timezone: localTimeZone() })
    const code = result.profile.dreamCode || (await ensureDreamCode())
    if (code) setDreamCode(code)
    void loadPeople().then(setPeople)
    setPrivateKey([])
    if (authMode === "new") {
      setScreen("onboarding")
      return
    }
    if (inviteFromId) setScreen("accept")
    else setScreen("home")
  }

  async function syncPushSubscription() {
    const registration = await registerDreamWorker()
    if (!registration) return
    await navigator.serviceWorker.ready
    const subscription = await subscribeDreamPush(registration)
    if (subscription) await persistPushSubscription(subscription, localTimeZone())
  }

  async function requestNotis() {
    const ctx = iosWebContext()
    setInstallCtx(ctx)
    if (ctx === "other") {
      setNotiLabel("share / ••• → open in safari")
      return
    }
    if (ctx === "safari") {
      setNotiLabel("share → add to home screen")
      return
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotiLabel("notis aren't available")
      return
    }
    if (!pushSupported()) {
      setNotiLabel("notis aren't available")
      return
    }
    const perm = await Notification.requestPermission()
    if (perm !== "granted") {
      setNotiLabel(perm === "denied" ? "notis blocked" : "turn on notis")
      return
    }
    const registration = await registerDreamWorker()
    if (registration) {
      await navigator.serviceWorker.ready
      await syncPushSubscription()
      await showDreamNotification(registration)
    }
    setNotiLabel("notis on")
    void persistDreamProfile({ timezone: localTimeZone() })
  }

  function openImagePicker() {
    fileRef.current?.click()
  }

  function onImageChosen(file: File | undefined) {
    if (!file) return
    const imageUrl = URL.createObjectURL(file)
    void sendDreamWithItem({ id: newId(), kind: "image", imageUrl })
  }

  function saveAdd() {
    let item: DreamItem | null = null
    if (addMode === "quote" && draftQuote.trim()) {
      item = { id: newId(), kind: "quote", quote: draftQuote.trim() }
    }
    if (addMode === "video" && draftVideo.trim()) {
      const url = draftVideo.trim()
      if (!isHttpUrl(url)) {
        setAddError("that didn't work.")
        return
      }
      item = { id: newId(), kind: "video", videoUrl: url }
    }
    setAddError("")
    setDraftQuote("")
    setDraftVideo("")
    setAddMode(null)
    if (!item) return
    void sendDreamWithItem(item)
  }

  async function sendDreamWithItem(item: DreamItem) {
    if (!sendTo || !userId || sendLock.current) return
    sendLock.current = true
    setSending(true)
    setSendError("")
    try {
      const ok = sendTo === "me" ? await setSoloDream(item) : await sendDreamItem(item, sendTo.id)
      if (!ok) {
        setSendError("that didn't work.")
        return
      }
      if (sendTo !== "me") {
        setPeople((prev) =>
          prev.map((p) => (p.id === sendTo.id ? { ...p, sentStatus: "waiting" } : p)),
        )
      }
      setScreen("sent")
    } catch {
      setSendError("that didn't work.")
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }

  async function findRecipient(emoji: string) {
    if (busy) return
    findIgnore.current = false
    setBusy(true)
    setSendError("")
    const found = await findDreamRecipient(displayName(recipientName), emoji)
    setBusy(false)
    if (findIgnore.current) return
    if (!found) {
      setSendError("that didn't work.")
      return
    }
    setSendTo({ id: found.id, name: found.name, status: "connected" })
    setAddMode(null)
    setAddError("")
    setSendError("")
    setScreen("compose")
  }

  async function chooseEmoji(input: { emoji: string } | { assign: true }) {
    if (busy) return
    emojiIgnore.current = false
    setBusy(true)
    setEmojiError("")
    const saved = await saveDreamEmoji(input)
    setBusy(false)
    if (emojiIgnore.current) return
    if (!saved) {
      setEmojiError("that didn't work.")
      return
    }
    setMyEmoji(saved)
    setScreen("home")
  }

  async function completeRitual() {
    if (ritualLock.current) return
    ritualLock.current = true
    try {
      const tonight = await loadTonightDream()
      if (!tonight) {
        setRevealed(null)
        setScreen("reveal")
        return
      }
      setRevealed({ item: tonight.item, fromName: tonight.fromName })
      if (tonight.solo) {
        const result = await revealSoloDream()
        if (result) setStreak(result.streak)
      } else if (!tonight.revealed) {
        const result = await revealTonightDream(tonight.id)
        if (result) setStreak(result.streak)
      }
      setScreen("reveal")
    } finally {
      ritualLock.current = false
    }
  }

  async function acceptPerson(person: Person) {
    const ok = await acceptInviteLink(person.id)
    if (!ok) return
    setPeople(await loadPeople())
  }

  async function acceptInvite() {
    if (!inviteFromId) {
      setScreen(userId ? "home" : "landing")
      return
    }
    if (!userId) {
      startNew()
      return
    }
    setInviteError("")
    const ok = await acceptInviteLink(inviteFromId)
    if (!ok) {
      setInviteError("that didn't work.")
      return
    }
    setPeople(await loadPeople())
    setInviteFromId(null)
    setScreen("home")
  }

  function copyInvite() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(inviteLink).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
    }
  }

  const night = screen === "bedtime" || screen === "reveal"

  return (
    <div className={`${styles.shell} ${night ? styles.shellNight : ""}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onImageChosen(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {booting && <div className={styles.frame} />}
      {!booting && screen === "landing" && (
        <LandingScreen onNew={startNew} onExisting={startReturn} />
      )}
      {screen === "name" && (
        <NameScreen
          name={name}
          error={authError}
          onName={(value) => {
            setAuthError("")
            setName(value)
          }}
          onContinue={() => {
            if (!displayName(name)) return
            setName(displayName(name))
            setPrivateKey([])
            setAuthError("")
            setScreen("private-key")
          }}
          onBack={goLanding}
        />
      )}
      {screen === "private-key" && (
        <PrivateKeyScreen
          picked={privateKey}
          returning={authMode === "return"}
          busy={busy}
          error={authError}
          onPick={pickEmoji}
          onUndo={() => {
            setAuthError("")
            setPrivateKey((prev) => prev.slice(0, -1))
          }}
          onContinue={() => {
            if (privateKey.length !== PRIVATE_KEY_LENGTH) return
            if (authMode === "return") {
              void submitAuth()
              return
            }
            setAuthError("")
            setScreen("private-key-confirm")
          }}
          onBack={() => {
            resetAuth()
            setScreen("name")
          }}
        />
      )}
      {screen === "private-key-confirm" && (
        <PrivateKeyConfirmScreen
          picked={privateKey}
          busy={busy}
          error={authError}
          onContinue={() => {
            void submitAuth()
          }}
          onBack={() => {
            authIgnore.current = true
            setAuthError("")
            setBusy(false)
            setScreen("private-key")
          }}
        />
      )}
      {screen === "onboarding" && (
        <OnboardingScreen
          bedtime={bedtime}
          onBedtime={setBedtime}
          notiLabel={notiLabel}
          notiHint={onboardingNotiHint(installCtx)}
          onNotis={requestNotis}
          onContinue={() => {
            void persistDreamProfile({ bedtime, timezone: localTimeZone() })
            void requestNotis()
            setScreen(inviteFromId ? "accept" : "home")
          }}
        />
      )}
      {screen === "home" && (
        <HomeScreen
          streak={streak}
          emoji={myEmoji}
          notiLabel={notiLabel}
          onSetMine={() => {
            setSendTo("me")
            setAddMode(null)
            setAddError("")
            setSendError("")
            setScreen("compose")
          }}
          onSend={() => {
            setRecipientName("")
            setSendTo(null)
            setSendError("")
            setScreen("send-name")
          }}
          onEmoji={() => {
            emojiIgnore.current = true
            setBusy(false)
            setEmojiError("")
            setScreen("emoji")
          }}
          onDream={() => setScreen("bedtime")}
          onNotis={requestNotis}
        />
      )}
      {screen === "choose-person" && (
        <ChoosePersonScreen
          people={people}
          onBack={() => setScreen("home")}
          onPick={(person) => {
            setSendTo(person)
            setAddMode(null)
            setAddError("")
            setSendError("")
            setScreen("compose")
          }}
          onInvite={() => setScreen("invite")}
          onAccept={acceptPerson}
        />
      )}
      {screen === "invite" && (
        <InviteScreen
          link={inviteLink}
          copied={copied}
          onCopy={copyInvite}
          onBack={() => setScreen("choose-person")}
        />
      )}
      {screen === "accept" && (
        <AcceptInviteScreen
          name={inviteName}
          error={inviteError}
          onAccept={() => void acceptInvite()}
          onSkip={() => setScreen(userId ? "home" : "landing")}
        />
      )}
      {screen === "send-name" && (
        <NameScreen
          title="who's it for?"
          name={recipientName}
          error={sendError}
          onName={(value) => {
            setSendError("")
            setRecipientName(value)
          }}
          onContinue={() => {
            if (!displayName(recipientName)) return
            setRecipientName(displayName(recipientName))
            setSendError("")
            setScreen("send-emoji")
          }}
          onBack={() => {
            setRecipientName("")
            setSendError("")
            setScreen("home")
          }}
        />
      )}
      {screen === "emoji" && (
        <EmojiScreen
          title="your emoji"
          hint="someone needs this to send you a dream."
          current={myEmoji}
          busy={busy}
          error={emojiError}
          onPick={(emoji) => void chooseEmoji({ emoji })}
          onAssign={() => void chooseEmoji({ assign: true })}
          onBack={() => {
            emojiIgnore.current = true
            setBusy(false)
            setEmojiError("")
            setScreen("home")
          }}
        />
      )}
      {screen === "send-emoji" && (
        <EmojiScreen
          title="their emoji"
          busy={busy}
          error={sendError}
          onPick={(emoji) => void findRecipient(emoji)}
          onBack={() => {
            findIgnore.current = true
            setBusy(false)
            setSendError("")
            setScreen("send-name")
          }}
        />
      )}
      {screen === "compose" && (
        <ComposeDreamScreen
          mine={sendTo === "me"}
          addMode={addMode}
          quote={draftQuote}
          video={draftVideo}
          busy={sending}
          error={sendError}
          addError={addError}
          onBack={() => {
            setAddMode(null)
            setAddError("")
            setDraftQuote("")
            setDraftVideo("")
            setSendError("")
            setScreen(sendTo === "me" ? "home" : "send-emoji")
          }}
          onAddImage={() => openImagePicker()}
          onChooseQuote={() => setAddMode("quote")}
          onChooseVideo={() => setAddMode("video")}
          onQuote={setDraftQuote}
          onVideo={setDraftVideo}
          onSaveAdd={saveAdd}
          onCancelAdd={() => {
            setAddMode(null)
            setAddError("")
            setDraftQuote("")
            setDraftVideo("")
          }}
        />
      )}
      {screen === "sent" && <DreamSentScreen mine={sendTo === "me"} onDone={() => setScreen("home")} />}
      {screen === "bedtime" && (
        <BedtimeGateScreen onYes={completeRitual} onNotYet={() => setScreen("home")} />
      )}
      {screen === "reveal" && (
        <RevealScreen
          item={revealed?.item ?? null}
          fromName={revealed?.fromName}
          onGoodnight={() => setScreen("home")}
        />
      )}
      <button type="button" className={`${styles.btn} ${styles.logout}`} onClick={() => void logOut()}>
        log out
      </button>
    </div>
  )
}
