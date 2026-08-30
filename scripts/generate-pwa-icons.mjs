import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const sourcePath = path.join(root, 'public', 'icon.svg')

for (const size of [192, 384, 512]) {
  await sharp(sourcePath, { density: 384 })
    .resize(size, size, { fit: 'contain', background: '#05070b' })
    .png()
    .toFile(path.join(root, 'public', `icon-${size}.png`))
}

console.log('Generated PWA icons: 192x192, 384x384, 512x512')
