import { useEffect } from "react"
import "@/styles/globals.css"
import type { AppProps } from "next/app"
import { Analytics } from "@vercel/analytics/next"
import { registerDreamWorker } from "@/lib/dream-pwa"

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    void registerDreamWorker()
  }, [])

  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
