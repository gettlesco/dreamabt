import { parseVideoUrl } from "@/lib/dream-about-me"

type VideoEmbedProps = {
  url: string
  variant: "tile" | "full"
}

export function VideoEmbed({ url, variant }: VideoEmbedProps) {
  const parsed = parseVideoUrl(url)

  if (variant === "tile") {
    if (parsed.thumbSrc) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={parsed.thumbSrc}
          alt={parsed.label}
          className="h-full w-full object-cover"
        />
      )
    }
    return (
      <div className="flex h-full w-full flex-col justify-end p-3">
        <p className="opacity-50">{parsed.label}</p>
        <p className="mt-1 line-clamp-3">{url}</p>
      </div>
    )
  }

  if (parsed.embedSrc) {
    return (
      <div>
        <iframe
          src={parsed.embedSrc}
          title={parsed.label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", aspectRatio: "9 / 16", border: 0, background: "var(--dream-forest)" }}
        />
        <a href={parsed.url} target="_blank" rel="noreferrer">
          {parsed.label}
        </a>
      </div>
    )
  }

  return (
    <a href={parsed.url} target="_blank" rel="noreferrer">
      {parsed.url}
    </a>
  )
}
