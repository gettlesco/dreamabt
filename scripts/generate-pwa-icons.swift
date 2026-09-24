import AppKit

let bg = NSColor(srgbRed: 58.0 / 255.0, green: 18.0 / 255.0, blue: 25.0 / 255.0, alpha: 1)
let emoji = "🌝"

func render(size: Int, scale: CGFloat) -> Data {
  let canvas = CGFloat(size)
  guard
    let rep = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: size,
      pixelsHigh: size,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    )
  else {
    fputs("could not make bitmap\n", stderr)
    exit(1)
  }
  rep.size = NSSize(width: canvas, height: canvas)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  bg.setFill()
  NSRect(x: 0, y: 0, width: canvas, height: canvas).fill()
  let font = NSFont(name: "Apple Color Emoji", size: canvas * scale) ?? NSFont.systemFont(ofSize: canvas * scale)
  let text = NSAttributedString(string: emoji, attributes: [.font: font])
  let bounds = text.size()
  let point = NSPoint(x: (canvas - bounds.width) / 2, y: (canvas - bounds.height) / 2)
  text.draw(at: point)
  NSGraphicsContext.restoreGraphicsState()
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("could not encode png\n", stderr)
    exit(1)
  }
  return png
}

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let files: [(String, Int, CGFloat)] = [
  ("icon-192.png", 192, 0.78),
  ("icon-512.png", 512, 0.78),
  ("icon-512-maskable.png", 512, 0.62),
  ("apple-touch-icon.png", 180, 0.78),
  ("favicon-16.png", 16, 0.86),
  ("favicon-32.png", 32, 0.86),
  ("favicon-48.png", 48, 0.86),
]
for (name, size, scale) in files {
  let url = root.appendingPathComponent(name)
  try render(size: size, scale: scale).write(to: url)
}
print("wrote pwa icons")
