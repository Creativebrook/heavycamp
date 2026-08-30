import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const root = process.cwd()
const sourcePath = path.join(root, 'public', 'icon-192.png')
const source = PNG.sync.read(fs.readFileSync(sourcePath))

function resizeBilinear(src, width, height) {
  const out = new PNG({ width, height })
  const sx = (src.width - 1) / Math.max(1, width - 1)
  const sy = (src.height - 1) / Math.max(1, height - 1)

  for (let y = 0; y < height; y++) {
    const fy = y * sy
    const y0 = Math.floor(fy)
    const y1 = Math.min(src.height - 1, y0 + 1)
    const wy = fy - y0

    for (let x = 0; x < width; x++) {
      const fx = x * sx
      const x0 = Math.floor(fx)
      const x1 = Math.min(src.width - 1, x0 + 1)
      const wx = fx - x0
      const outIndex = (y * width + x) * 4

      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c]
        const p10 = src.data[(y0 * src.width + x1) * 4 + c]
        const p01 = src.data[(y1 * src.width + x0) * 4 + c]
        const p11 = src.data[(y1 * src.width + x1) * 4 + c]
        const top = p00 + (p10 - p00) * wx
        const bottom = p01 + (p11 - p01) * wx
        out.data[outIndex + c] = Math.round(top + (bottom - top) * wy)
      }
    }
  }
  return out
}

for (const size of [384, 512]) {
  const image = resizeBilinear(source, size, size)
  fs.writeFileSync(path.join(root, 'public', `icon-${size}.png`), PNG.sync.write(image))
}

console.log('Generated PWA icons: 384x384, 512x512')
