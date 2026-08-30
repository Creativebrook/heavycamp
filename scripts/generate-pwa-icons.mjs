import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const sourcePath = path.join(root, 'public', 'icon-192.png')

for (const size of [384, 512]) {
  await sharp(sourcePath)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(root, 'public', `icon-${size}.png`))
}

console.log('Generated PWA icons: 384x384, 512x512')
