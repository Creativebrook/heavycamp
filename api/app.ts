import type { VercelRequest,VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { requireAccess } from '../server/auth.js'
import { bandcampConfigured,getLibraryTracks } from '../server/bandcamp.js'
import { bootstrap,dbConfigured,getPlaylists,history,playlistAction,preference,savePush,saveSettings,saveState,scanState,syncTracks,userData } from '../server/storage.js'
const body=(req:VercelRequest)=>typeof req.body==='string'?JSON.parse(req.body):req.body||{}
export default async function handler(req:VercelRequest,res:VercelResponse){if(!requireAccess(req,res))return;const action=String(req.query.action||'');try{
if(action==='health')return res.json({ok:true,bandcamp:bandcampConfigured(),database:dbConfigured(),push:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),version:'0.1.0'})
if(action==='config')return res.json({vapidPublicKey:process.env.VAPID_PUBLIC_KEY||null,features:{push:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),discovery:false}})
if(action==='library'){const tracks=await getLibraryTracks();if(dbConfigured())try{await syncTracks(tracks)}catch(e){console.warn(e)}return res.json({tracks,count:tracks.length})}
if(!dbConfigured())return res.status(503).json({error:'DATABASE_URL is not configured'})
if(action==='bootstrap'&&req.method==='POST'){await bootstrap();return res.json({ok:true})}
if(action==='userData')return res.json(await userData())
if(action==='preference'&&req.method==='POST'){const b=body(req);await preference(String(b.trackId),String(b.value));return res.json({ok:true})}
if(action==='state'&&req.method==='POST'){await saveState(body(req));return res.json({ok:true})}
if(action==='settings'&&req.method==='POST'){await saveSettings(body(req));return res.json({ok:true})}
if(action==='history'&&req.method==='POST'){await history(body(req));return res.json({ok:true})}
if(action==='playlists'){if(req.method==='GET')return res.json({playlists:await getPlaylists()});if(req.method==='POST')return res.json(await playlistAction(body(req)))}
if(action==='push'&&req.method==='POST'){const s=body(req).subscription;if(!s?.endpoint||!s?.keys?.p256dh||!s?.keys?.auth)return res.status(400).json({error:'Invalid push subscription'});await savePush(s,req.headers['user-agent']||null);return res.json({ok:true})}
if(action==='testPush'&&req.method==='POST'){if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)return res.status(503).json({error:'Push is not configured on Vercel yet.'});const state=await scanState();if(!state.subs.length)return res.status(400).json({error:'No device is subscribed to HeavyCamp push yet.'});webpush.setVapidDetails(process.env.VAPID_SUBJECT||'https://heavycamp.vercel.app',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);const payload=JSON.stringify({title:'HeavyCamp push is ready',body:'Morning release alerts are connected to this device.',url:'/',tag:'heavycamp-test'});const sent=await Promise.allSettled(state.subs.map(s=>webpush.sendNotification({endpoint:String(s.endpoint),keys:{p256dh:String(s.p256dh),auth:String(s.auth)}},payload)));return res.json({ok:true,sent:sent.filter(x=>x.status==='fulfilled').length,total:sent.length})}
return res.status(404).json({error:'Unknown HeavyCamp API action'})
}catch(e){return res.status(500).json({error:e instanceof Error?e.message:'HeavyCamp API error'})}}
