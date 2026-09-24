import Head from "next/head"
import { DreamAboutMeApp } from "@/components/dream-about-me/DreamAboutMeApp"

export default function DreamPage() {
  return (
    <>
      <Head>
        <title>dream about me</title>
        <meta
          name="description"
          content="the last thing they see before they go to bed."
        />
        <meta name="theme-color" content="#3a1219" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <div data-dream-root="" style={{ background: "#3a1219", color: "#f2b8c4", minHeight: "100dvh" }}>
        <DreamAboutMeApp />
      </div>
    </>
  )
}
