import { neon } from '@neondatabase/serverless'
import type { HeavyCampTrack } from './sources.js'

export const migration = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS tracks_cache(
    track_id text PRIMARY KEY,
    source text NOT NULL DEFAULT 'bandcamp',
    source_id text,
    album_id text,
    artist_id text,
    title text NOT NULL,
    artist text NOT NULL,
    album text NOT NULL,
    duration_seconds integer NOT NULL,
    genre text,
    year integer,
    source_created_at timestamptz,
    cover_art_id text,
    artwork_url text,
    bitrate integer,
    content_type text,
    country text,
    subgenres jsonb NOT NULL DEFAULT '[]',
    tags jsonb NOT NULL DEFAULT '[]',
    bpm numeric,
    musical_key text,
    mood text,
    license text,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bandcamp'`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS source_id text`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS artwork_url text`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS bpm numeric`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS musical_key text`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS mood text`,
  `ALTER TABLE tracks_cache ADD COLUMN IF NOT EXISTS license text`,
  `CREATE TABLE IF NOT EXISTS track_preferences(track_id text PRIMARY KEY,liked boolean NOT NULL DEFAULT false,disliked boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS listening_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,track_id text NOT NULL,listened_ms integer NOT NULL DEFAULT 0,duration_ms integer,completed boolean NOT NULL DEFAULT false,skipped_early boolean NOT NULL DEFAULT false,repeated boolean NOT NULL DEFAULT false,queue_context jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS track_stats(track_id text PRIMARY KEY,plays integer NOT NULL DEFAULT 0,completes integer NOT NULL DEFAULT 0,skips_early integer NOT NULL DEFAULT 0,repeats integer NOT NULL DEFAULT 0,total_listened_ms bigint NOT NULL DEFAULT 0,last_played_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS app_state(id text PRIMARY KEY,state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS user_preferences(id text PRIMARY KEY,settings jsonb NOT NULL,last_collection_scan_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint text PRIMARY KEY,p256dh text NOT NULL,auth text NOT NULL,expiration_time bigint,user_agent text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS playlists(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,source text NOT NULL DEFAULT 'heavycamp',bandcamp_playlist_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,track_id text NOT NULL,position integer NOT NULL,added_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(playlist_id,track_id))`,
  `CREATE TABLE IF NOT EXISTS discovery_seen(track_id text PRIMARY KEY,first_seen_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS listening_events_track_idx ON listening_events(track_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS playlist_tracks_position_idx ON playlist_tracks(playlist_id,position)`,
  `CREATE INDEX IF NOT EXISTS tracks_cache_source_idx ON tracks_cache(source,source_created_at DESC)`
]

function sql(){
  const url=process.env.DATABASE_URL
  if(!url)throw new Error('DATABASE_URL is not configured')
  return neon(url)
}
export const dbConfigured=()=>Boolean(process.env.DATABASE_URL)

let schemaPromise:Promise<void>|null=null
export async function bootstrap(){
  if(!dbConfigured())throw new Error('DATABASE_URL is not configured')
  if(!schemaPromise){
    schemaPromise=(async()=>{
      const q=sql() as any
      for(const statement of migration)await q.query(statement,[])
    })().catch(error=>{schemaPromise=null;throw error})
  }
  await schemaPromise
}

function validDate(value?:string){
  return value&&Date.parse(value)?new Date(value).toISOString():null
}

function jsonArray(value:unknown){
  return JSON.stringify(Array.isArray(value)?value:[])
}

export async function syncTracks(tracks:HeavyCampTrack[]){
  if(!tracks.length)return
  await bootstrap()
  const q=sql()
  for(const t of tracks){
    await q`INSERT INTO tracks_cache(
      track_id,source,source_id,album_id,artist_id,title,artist,album,duration_seconds,genre,year,source_created_at,
      cover_art_id,artwork_url,bitrate,content_type,country,subgenres,tags,bpm,musical_key,mood,license,last_seen_at,updated_at
    ) VALUES(
      ${t.id},${t.source},${t.sourceId},${t.albumId||null},${t.artistId||null},${t.title},${t.artist},${t.album},${Math.round(t.duration||0)},
      ${t.genre||null},${t.year||null},${validDate(t.created)},${t.coverArt||null},${t.artworkUrl||null},${t.bitRate||null},
      ${t.contentType||null},${t.country||null},${jsonArray(t.subgenres)}::jsonb,${jsonArray(t.tags)}::jsonb,${t.bpm||null},
      ${t.musicalKey||null},${t.mood||null},${t.license||null},now(),now()
    ) ON CONFLICT(track_id) DO UPDATE SET
      source=excluded.source,source_id=excluded.source_id,album_id=excluded.album_id,artist_id=excluded.artist_id,title=excluded.title,
      artist=excluded.artist,album=excluded.album,duration_seconds=excluded.duration_seconds,genre=excluded.genre,year=excluded.year,
      source_created_at=excluded.source_created_at,cover_art_id=excluded.cover_art_id,artwork_url=excluded.artwork_url,bitrate=excluded.bitrate,
      content_type=excluded.content_type,country=excluded.country,subgenres=excluded.subgenres,tags=excluded.tags,bpm=excluded.bpm,
      musical_key=excluded.musical_key,mood=excluded.mood,license=excluded.license,last_seen_at=now(),updated_at=now()`
  }
}

