import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "public", "icons")

const BG = [58, 18, 25, 255]
const FG = [242, 184, 196, 255]

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 4, "ascii")
  data.copy(out, 8)
  const check = crc32(out.subarray(4, 8 + data.length))
  out.writeUInt32BE(check, 8 + data.length)
  return out
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function moon(x, y, size, pad) {
  const cx = size / 2
  const cy = size / 2
  const r = size * (0.5 - pad)
  const dx = x - cx + 0.5
  const dy = y - cy + 0.5
  const inDisc = dx * dx + dy * dy <= r * r
  const ox = cx + r * 0.28
  const orad = r * 0.78
  const cut = (x - ox + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= orad * orad
  return inDisc && !cut
}

function paintAny(x, y, size) {
  return moon(x, y, size, 0.16) ? FG : BG
}

function paintMaskable(x, y, size) {
  return moon(x, y, size, 0.28) ? FG : BG
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, "icon-192.png"), png(192, paintAny))
writeFileSync(join(outDir, "icon-512.png"), png(512, paintAny))
writeFileSync(join(outDir, "icon-512-maskable.png"), png(512, paintMaskable))
writeFileSync(join(outDir, "apple-touch-icon.png"), png(180, paintAny))
console.log("wrote pwa icons")
