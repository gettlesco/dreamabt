import { useEffect, useState, type ReactNode } from "react"
import { DEFAULT_BEDTIME, DEMO_GALLERY, DEMO_PEOPLE, DEMO_PENDING } from "@/lib/dream-about-me"
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
import dream from "./dream.module.css"
import styles from "./ui-board.module.css"

const STORAGE_KEY = "dream-ui-notes"

function noop() {}

type BoardScreen = {
  id: string
  title: string
  node: ReactNode
}

const SCREENS: BoardScreen[] = [
  {
    id: "landing",
    title: "landing",
    node: <LandingScreen onNew={noop} onExisting={noop} />,
  },
  {
    id: "name",
    title: "name",
    node: (
      <NameScreen
        name="macy"
        autoFocus={false}
        onName={noop}
        onContinue={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "private-key",
    title: "private key",
    node: (
      <PrivateKeyScreen
        picked={["🌸", "🩷"]}
        onPick={noop}
        onUndo={noop}
        onContinue={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "private-key-return",
    title: "private key · returning",
    node: (
      <PrivateKeyScreen
        picked={[]}
        returning
        onPick={noop}
        onUndo={noop}
        onContinue={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "private-key-confirm",
    title: "private key confirm",
    node: (
      <PrivateKeyConfirmScreen
        picked={["🌸", "🩷", "🐸"]}
        onContinue={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "onboarding",
    title: "onboarding",
    node: (
      <OnboardingScreen
        bedtime={DEFAULT_BEDTIME}
        onBedtime={noop}
        notiLabel="turn on notis"
        notiHint="you will get a noti at this time."
        onNotis={noop}
        onContinue={noop}
      />
    ),
  },
  {
    id: "onboarding-safari",
    title: "onboarding · safari",
    node: (
      <OnboardingScreen
        bedtime={DEFAULT_BEDTIME}
        onBedtime={noop}
        notiLabel="add to home screen"
        notiHint="add to home screen, then turn on notis."
        onNotis={noop}
        onContinue={noop}
      />
    ),
  },
  {
    id: "onboarding-other",
    title: "onboarding · not safari",
    node: (
      <OnboardingScreen
        bedtime={DEFAULT_BEDTIME}
        onBedtime={noop}
        notiLabel="open in safari"
        notiHint="open this in safari to install."
        onNotis={noop}
        onContinue={noop}
      />
    ),
  },
  {
    id: "gallery-setup",
    title: "gallery setup",
    node: (
      <GallerySetupScreen
        items={DEMO_GALLERY}
        addMode={null}
        quote=""
        video=""
        onQuote={noop}
        onVideo={noop}
        onAddImage={noop}
        onChooseQuote={noop}
        onChooseVideo={noop}
        onSaveAdd={noop}
        onCancelAdd={noop}
        onContinue={noop}
      />
    ),
  },
  {
    id: "home",
    title: "home",
    node: (
      <HomeScreen
        streak={3}
        notiLabel="turn on notis"
        onSetMine={noop}
        onSendThem={noop}
        onReceive={noop}
        onNotis={noop}
      />
    ),
  },
  {
    id: "choose-person",
    title: "choose person",
    node: (
      <ChoosePersonScreen
        people={DEMO_PEOPLE}
        onBack={noop}
        onPick={noop}
        onInvite={noop}
        onAccept={noop}
      />
    ),
  },
  {
    id: "invite",
    title: "invite",
    node: (
      <InviteScreen
        link="dreamabt.me/?invite=macy"
        copied={false}
        onCopy={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "accept",
    title: "accept",
    node: <AcceptInviteScreen name="macy" onAccept={noop} onSkip={noop} />,
  },
  {
    id: "pick",
    title: "pick a dream",
    node: (
      <GalleryPickScreen
        items={DEMO_GALLERY}
        selectedId="demo-quote"
        addMode={null}
        quote=""
        video=""
        canSend
        onBack={noop}
        onSelect={noop}
        onDelete={noop}
        onAddImage={noop}
        onChooseQuote={noop}
        onChooseVideo={noop}
        onQuote={noop}
        onVideo={noop}
        onSaveAdd={noop}
        onCancelAdd={noop}
        onSend={noop}
      />
    ),
  },
  {
    id: "sent",
    title: "sent",
    node: <DreamSentScreen onDone={noop} />,
  },
  {
    id: "bedtime",
    title: "bedtime",
    node: <BedtimeGateScreen onYes={noop} onNotYet={noop} />,
  },
  {
    id: "reveal",
    title: "reveal",
    node: (
      <RevealScreen
        item={DEMO_PENDING.item}
        fromName={DEMO_PENDING.fromName}
        onGoodnight={noop}
      />
    ),
  },
  {
    id: "reveal-empty",
    title: "reveal · nothing",
    node: <RevealScreen item={null} onGoodnight={noop} />,
  },
]

type CopyKind = "push" | "homescreen" | "os"

type CopyItem = {
  id: string
  title: string
  where: string
  kind: CopyKind
  titleText?: string
  body: string
  extra?: { label: string; text: string }[]
}

const COPY: CopyItem[] = [
  {
    id: "noti-bedtime",
    title: "bedtime push",
    where: "real lock-screen / banner notification at bedtime.",
    kind: "push",
    titleText: "dream about me",
    body: "time to dream",
  },
  {
    id: "noti-confirm",
    title: "confirm push",
    where: "real notification, the moment they allow notis.",
    kind: "push",
    titleText: "dream about me",
    body: "notis on. we will ping you at bedtime.",
  },
  {
    id: "noti-homescreen-name",
    title: "home screen name",
    where: "not a screen. the iOS Home Screen icon label, app switcher, and push app name.",
    kind: "homescreen",
    body: "dream about me",
    extra: [
      { label: "short name", text: "dreamabt" },
      { label: "apple title", text: "dream about me" },
    ],
  },
  {
    id: "noti-homescreen-blurb",
    title: "install blurb",
    where: "not a screen. the Add to Home Screen / share preview description, when iOS shows one.",
    kind: "os",
    body: "the last thing they see before they go to bed.",
  },
]

function loadNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )
  } catch {
    return {}
  }
}

function CopyPreview({ item }: { item: CopyItem }) {
  if (item.kind === "push") {
    return (
      <div className={styles.appleNoti}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.appleIcon} src="/icons/icon-192.png" alt="" />
        <div className={styles.appleMain}>
          <div className={styles.appleTop}>
            <p className={styles.appleApp}>dream about me</p>
            <p className={styles.appleNow}>now</p>
          </div>
          <p className={styles.appleTitle}>{item.titleText}</p>
          <p className={styles.appleBody}>{item.body}</p>
        </div>
      </div>
    )
  }
  if (item.kind === "homescreen") {
    return (
      <div className={styles.springboard}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.springIcon} src="/icons/icon-192.png" alt="" />
        <p className={styles.springName}>{item.body}</p>
      </div>
    )
  }
  return (
    <div className={styles.osExplain}>
      <p className={styles.osKicker}>iOS install sheet</p>
      <p className={styles.osBody}>{item.body}</p>
      {item.extra?.map((line) => (
        <p key={line.label} className={styles.osExtra}>
          {line.label}: {line.text}
        </p>
      ))}
    </div>
  )
}

export function UiBoard() {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setNotes(loadNotes())
    setReady(true)
  }, [])

  function setNote(id: string, value: string) {
    setNotes((prev) => {
      const next = { ...prev, [id]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* private mode / quota */
      }
      return next
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1>screens</h1>
        <p>notes stay on this device. add / take away whatever you want.</p>
        <nav className={styles.nav}>
          <a href="#notifications">notifications</a>
          {SCREENS.map((screen) => (
            <a key={screen.id} href={`#${screen.id}`}>
              {screen.title}
            </a>
          ))}
        </nav>
      </div>
      <div className={styles.list}>
        {SCREENS.map((screen) => (
          <section key={screen.id} id={screen.id} className={styles.row}>
            <div className={`${dream.shell} ${dream.preview}`}>{screen.node}</div>
            <div className={styles.meta}>
              <h2>{screen.title}</h2>
              <textarea
                className={styles.notes}
                value={ready ? (notes[screen.id] ?? "") : ""}
                onChange={(e) => setNote(screen.id, e.target.value)}
                placeholder="add / take away"
                spellCheck
              />
              <p className={styles.hint}>local only</p>
            </div>
          </section>
        ))}
      </div>
      <div id="notifications" className={styles.chapter}>
        <h1>notifications</h1>
        <p>
          only the real lock-screen pings and iOS chrome. onboarding hints and buttons
          stay with the screens above.
        </p>
        <nav className={styles.nav}>
          {COPY.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.title}
            </a>
          ))}
        </nav>
      </div>
      <div className={styles.list}>
        {COPY.map((item) => (
          <section key={item.id} id={item.id} className={styles.copyRow}>
            <div>
              <CopyPreview item={item} />
            </div>
            <div className={`${styles.meta} ${styles.metaShort}`}>
              <h2>{item.title}</h2>
              <p className={styles.where}>{item.where}</p>
              <textarea
                className={`${styles.notes} ${styles.notesShort}`}
                value={ready ? (notes[item.id] ?? "") : ""}
                onChange={(e) => setNote(item.id, e.target.value)}
                placeholder="rewrite"
                spellCheck
              />
              <p className={styles.hint}>local only</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
