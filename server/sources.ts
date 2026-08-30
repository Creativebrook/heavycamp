import { getLibraryTracks } from './bandcamp.js'

export type TrackSource = 'bandcamp' | 'jamendo' | 'audius'

export type HeavyCampTrack = {
  id: string
  source: TrackSource
  sourceId: string
  title: string
  artist: string
  artistId?: string
  album: string
  albumId?: string
  duration: number
  genre?: string
  subgenres?: string[]
  tags?: string[]
  year?: number
  track?: number
  created?: string
  coverArt?: string
  artworkUrl?: string
  bitRate?: number
  suffix?: string
  contentType?: string
  country?: string
  bpm?: number
  musicalKey?: string
  mood?: string
  license?: string
}

const JAMENDO = 'https://api.jamendo.com/v3.0'
const AUDIUS = 'https://discoveryprovider.audius.co/v1'

const genreMap: Record<string, { jamendoTag?: string; search: string }> = {
  metal: { jamendoTag: 'metal', search: 'metal' },
  metalcore: { jamendoTag: 'metalcore', search: 'metalcore' },
  'black metal': { jamendoTag: 'blackmetal', search: 'black metal' },
  blackmetal: { jamendoTag: 'blackmetal', search: 'black metal' },
  'doom metal': { jamendoTag: 'doommetal', search: 'doom metal' },
  doommetal: { jamendoTag: 'doommetal', search: 'doom metal' },
  'death metal': { jamendoTag: 'deathmetal', search: 'death metal' },
  deathmetal: { jamendoTag: 'deathmetal', search: 'death metal' },
  djent: { jamendoTag: 'djent', search: 'djent' },
  'power metal': { jamendoTag: 'powermetal', search: 'power metal' },
  powermetal: { jamendoTag: 'powermetal', search: 'power metal' },
  'thrash metal': { jamendoTag: 'thrashmetal', search: 'thrash metal' },
  thrashmetal: { jamendoTag: 'thrashmetal', search: 'thrash metal' },
  'industrial metal': { jamendoTag: 'industrialmetal', search: 'industrial metal' },
  industrialmetal: { jamendoTag: 'industrialmetal', search: 'industrial metal' },
  'post metal': { jamendoTag: 'postmetal', search: 'post metal' },
  postmetal: { jamendoTag: 'postmetal', search: 'post metal' },
  'progressive metal': { search: 'progressive metal' },
  progressive: { search: 'progressive metal' },
  deathcore: { search: 'deathcore' },
  sludge: { search: 'sludge metal' },
  nu: { search: 'nu metal' },
  'nu metal': { search: 'nu metal' },
  'symphonic metal': { search: 'symphonic metal' },
  'folk metal': { search: 'folk metal' },
}

function cleanTags(values: unknown[]): string[] {
  const out = values
    .flatMap(v => typeof v === 'string' ? v.split(',') : [])
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(out)]
}

function titleCase(value: string) {
  return value.replace(/(^|[\s-])\S/g, s => s.toUpperCase())
}

function inferSubgenres(tags: string[]): string[] {
  const aliases: Array<[RegExp, string]> = [
    [/metalcore/, 'Metalcore'],
    [/deathcore/, 'Deathcore'],
    [/blackmetal|black metal/, 'Black Metal'],
    [/doommetal|doom metal/, 'Doom Metal'],
    [/deathmetal|death metal/, 'Death Metal'],
    [/thrashmetal|thrash metal/, 'Thrash Metal'],
    [/powermetal|power metal/, 'Power Metal'],
    [/djent/, 'Djent'],
    [/postmetal|post metal/, 'Post-Metal'],
    [/progressive.*metal|progmetal/, 'Progressive Metal'],
    [/industrialmetal|industrial metal/, 'Industrial Metal'],
    [/symphonic.*metal/, 'Symphonic Metal'],
    [/folk.*metal/, 'Folk Metal'],
    [/sludge/, 'Sludge Metal'],
    [/numetal|nu metal/, 'Nu Metal'],
    [/heavymetal|heavy metal/, 'Heavy Metal'],
  ]
  return aliases.filter(([pattern]) => tags.some(tag => pattern.test(tag))).map(([,name]) => name)
}

function jamendoConfigured() {
  return Boolean(process.env.JAMENDO_CLIENT_ID)
}

function jamendoTags(track: any): string[] {
  const tags = track?.musicinfo?.tags || {}
  return cleanTags([...(tags.genres || []), ...(tags.instruments || []), ...(tags.vartags || [])])
}

