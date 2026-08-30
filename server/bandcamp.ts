import { createHash, randomBytes } from 'node:crypto'

export type BandcampTrack = {
  id: string
  title: string
  artist: string
  artistId?: string
  album: string
  albumId?: string
  duration: number
  genre?: string
  year?: number
  track?: number
  created?: string
  coverArt?: string
  bitRate?: number
  suffix?: string
  contentType?: string
  country?: string
}

type SubsonicRoot = Record<string, any> & { status?: string; error?: { code?: number | string; message?: string } }

export function bandcampConfigured() {
  return Boolean(process.env.BANDCAMP_SUBSONIC_USERNAME && process.env.BANDCAMP_SUBSONIC_PASSWORD)
}

function restRoot() {
  const base = (process.env.BANDCAMP_SUBSONIC_URL || 'https://bandcamp.com/api/subsonic').replace(/\/+$/, '')
  return base.endsWith('/rest') ? base : `${base}/rest`
}

function authParams() {
  const username = process.env.BANDCAMP_SUBSONIC_USERNAME
  const password = process.env.BANDCAMP_SUBSONIC_PASSWORD
  if (!username || !password) throw new Error('Bandcamp Subsonic credentials are not configured')
  const salt = randomBytes(8).toString('hex')
  const token = createHash('md5').update(`${password}${salt}`, 'utf8').digest('hex')
  return { u: username, t: token, s: salt, v: '1.16.1', c: 'HeavyCamp', f: 'json' }
}

export function endpointUrl(endpoint: string, extra: Record<string, string | number | boolean | undefined> = {}) {
  const url = new URL(`${restRoot()}/${endpoint}.view`)
  const params = { ...authParams(), ...extra }
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value))
  return url
}

export async function callSubsonic(endpoint: string, extra: Record<string, string | number | boolean | undefined> = {}) {
  const response = await fetch(endpointUrl(endpoint, extra), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Bandcamp transport error ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) throw new Error(`Bandcamp endpoint ${endpoint} is not supported by this server`)
  const body = await response.json().catch(() => null) as Record<string, any> | null
  const root: SubsonicRoot | undefined = body?.['subsonic-response']
  if (!root) throw new Error(`Bandcamp endpoint ${endpoint} returned an unsupported response`)
  if (root.status !== 'ok') throw new Error(root.error?.message || `Bandcamp API error on ${endpoint}`)
  return root
}

export async function getAlbums() {
  const all: any[] = []
  const pageSize = 500
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const root = await callSubsonic('getAlbumList2', { type: 'newest', size: pageSize, offset })
    const page = Array.isArray(root.albumList2?.album) ? root.albumList2.album : root.albumList2?.album ? [root.albumList2.album] : []
    all.push(...page)
    if (page.length < pageSize) break
  }
  return all
}

export async function getLibraryTracks(): Promise<BandcampTrack[]> {
  const albums = await getAlbums()
  const tracks: BandcampTrack[] = []
  const concurrency = 6
  for (let i = 0; i < albums.length; i += concurrency) {
    const batch = albums.slice(i, i + concurrency)
    const details = await Promise.all(batch.map(async album => {
      try { return await callSubsonic('getAlbum', { id: album.id }) } catch { return null }
    }))
    for (const root of details) {
      const album = root?.album
      if (!album) continue
      const songs = Array.isArray(album.song) ? album.song : album.song ? [album.song] : []
      for (const song of songs) tracks.push({
        id: String(song.id), title: String(song.title || 'Untitled'), artist: String(song.artist || album.artist || 'Unknown artist'),
        artistId: song.artistId ? String(song.artistId) : undefined, album: String(song.album || album.name || 'Unknown album'),
        albumId: song.albumId ? String(song.albumId) : album.id ? String(album.id) : undefined, duration: Number(song.duration || 0),
        genre: song.genre ? String(song.genre) : album.genre ? String(album.genre) : undefined, year: song.year ? Number(song.year) : album.year ? Number(album.year) : undefined,
        track: song.track ? Number(song.track) : undefined, created: song.created ? String(song.created) : album.created ? String(album.created) : undefined,
        coverArt: song.coverArt ? String(song.coverArt) : album.coverArt ? String(album.coverArt) : undefined, bitRate: song.bitRate ? Number(song.bitRate) : undefined,
        suffix: song.suffix ? String(song.suffix) : undefined, contentType: song.contentType ? String(song.contentType) : undefined,
      })
    }
  }
  return tracks
}
