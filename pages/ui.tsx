import Head from "next/head"
import { UiBoard } from "@/components/dream-about-me/UiBoard"

export default function UiPage() {
  return (
    <>
      <Head>
        <title>screens · dream about me</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#241016" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <UiBoard />
    </>
  )
}
