import { Readable } from 'node:stream'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { endpointUrl } from '../server/bandcamp.js'
import { resolveRemoteArtwork, type TrackSource } from '../server/sources.js'

function forwardImageHeaders(upstream: Response, res: VercelResponse) {
  for (const header of ['content-type','content-length','etag','last-modified']) {
    const value = upstream.headers.get(header)
    if (value) res.setHeader(header, value)
  }
  res.setHeader('Cache-Control', 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end()

  const source = typeof req.query.source === 'string' ? req.query.source as TrackSource : null
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!source || !id || !['bandcamp','jamendo','audius'].includes(source)) return res.status(400).end()

  try {
    let url: URL | string | null = null

    if (source === 'bandcamp') {
      url = endpointUrl('getCoverArt', { id })
    } else {
      url = await resolveRemoteArtwork(source, id)
    }

    if (!url) return res.status(404).end()

    const upstream = await fetch(url, {
      method: req.method,
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })

    if (!upstream.ok) return res.status(upstream.status).end()

    res.statusCode = upstream.status
    forwardImageHeaders(upstream, res)

    if (req.method === 'HEAD' || !upstream.body) return res.end()
    Readable.fromWeb(upstream.body as any).pipe(res)
  } catch (error) {
    console.error('HeavyCamp artwork proxy error', error)
    return res.status(502).end()
  }
}
