import Head from "next/head"
import { EmojiLab } from "@/components/dream-about-me/EmojiLab"

export default function EmojiLabPage() {
  return (
    <>
      <Head>
        <title>emoji set · dream about me</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#3a1219" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <EmojiLab />
    </>
  )
}