function normalizeJamendo(track: any): HeavyCampTrack {
  const tags = jamendoTags(track)
  return {
    id: `jamendo:${track.id}`,
    source: 'jamendo',
    sourceId: String(track.id),
    title: String(track.name || 'Untitled'),
    artist: String(track.artist_name || 'Unknown artist'),
    artistId: track.artist_id ? String(track.artist_id) : undefined,
    album: String(track.album_name || 'Single'),
    albumId: track.album_id ? String(track.album_id) : undefined,
    duration: Number(track.duration || 0),
    genre: inferSubgenres(tags)[0] || 'Metal',
    subgenres: inferSubgenres(tags),
    tags,
    year: track.releasedate ? Number(String(track.releasedate).slice(0,4)) || undefined : undefined,
    created: track.releasedate ? String(track.releasedate) : undefined,
    artworkUrl: track.album_image || track.image || undefined,
    contentType: 'audio/mpeg',
    license: track.license_ccurl || undefined,
  }
}

function normalizeAudius(track: any): HeavyCampTrack {
  const tags = cleanTags([track.tags || '', track.genre || ''])
  const subs = inferSubgenres(tags)
  return {
    id: `audius:${track.id}`,
    source: 'audius',
    sourceId: String(track.id),
    title: String(track.title || 'Untitled'),
    artist: String(track.user?.name || track.user?.handle || 'Unknown artist'),
    artistId: track.user?.id ? String(track.user.id) : undefined,
    album: track.album_name ? String(track.album_name) : 'Audius',
    duration: Number(track.duration || 0),
    genre: subs[0] || String(track.genre || 'Metal'),
    subgenres: subs,
    tags,
    year: track.release_date ? Number(String(track.release_date).slice(0,4)) || undefined : undefined,
    created: track.release_date ? String(track.release_date) : undefined,
    artworkUrl: track.artwork?.['1000x1000'] || track.artwork?.['480x480'] || track.artwork?.['150x150'] || undefined,
    contentType: 'audio/mpeg',
    country: track.user?.location ? String(track.user.location) : undefined,
    bpm: track.bpm ? Number(track.bpm) : undefined,
    musicalKey: track.musical_key ? String(track.musical_key) : undefined,
    mood: track.mood ? titleCase(String(track.mood)) : undefined,
  }
}

export async function getBandcampTracks(): Promise<HeavyCampTrack[]> {
  const tracks = await getLibraryTracks()
  return tracks.map(track => ({
    ...track,
    source: 'bandcamp',
    sourceId: track.id,
    subgenres: track.genre ? [track.genre] : [],
    tags: track.genre ? [track.genre.toLowerCase()] : [],
  }))
}

async function jamendoRequest(params: Record<string,string|number|boolean|undefined>, limit = 24): Promise<HeavyCampTrack[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) return []
  const query = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(limit),
    include: 'musicinfo',
    audioformat: 'mp32',
  })
  for (const [key,value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const response = await fetch(`${JAMENDO}/tracks/?${query.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(18000),
  })
  if (!response.ok) return []
  const json: any = await response.json().catch(() => null)
  if (json?.headers?.status !== 'success') return []
  const rows = Array.isArray(json?.results) ? json.results : []
  return rows.filter((track:any) => Boolean(track.audio)).map(normalizeJamendo)
}

async function jamendoGenre(genre: string, limit = 24): Promise<HeavyCampTrack[]> {
  const key = genre.toLowerCase()
  const spec = genreMap[key] || { search: genre }
  let rows: HeavyCampTrack[] = []
  if (spec.jamendoTag) {
    rows = await jamendoRequest({ tags: spec.jamendoTag, boost: 'popularity_month', groupby: 'artist_id' }, limit)
  }
  if (rows.length < Math.min(8,limit)) {
    const fallback = await jamendoRequest({ search: spec.search, boost: 'popularity_month', type: 'single albumtrack' }, limit)
    const wanted = key.replace(/\s+/g,'')
    rows = [...rows, ...fallback.filter(track => {
      const hay = [...(track.tags || []), ...(track.subgenres || []).map(x=>x.toLowerCase()), track.title.toLowerCase()].join(' ').replace(/\s+/g,'')
      return wanted === 'metal' ? hay.includes('metal') : hay.includes(wanted) || hay.includes(spec.search.replace(/\s+/g,'').toLowerCase())
    })]
  }
  return dedupe(rows).slice(0,limit)
}

async function audiusRequest(path: string, params: Record<string,string|number|undefined>): Promise<HeavyCampTrack[]> {
  const query = new URLSearchParams()
  for (const [key,value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value))
  const response = await fetch(`${AUDIUS}${path}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(18000),
  })
  if (!response.ok) return []
  const json: any = await response.json().catch(() => null)
  const rows = Array.isArray(json?.data) ? json.data : []
  return rows
    .filter((track:any) => track?.is_streamable === true && !track?.is_stream_gated && track?.stream?.url)
    .map(normalizeAudius)
}

