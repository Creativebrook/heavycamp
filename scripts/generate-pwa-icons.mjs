import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const sourceBase64 = await fs.readFile(path.join(root, 'public', 'icon-source.b64'), 'utf8')
const sourceBuffer = Buffer.from(sourceBase64.trim(), 'base64')

for (const size of [192, 384, 512]) {
  await sharp(sourceBuffer)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(root, 'public', `icon-${size}.png`))
}

console.log('Generated HeavyCamp icons from uploaded artwork: 192x192, 384x384, 512x512')
