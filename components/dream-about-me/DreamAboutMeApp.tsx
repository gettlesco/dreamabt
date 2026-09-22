import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/router"
import { DEFAULT_BEDTIME, newId, type GalleryItem, type PendingDream, type Person } from "@/lib/dream-about-me"
import { PRIVATE_KEY_LENGTH, displayName } from "@/lib/dream-auth"
import {
  persistDreamProfile,
  persistPushSubscription,
  postDreamAuth,
  restoreDreamSession,
  signOutDreamSession,
} from "@/lib/dream-supabase"
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
  DreamSentScreen,
  GalleryPickScreen,
  GallerySetupScreen,
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
  | "gallery-setup"
  | "home"
  | "choose-person"
  | "invite"
  | "accept"
  | "pick"
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
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [pending, setPending] = useState<PendingDream | null>(null)
  const [streak, setStreak] = useState(0)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [draftQuote, setDraftQuote] = useState("")
  const [draftVideo, setDraftVideo] = useState("")
  const [addTarget, setAddTarget] = useState<"setup" | "pick">("setup")
  const [sendTo, setSendTo] = useState<Person | "me" | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState("dreamabt.me")
  const [copied, setCopied] = useState(false)
  const [inviteName, setInviteName] = useState("macy")
  const [revealed, setRevealed] = useState<PendingDream | null>(null)

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
    setInviteLink(`${window.location.origin}/?invite=1`)
  }, [])

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
      .then((profile) => {
        if (cancelled) return
        if (profile) {
          setName(profile.name)
          if (profile.bedtime) setBedtime(profile.bedtime)
          setStreak(profile.streak)
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            setNotiLabel("notis on")
            void syncPushSubscription()
          }
        }
        if (invite != null) {
          const raw = Array.isArray(invite) ? invite[0] : invite
          setInviteName(raw && raw !== "1" ? raw : "macy")
          setScreen("accept")
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
    setGallery([])
    setPeople([])
    setPending(null)
    setStreak(0)
    setAddMode(null)
    setDraftQuote("")
    setDraftVideo("")
    setSendTo(null)
    setSelectedId(null)
    setRevealed(null)
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
    setBusy(true)
    setAuthError("")
    const result = await postDreamAuth(authMode === "new" ? "signup" : "login", {
      name: displayName(name),
      key: privateKey,
    })
    setBusy(false)
    if (!result.ok) {
      setAuthError(result.error)
      return
    }
    setName(result.profile.name)
    if (result.profile.bedtime) setBedtime(result.profile.bedtime)
    setStreak(result.profile.streak)
    setPrivateKey([])
    setScreen(authMode === "new" ? "onboarding" : "home")
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
  }

  function openImagePicker(target: "setup" | "pick") {
    setAddTarget(target)
    fileRef.current?.click()
  }

  function onImageChosen(file: File | undefined) {
    if (!file) return
    const imageUrl = URL.createObjectURL(file)
    const item: GalleryItem = { id: newId(), kind: "image", imageUrl }
    setGallery((prev) => [item, ...prev])
    if (addTarget === "pick") setSelectedId(item.id)
  }

  function saveAdd() {
    if (addMode === "quote" && draftQuote.trim()) {
      const item: GalleryItem = { id: newId(), kind: "quote", quote: draftQuote.trim() }
      setGallery((prev) => [item, ...prev])
      if (addTarget === "pick") setSelectedId(item.id)
    }
    if (addMode === "video" && draftVideo.trim()) {
      const item: GalleryItem = { id: newId(), kind: "video", videoUrl: draftVideo.trim() }
      setGallery((prev) => [item, ...prev])
      if (addTarget === "pick") setSelectedId(item.id)
    }
    setDraftQuote("")
    setDraftVideo("")
    setAddMode(null)
  }

  function deleteItem(item: GalleryItem) {
    if (item.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(item.imageUrl)
    setGallery((prev) => prev.filter((g) => g.id !== item.id))
    if (selectedId === item.id) setSelectedId(null)
  }

  function sendDream() {
    const item = gallery.find((g) => g.id === selectedId)
    if (!item || !sendTo) return
    if (sendTo === "me") {
      setPending({ item })
    } else {
      setPeople((prev) =>
        prev.map((p) => (p.id === sendTo.id ? { ...p, sentStatus: "waiting" } : p)),
      )
    }
    setScreen("sent")
  }

  function completeRitual() {
    setRevealed(pending)
    if (pending) {
      setStreak((n) => {
        const next = n + 1
        void persistDreamProfile({ streak: next })
        return next
      })
      setPending(null)
    }
    setScreen("reveal")
  }

  function acceptPerson(person: Person) {
    setPeople((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, status: "connected" } : p)),
    )
  }

  function acceptInvite() {
    setPeople((prev) => {
      if (prev.some((p) => p.name === inviteName)) {
        return prev.map((p) =>
          p.name === inviteName ? { ...p, status: "connected" } : p,
        )
      }
      return [...prev, { id: newId(), name: inviteName, status: "connected" }]
    })
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
  const selected = gallery.find((g) => g.id === selectedId) ?? null

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
            void (async () => {
              await requestNotis()
              void persistDreamProfile({ bedtime })
              setScreen("gallery-setup")
            })()
          }}
        />
      )}
      {screen === "gallery-setup" && (
        <GallerySetupScreen
          items={gallery}
          addMode={addMode}
          quote={draftQuote}
          video={draftVideo}
          onQuote={setDraftQuote}
          onVideo={setDraftVideo}
          onAddImage={() => openImagePicker("setup")}
          onChooseQuote={() => {
            setAddTarget("setup")
            setAddMode("quote")
          }}
          onChooseVideo={() => {
            setAddTarget("setup")
            setAddMode("video")
          }}
          onSaveAdd={saveAdd}
          onCancelAdd={() => {
            setAddMode(null)
            setDraftQuote("")
            setDraftVideo("")
          }}
          onContinue={() => setScreen("home")}
        />
      )}
      {screen === "home" && (
        <HomeScreen
          streak={streak}
          notiLabel={notiLabel}
          onSend={() => setScreen("choose-person")}
          onReceive={() => setScreen("bedtime")}
          onNotis={requestNotis}
        />
      )}
      {screen === "choose-person" && (
        <ChoosePersonScreen
          people={people}
          onBack={() => setScreen("home")}
          onPick={(person) => {
            setSendTo(person)
            setSelectedId(null)
            setScreen("pick")
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
          onAccept={acceptInvite}
          onSkip={() => setScreen("landing")}
        />
      )}
      {screen === "pick" && (
        <GalleryPickScreen
          items={gallery}
          selectedId={selectedId}
          addMode={addMode}
          quote={draftQuote}
          video={draftVideo}
          canSend={Boolean(selected)}
          onBack={() => setScreen("choose-person")}
          onSelect={(item) => setSelectedId(item.id)}
          onDelete={deleteItem}
          onAddImage={() => openImagePicker("pick")}
          onChooseQuote={() => {
            setAddTarget("pick")
            setAddMode("quote")
          }}
          onChooseVideo={() => {
            setAddTarget("pick")
            setAddMode("video")
          }}
          onQuote={setDraftQuote}
          onVideo={setDraftVideo}
          onSaveAdd={saveAdd}
          onCancelAdd={() => {
            setAddMode(null)
            setDraftQuote("")
            setDraftVideo("")
          }}
          onSend={sendDream}
        />
      )}
      {screen === "sent" && <DreamSentScreen onDone={() => setScreen("home")} />}
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