function mapTrack(row:any):HeavyCampTrack{
  return {
    id:String(row.trackId??row.track_id),
    source:(row.source||'bandcamp') as any,
    sourceId:String(row.sourceId??row.source_id??row.trackId??row.track_id),
    title:String(row.title||'Untitled'),
    artist:String(row.artist||'Unknown artist'),
    artistId:row.artistId??row.artist_id??undefined,
    album:String(row.album||'Unknown album'),
    albumId:row.albumId??row.album_id??undefined,
    duration:Number(row.duration??row.duration_seconds??0),
    genre:row.genre??undefined,
    subgenres:Array.isArray(row.subgenres)?row.subgenres:[],
    tags:Array.isArray(row.tags)?row.tags:[],
    year:row.year?Number(row.year):undefined,
    created:row.created??row.source_created_at??undefined,
    coverArt:row.coverArt??row.cover_art_id??undefined,
    artworkUrl:row.artworkUrl??row.artwork_url??undefined,
    bitRate:row.bitRate??row.bitrate?Number(row.bitRate??row.bitrate):undefined,
    contentType:row.contentType??row.content_type??undefined,
    country:row.country??undefined,
    bpm:row.bpm?Number(row.bpm):undefined,
    musicalKey:row.musicalKey??row.musical_key??undefined,
    mood:row.mood??undefined,
    license:row.license??undefined,
  }
}

const trackSelect=`
  SELECT track_id AS "trackId",source,source_id AS "sourceId",album_id AS "albumId",artist_id AS "artistId",
  title,artist,album,duration_seconds AS duration,genre,year,source_created_at AS created,cover_art_id AS "coverArt",
  artwork_url AS "artworkUrl",bitrate AS "bitRate",content_type AS "contentType",country,subgenres,tags,bpm,
  musical_key AS "musicalKey",mood,license
  FROM tracks_cache
`

export async function userData(){
  await bootstrap()
  const q=sql()
  const [settings,state,preferences,stats]=await Promise.all([
    q`SELECT settings FROM user_preferences WHERE id='main' LIMIT 1`,
    q`SELECT state FROM app_state WHERE id='main' LIMIT 1`,
    q`SELECT track_id AS "trackId",liked,disliked FROM track_preferences`,
    q`SELECT track_id AS "trackId",plays,completes,skips_early AS "skipsEarly",repeats,total_listened_ms AS "totalListenedMs",last_played_at AS "lastPlayedAt" FROM track_stats`
  ])
  return{settings:settings[0]?.settings||null,state:state[0]?.state||null,preferences,stats}
}

export async function likedTracks(){
  await bootstrap()
  const q=sql() as any
  const rows=await q.query(`${trackSelect} WHERE track_id IN (SELECT track_id FROM track_preferences WHERE liked=true) ORDER BY updated_at DESC`,[])
  return rows.map(mapTrack)
}

export async function preference(trackId:string,value:string,track?:HeavyCampTrack){
  await bootstrap()
  if(track)await syncTracks([track])
  const q=sql(),liked=value==='liked',disliked=value==='disliked'
  await q`INSERT INTO track_preferences(track_id,liked,disliked,updated_at) VALUES(${trackId},${liked},${disliked},now()) ON CONFLICT(track_id) DO UPDATE SET liked=${liked},disliked=${disliked},updated_at=now()`
}

export async function saveState(state:unknown){
  await bootstrap()
  await sql()`INSERT INTO app_state(id,state,updated_at) VALUES('main',${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=now()`
}

export async function saveSettings(settings:unknown){
  await bootstrap()
  await sql()`INSERT INTO user_preferences(id,settings,updated_at) VALUES('main',${JSON.stringify(settings)}::jsonb,now()) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings,updated_at=now()`
}

