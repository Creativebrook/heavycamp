import type { VercelRequest, VercelResponse } from '@vercel/node'

type TestSummary = {
  ok: boolean
  count: number
  streamable: number
  withArtwork: number
  samples: Array<Record<string, unknown>>
  error?: string
}

const jamendoBase = 'https://api.jamendo.com/v3.0'
const audiusBase = 'https://discoveryprovider.audius.co/v1'

function jamendoTags(track: any) {
  const musicinfo = track?.musicinfo || {}
  const tags = musicinfo?.tags || {}
  return [...(tags.genres || []), ...(tags.instruments || []), ...(tags.vartags || [])].filter(Boolean)
}

async function testJamendo(term: string): Promise<TestSummary> {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return { ok: false, count: 0, streamable: 0, withArtwork: 0, samples: [], error: 'JAMENDO_CLIENT_ID missing' }

  const qs = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: '20',
    fuzzytags: term,
    include: 'musicinfo',
    audioformat: 'mp32',
    order: 'popularity_total_desc'
  })
  const response = await fetch(`${jamendoBase}/tracks/?${qs.toString()}`, { headers: { accept: 'application/json' } })
  const json: any = await response.json().catch(() => null)
  if (!response.ok || json?.headers?.status !== 'success') {
    return {
      ok: false,
      count: 0,
      streamable: 0,
      withArtwork: 0,
      samples: [],
      error: json?.headers?.error_message || `Jamendo HTTP ${response.status}`
    }
  }
  const tracks = Array.isArray(json?.results) ? json.results : []
  return {
    ok: true,
    count: tracks.length,
    streamable: tracks.filter((t: any) => Boolean(t?.audio)).length,
    withArtwork: tracks.filter((t: any) => Boolean(t?.album_image || t?.image)).length,
    samples: tracks.slice(0, 5).map((t: any) => ({
      id: String(t.id),
      title: t.name,
      artist: t.artist_name,
      album: t.album_name,
      duration: t.duration,
      releaseDate: t.releasedate,
      tags: jamendoTags(t).slice(0, 12),
      audioPresent: Boolean(t.audio),
      artworkPresent: Boolean(t.album_image || t.image),
      downloadAllowed: Boolean(t.audiodownload_allowed),
      license: t.license_ccurl || null
    }))
  }
}

async function testJamendoSimilar(trackId?: string) {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId || !trackId) return { ok: false, count: 0, error: 'No Jamendo seed track available' }
  const qs = new URLSearchParams({ client_id: clientId, format: 'json', id: trackId, limit: '10', audioformat: 'mp32' })
  const response = await fetch(`${jamendoBase}/tracks/similar/?${qs.toString()}`, { headers: { accept: 'application/json' } })
  const json: any = await response.json().catch(() => null)
  const tracks = Array.isArray(json?.results) ? json.results : []
  return {
    ok: response.ok && json?.headers?.status === 'success',
    count: tracks.length,
    streamable: tracks.filter((t: any) => Boolean(t?.audio)).length,
    samples: tracks.slice(0, 5).map((t: any) => ({
      id: String(t.id),
      title: t.name,
      artist: t.artist_name,
      similarity: t.similarity || t.match || null
    })),
    error: json?.headers?.status === 'success' ? undefined : json?.headers?.error_message
  }
}

async function testAudius(term: string): Promise<TestSummary> {
  const qs = new URLSearchParams({ query: term, genre: 'Metal', limit: '20' })
  const response = await fetch(`${audiusBase}/tracks/search?${qs.toString()}`, { headers: { accept: 'application/json' } })
  const json: any = await response.json().catch(() => null)
  const tracks = Array.isArray(json?.data) ? json.data : []
  return {
    ok: response.ok,
    count: tracks.length,
    streamable: tracks.filter((t: any) => Boolean(t?.is_streamable && !t?.is_stream_gated && t?.stream?.url)).length,
    withArtwork: tracks.filter((t: any) => Boolean(t?.artwork?.['480x480'] || t?.artwork?.['1000x1000'])).length,
    samples: tracks.slice(0, 5).map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.user?.name,
      duration: t.duration,
      releaseDate: t.release_date,
      genre: t.genre,
      tags: t.tags || null,
      mood: t.mood || null,
      bpm: t.bpm || null,
      musicalKey: t.musical_key || null,
      playCount: t.play_count || 0,
      streamable: Boolean(t?.is_streamable && !t?.is_stream_gated && t?.stream?.url),
      artworkPresent: Boolean(t?.artwork?.['480x480'] || t?.artwork?.['1000x1000'])
    })),
    error: response.ok ? undefined : `Audius HTTP ${response.status}`
  }
}

async function testAudiusTrending() {
  const qs = new URLSearchParams({ genre: 'Metal', time: 'week', limit: '20' })
  const response = await fetch(`${audiusBase}/tracks/trending?${qs.toString()}`, { headers: { accept: 'application/json' } })
  const json: any = await response.json().catch(() => null)
  const tracks = Array.isArray(json?.data) ? json.data : []
  return {
    ok: response.ok,
    count: tracks.length,
    streamable: tracks.filter((t: any) => Boolean(t?.is_streamable && !t?.is_stream_gated && t?.stream?.url)).length,
    samples: tracks.slice(0, 5).map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.user?.name,
      tags: t.tags || null,
      releaseDate: t.release_date,
      playCount: t.play_count || 0
    }))
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const terms = ['metal', 'metalcore', 'black metal', 'doom metal']
    const jamendoEntries = await Promise.all(terms.map(async term => [term, await testJamendo(term)] as const))
    const audiusEntries = await Promise.all(terms.map(async term => [term, await testAudius(term)] as const))
    const jamendo = Object.fromEntries(jamendoEntries)
    const audius = Object.fromEntries(audiusEntries)
    const seedId = (jamendo.metal?.samples?.[0]?.id as string | undefined)

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      jamendoConfigured: Boolean(process.env.JAMENDO_CLIENT_ID),
      jamendo,
      jamendoSimilar: await testJamendoSimilar(seedId),
      audius,
      audiusTrending: await testAudiusTrending()
    })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Source test failed' })
  }
}
