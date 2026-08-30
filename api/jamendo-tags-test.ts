import type { VercelRequest, VercelResponse } from '@vercel/node'
const base='https://api.jamendo.com/v3.0/tracks/'
const clientId=()=>process.env.JAMENDO_CLIENT_ID||''
async function run(tag:string){
  const qs=new URLSearchParams({
    client_id:clientId(),format:'json',limit:'10',fullcount:'true',
    tags:tag,include:'musicinfo',audioformat:'mp32',boost:'popularity_month',groupby:'artist_id'
  })
  const r=await fetch(base+'?'+qs.toString(),{headers:{accept:'application/json'}})
  const j:any=await r.json().catch(()=>null)
  const rows=Array.isArray(j?.results)?j.results:[]
  return {
    ok:r.ok&&j?.headers?.status==='success',
    count:rows.length,
    fullcount:j?.headers?.results_fullcount??null,
    streamable:rows.filter((x:any)=>Boolean(x.audio)).length,
    sample:rows.slice(0,3).map((x:any)=>({
      id:String(x.id),title:x.name,artist:x.artist_name,
      tags:[...(x?.musicinfo?.tags?.genres||[]),...(x?.musicinfo?.tags?.vartags||[])].filter(Boolean)
    }))
  }
}
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return res.status(405).end()
 if(!clientId())return res.status(503).json({error:'JAMENDO_CLIENT_ID missing'})
 const tags=['metal','heavymetal','metalcore','blackmetal','doommetal','deathmetal','djent','powermetal','thrashmetal','industrial','postmetal']
 const out=Object.fromEntries(await Promise.all(tags.map(async t=>[t,await run(t)] as const)))
 return res.status(200).json({generatedAt:new Date().toISOString(),tags:out})
}