export async function history(body:any){
  await bootstrap()
  if(body.track)await syncTracks([body.track as HeavyCampTrack])
  const q=sql(),ms=Math.max(0,Math.round(Number(body.listenedMs||0))),done=Boolean(body.completed),skip=Boolean(body.skippedEarly),repeat=Boolean(body.repeated)
  await q`INSERT INTO listening_events(track_id,listened_ms,duration_ms,completed,skipped_early,repeated,queue_context) VALUES(${String(body.trackId)},${ms},${body.durationMs?Math.round(Number(body.durationMs)):null},${done},${skip},${repeat},${JSON.stringify(body.queueContext||{})}::jsonb)`
  await q`INSERT INTO track_stats(track_id,plays,completes,skips_early,repeats,total_listened_ms,last_played_at,updated_at) VALUES(${String(body.trackId)},1,${done?1:0},${skip?1:0},${repeat?1:0},${ms},now(),now()) ON CONFLICT(track_id) DO UPDATE SET plays=track_stats.plays+1,completes=track_stats.completes+${done?1:0},skips_early=track_stats.skips_early+${skip?1:0},repeats=track_stats.repeats+${repeat?1:0},total_listened_ms=track_stats.total_listened_ms+${ms},last_played_at=now(),updated_at=now()`
}

export async function getPlaylists(){
  await bootstrap()
  const q=sql() as any
  const playlists=await q.query(`SELECT id::text,name,source,bandcamp_playlist_id AS "bandcampPlaylistId" FROM playlists ORDER BY created_at`,[])
  const links=await q.query(`SELECT playlist_id::text AS "playlistId",track_id AS "trackId" FROM playlist_tracks ORDER BY position`,[])
  const ids=[...new Set(links.map((x:any)=>String(x.trackId)))]
  let tracks:HeavyCampTrack[]=[]
  if(ids.length){
    const rows=await q.query(`${trackSelect} WHERE track_id = ANY($1::text[])`,[ids])
    tracks=rows.map(mapTrack)
  }
  const byId=new Map(tracks.map(track=>[track.id,track]))
  return playlists.map((playlist:any)=>{
    const trackIds=links.filter((link:any)=>link.playlistId===playlist.id).map((link:any)=>String(link.trackId))
    return {...playlist,trackIds,tracks:trackIds.map((id:string)=>byId.get(id)).filter(Boolean)}
  })
}

export async function playlistAction(body:any){
  await bootstrap()
  const q=sql()
  if(body.action==='create'){
    const rows=await q`INSERT INTO playlists(name) VALUES(${String(body.name).trim()}) RETURNING id::text,name,source,bandcamp_playlist_id AS "bandcampPlaylistId"`
    return{...rows[0],trackIds:[],tracks:[]}
  }
  if(body.action==='add'){
    if(body.track)await syncTracks([body.track as HeavyCampTrack])
    const rows=await q`SELECT COALESCE(MAX(position),-1)+1 AS p FROM playlist_tracks WHERE playlist_id=${String(body.playlistId)}::uuid`
    await q`INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(${String(body.playlistId)}::uuid,${String(body.trackId)},${Number(rows[0]?.p||0)}) ON CONFLICT DO NOTHING`
    return{ok:true}
  }
  if(body.action==='remove'){
    await q`DELETE FROM playlist_tracks WHERE playlist_id=${String(body.playlistId)}::uuid AND track_id=${String(body.trackId)}`
    return{ok:true}
  }
  throw new Error('Unknown playlist action')
}

export async function savePush(subscription:any,userAgent:string|null){
  await bootstrap()
  await sql()`INSERT INTO push_subscriptions(endpoint,p256dh,auth,expiration_time,user_agent,updated_at) VALUES(${subscription.endpoint},${subscription.keys.p256dh},${subscription.keys.auth},${subscription.expirationTime||null},${userAgent},now()) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,expiration_time=excluded.expiration_time,user_agent=excluded.user_agent,updated_at=now()`
}

export async function scanState(){
  await bootstrap()
  const q=sql()
  const [seen,prefs,subs]=await Promise.all([
    q`SELECT track_id FROM discovery_seen`,
    q`SELECT settings,last_collection_scan_at FROM user_preferences WHERE id='main'`,
    q`SELECT endpoint,p256dh,auth FROM push_subscriptions`
  ])
  return{ids:new Set(seen.map(row=>String(row.track_id))),settings:(prefs[0]?.settings||{}) as any,last:prefs[0]?.last_collection_scan_at,subs}
}

export async function markSeen(trackIds:string[]){
  if(!trackIds.length)return
  await bootstrap()
  const q=sql()
  for(const id of trackIds)await q`INSERT INTO discovery_seen(track_id) VALUES(${id}) ON CONFLICT DO NOTHING`
}

export async function markScan(){
  await bootstrap()
  await sql()`INSERT INTO user_preferences(id,settings,last_collection_scan_at,updated_at) VALUES('main','{}'::jsonb,now(),now()) ON CONFLICT(id) DO UPDATE SET last_collection_scan_at=now(),updated_at=now()`
}
