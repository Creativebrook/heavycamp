import { Readable } from 'node:stream'
import type { VercelRequest,VercelResponse } from '@vercel/node'
import { requireAccess } from '../server/auth.js'
import { endpointUrl } from '../server/bandcamp.js'
import { resolveRemoteStream } from '../server/sources.js'

function forwardHeaders(up:Response,res:VercelResponse){
  for(const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){
    const value=up.headers.get(name)
    if(value)res.setHeader(name,value)
  }
  res.setHeader('Cache-Control','private, no-store')
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end()
  if(!requireAccess(req,res))return
  const id=typeof req.query.id==='string'?req.query.id:''
  if(!id)return res.status(400).json({error:'Missing track id'})

  try{
    const headers:Record<string,string>={}
    if(req.headers.range)headers.Range=req.headers.range

    let url:URL|string
    if(id.startsWith('jamendo:')||id.startsWith('audius:')){
      const remote=await resolveRemoteStream(id)
      if(!remote)return res.status(404).json({error:'Remote stream is unavailable'})
      url=remote
    }else{
      url=endpointUrl('stream',{id})
    }

    const up=await fetch(url,{method:req.method,headers,redirect:'follow',signal:AbortSignal.timeout(25000)})
    res.statusCode=up.status
    forwardHeaders(up,res)
    if(req.method==='HEAD'||!up.body)return res.end()
    Readable.fromWeb(up.body as any).pipe(res)
  }catch(error){
    console.error('HeavyCamp stream error',error)
    return res.status(502).json({error:'Could not stream track'})
  }
}
