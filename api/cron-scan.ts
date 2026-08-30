import type { VercelRequest,VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { requireCron } from '../server/auth.js'
import { dedupe,getBandcampTracks,getNewReleaseScan } from '../server/sources.js'
import { bootstrap,dbConfigured,markScan,markSeen,scanState,syncTracks } from '../server/storage.js'

function matchesGenres(track:any,wanted:string[]){
  if(!wanted.length)return true
  const hay=[
    track.genre,
    ...(Array.isArray(track.subgenres)?track.subgenres:[]),
    ...(Array.isArray(track.tags)?track.tags:[])
  ].filter(Boolean).map((value:string)=>String(value).toLowerCase().replace(/[^a-z0-9]/g,''))
  return wanted.some(value=>{
    const needle=String(value).toLowerCase().replace(/[^a-z0-9]/g,'')
    return hay.some(item=>item.includes(needle)||needle.includes(item))
  })
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET')return res.status(405).end()
  if(!requireCron(req,res))return
  if(!dbConfigured())return res.status(503).json({error:'DATABASE_URL is not configured'})

  try{
    await bootstrap()
    const [bandcamp,discovery,state]=await Promise.all([
      getBandcampTracks().catch(()=>[]),
      getNewReleaseScan(50),
      scanState()
    ])
    const tracks=dedupe([...bandcamp,...discovery])
    const baseline=state.ids.size===0
    const fresh=tracks.filter(track=>!state.ids.has(track.id))

    await syncTracks(tracks)
    await markSeen(tracks.map(track=>track.id))
    await markScan()

    let notified=0
    let matching:any[]=[]
    if(!baseline&&fresh.length&&state.settings.notificationsEnabled&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){
      const wanted=Array.isArray(state.settings.notificationGenres)?state.settings.notificationGenres:[]
      matching=fresh.filter(track=>matchesGenres(track,wanted))
      if(matching.length){
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT||'https://heavycamp.vercel.app',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        )
        const first=matching[0]
        const payload=JSON.stringify({
          title:matching.length===1?`New ${first.genre||'Metal'} in HeavyCamp`:`${matching.length} new HeavyCamp releases`,
          body:matching.length===1?`${first.artist} — ${first.title}`:'Fresh Jamendo, Audius and Bandcamp music matched your preferences.',
          url:'/?view=discover',
          tag:'heavycamp-new'
        })
        const sent=await Promise.allSettled(state.subs.map(subscription=>webpush.sendNotification({
          endpoint:String(subscription.endpoint),
          keys:{p256dh:String(subscription.p256dh),auth:String(subscription.auth)}
        },payload)))
        notified=sent.filter(result=>result.status==='fulfilled').length
      }
    }

    return res.json({
      ok:true,
      scanned:tracks.length,
      bandcamp:bandcamp.length,
      discovery:discovery.length,
      newTracks:fresh.length,
      matched:matching.length,
      baseline,
      notified
    })
  }catch(error){
    return res.status(500).json({error:error instanceof Error?error.message:'Daily scan failed'})
  }
}
