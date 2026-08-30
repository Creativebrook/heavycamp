import type { VercelRequest,VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { requireAccess } from '../server/auth.js'
import { bandcampConfigured } from '../server/bandcamp.js'
import { getBandcampTracks,getDiscoverHome,searchSources } from '../server/sources.js'
import {
  bootstrap,dbConfigured,getPlaylists,history,likedTracks,playlistAction,preference,
  savePush,saveSettings,saveState,scanState,syncTracks,userData
} from '../server/storage.js'

const body=(req:VercelRequest)=>typeof req.body==='string'?JSON.parse(req.body):req.body||{}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(!requireAccess(req,res))return
  const action=String(req.query.action||'')
  try{
    if(action==='health')return res.json({
      ok:true,
      bandcamp:bandcampConfigured(),
      jamendo:Boolean(process.env.JAMENDO_CLIENT_ID),
      audius:true,
      database:dbConfigured(),
      push:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),
      version:'0.2.0'
    })

    if(action==='config')return res.json({
      vapidPublicKey:process.env.VAPID_PUBLIC_KEY||null,
      features:{
        push:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),
        discovery:Boolean(process.env.JAMENDO_CLIENT_ID)
      }
    })

    if(action==='library'){
      const tracks=bandcampConfigured()?await getBandcampTracks():[]
      if(dbConfigured())try{await syncTracks(tracks)}catch(error){console.warn(error)}
      return res.json({tracks,count:tracks.length})
    }

    if(action==='discover'){
      if(req.method==='POST'){
        const b=body(req)
        const result=await searchSources(String(b.query||''),b.genre?String(b.genre):undefined,Number(b.limit||30))
        if(dbConfigured())try{await syncTracks([...result.jamendo,...result.audius])}catch(error){console.warn(error)}
        return res.json(result)
      }
      const result=await getDiscoverHome()
      if(dbConfigured())try{await syncTracks([...result.featured,...result.newReleases,...result.trending])}catch(error){console.warn(error)}
      return res.json(result)
    }

    if(!dbConfigured())return res.status(503).json({error:'DATABASE_URL is not configured'})
    await bootstrap()

    if(action==='bootstrap'&&req.method==='POST')return res.json({ok:true})
    if(action==='userData')return res.json(await userData())
    if(action==='likedTracks')return res.json({tracks:await likedTracks()})

    if(action==='preference'&&req.method==='POST'){
      const b=body(req)
      await preference(String(b.trackId),String(b.value),b.track)
      return res.json({ok:true})
    }

    if(action==='state'&&req.method==='POST'){await saveState(body(req));return res.json({ok:true})}
    if(action==='settings'&&req.method==='POST'){await saveSettings(body(req));return res.json({ok:true})}
    if(action==='history'&&req.method==='POST'){await history(body(req));return res.json({ok:true})}

    if(action==='playlists'){
      if(req.method==='GET')return res.json({playlists:await getPlaylists()})
      if(req.method==='POST')return res.json(await playlistAction(body(req)))
    }

    if(action==='push'&&req.method==='POST'){
      const subscription=body(req).subscription
      if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return res.status(400).json({error:'Invalid push subscription'})
      await savePush(subscription,req.headers['user-agent']||null)
      return res.json({ok:true})
    }

    if(action==='testPush'&&req.method==='POST'){
      if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)return res.status(503).json({error:'Push is not configured on Vercel yet.'})
      const state=await scanState()
      if(!state.subs.length)return res.status(400).json({error:'No device is subscribed to HeavyCamp push yet.'})
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT||'https://heavycamp.vercel.app',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      )
      const payload=JSON.stringify({
        title:'HeavyCamp push is ready',
        body:'Jamendo + Audius discovery alerts are connected to this device.',
        url:'/?view=discover',
        tag:'heavycamp-test'
      })
      const sent=await Promise.allSettled(state.subs.map(subscription=>webpush.sendNotification({
        endpoint:String(subscription.endpoint),
        keys:{p256dh:String(subscription.p256dh),auth:String(subscription.auth)}
      },payload)))
      return res.json({ok:true,sent:sent.filter(result=>result.status==='fulfilled').length,total:sent.length})
    }

    return res.status(404).json({error:'Unknown HeavyCamp API action'})
  }catch(error){
    return res.status(500).json({error:error instanceof Error?error.message:'HeavyCamp API error'})
  }
}
