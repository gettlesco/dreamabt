import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "public", "icons")
const rendered = spawnSync("swift", ["scripts/generate-pwa-icons.swift", outDir], {
  cwd: root,
  stdio: "inherit",
})
if (rendered.status !== 0) process.exit(rendered.status ?? 1)

function ico(images) {
  const count = images.length
  const header = 6 + count * 16
  let offset = header
  const dir = Buffer.alloc(header)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(count, 4)
  const parts = [dir]
  images.forEach((image, index) => {
    const at = 6 + index * 16
    dir[at] = image.size === 256 ? 0 : image.size
    dir[at + 1] = image.size === 256 ? 0 : image.size
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(image.png.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += image.png.length
    parts.push(image.png)
  })
  return Buffer.concat(parts)
}

const sizes = [16, 32, 48]
const images = sizes.map((size) => ({
  size,
  png: readFileSync(join(outDir, `favicon-${size}.png`)),
}))
writeFileSync(join(root, "public", "favicon.ico"), ico(images))
for (const size of sizes) unlinkSync(join(outDir, `favicon-${size}.png`))
console.log("wrote public/favicon.ico")
