import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function tokenFor(key: string) {
  return createHmac('sha256', key).update('heavycamp-session-v1').digest('hex')
}

function cookie(req: VercelRequest, name: string) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

export function validateKey(key: string) {
  const expected = process.env.HEAVYCAMP_ACCESS_KEY
  return Boolean(expected && key && safeEqual(key, expected))
}

export function setSession(res: VercelResponse) {
  const key = process.env.HEAVYCAMP_ACCESS_KEY
  if (!key) throw new Error('HEAVYCAMP_ACCESS_KEY is not configured')
  res.setHeader('Set-Cookie', `heavycamp_session=${encodeURIComponent(tokenFor(key))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`)
}

export function clearSession(res: VercelResponse) {
  res.setHeader('Set-Cookie', 'heavycamp_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
}

export function requireAccess(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.HEAVYCAMP_ACCESS_KEY
  if (!expected) {
    res.status(503).json({ error: 'HEAVYCAMP_ACCESS_KEY is not configured', code: 'ACCESS_KEY_MISSING' })
    return false
  }
  const header = req.headers['x-heavycamp-key']
  const supplied = Array.isArray(header) ? header[0] : header
  if (supplied && safeEqual(supplied, expected)) return true
  const session = cookie(req, 'heavycamp_session')
  if (session && safeEqual(session, tokenFor(expected))) return true
  res.status(401).json({ error: 'HeavyCamp is locked', code: 'UNAUTHORIZED' })
  return false
}

export function requireCron(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  if (req.headers.authorization === `Bearer ${secret}`) return true
  res.status(401).json({ error: 'Invalid cron authorization' })
  return false
}