async function audiusGenre(genre: string, limit = 24): Promise<HeavyCampTrack[]> {
  const spec = genreMap[genre.toLowerCase()] || { search: genre }
  return audiusRequest('/tracks/search', { query: spec.search, genre: 'Metal', limit, sort_method: 'relevant' })
}

export function dedupe(tracks: HeavyCampTrack[]): HeavyCampTrack[] {
  const seen = new Set<string>()
  return tracks.filter(track => track.id && !seen.has(track.id) && (seen.add(track.id), true))
}

export const DISCOVER_GENRES = [
  'Metalcore','Black Metal','Death Metal','Doom Metal','Progressive Metal','Djent',
  'Thrash Metal','Power Metal','Industrial Metal','Post-Metal','Deathcore','Sludge Metal','Nu Metal'
]

export async function getDiscoverHome() {
  const [jamendoFeatured,jamendoNew,audiusTrending] = await Promise.all([
    jamendoConfigured() ? jamendoRequest({ tags:'metal', featured:'1', groupby:'artist_id', boost:'popularity_month' }, 24) : [],
    jamendoConfigured() ? jamendoRequest({ tags:'metal', order:'releasedate_desc', type:'single albumtrack' }, 24) : [],
    audiusRequest('/tracks/trending', { genre:'Metal', time:'week', limit:24 }),
  ])
  return {
    featured: dedupe(jamendoFeatured),
    newReleases: dedupe(jamendoNew),
    trending: dedupe(audiusTrending),
    genres: DISCOVER_GENRES,
  }
}

export async function searchSources(query: string, genre?: string, limit = 30) {
  const target = (genre || '').trim()
  const [jamendo,audius] = await Promise.all([
    target ? jamendoGenre(target,limit) : jamendoRequest({ search: query || 'metal', boost:'popularity_month', type:'single albumtrack' }, limit),
    target ? audiusGenre(target,limit) : audiusRequest('/tracks/search',{ query: query || 'metal', genre:'Metal', limit, sort_method:'relevant' }),
  ])
  const q = query.trim().toLowerCase()
  const filter = (track:HeavyCampTrack) => !q || [track.title,track.artist,track.album,...(track.tags||[]),...(track.subgenres||[])].some(v=>String(v).toLowerCase().includes(q))
  return { jamendo: jamendo.filter(filter), audius: audius.filter(filter) }
}

export async function getNewReleaseScan(limit = 40) {
  const [jamendo,audius] = await Promise.all([
    jamendoConfigured() ? jamendoRequest({ tags:'metal', order:'releasedate_desc', type:'single albumtrack' }, limit) : [],
    audiusRequest('/tracks/search',{ query:'metal', genre:'Metal', limit, sort_method:'recent' }),
  ])
  return dedupe([...jamendo,...audius])
}

export async function resolveRemoteStream(trackId: string): Promise<string | null> {
  if (trackId.startsWith('jamendo:')) {
    const sourceId = trackId.slice('jamendo:'.length)
    const rows = await jamendoRequest({ id: sourceId }, 1)
    if (!rows.length) return null
    const clientId = process.env.JAMENDO_CLIENT_ID
    if (!clientId) return null
    const query = new URLSearchParams({client_id:clientId,format:'json',limit:'1',id:sourceId,audioformat:'mp32'})
    const response = await fetch(`${JAMENDO}/tracks/?${query.toString()}`, {headers:{Accept:'application/json'}})
    const json:any = await response.json().catch(()=>null)
    return json?.results?.[0]?.audio || null
  }
  if (trackId.startsWith('audius:')) {
    const sourceId = trackId.slice('audius:'.length)
    const response = await fetch(`${AUDIUS}/tracks/${encodeURIComponent(sourceId)}`, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)})
    const json:any = await response.json().catch(()=>null)
    return json?.data?.stream?.url || null
  }
  return null
}
