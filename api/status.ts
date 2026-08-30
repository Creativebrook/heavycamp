import type { VercelRequest, VercelResponse } from '@vercel/node'
import { bandcampConfigured } from '../server/bandcamp.js'
import { dbConfigured } from '../server/storage.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  return res.status(200).json({
    ok: true,
    configured: {
      accessKey: Boolean(process.env.HEAVYCAMP_ACCESS_KEY),
      bandcamp: bandcampConfigured(),
      jamendo: Boolean(process.env.JAMENDO_CLIENT_ID),
      audius: true,
      database: dbConfigured(),
      push: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      cronSecret: Boolean(process.env.CRON_SECRET)
    },
    version: '0.2.0'
  })
}
