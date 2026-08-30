import type { VercelRequest, VercelResponse } from '@vercel/node'

const base = 'https://api.jamendo.com/v3.0'
const clientId = () => process.env.JAMENDO_CLIENT_ID || ''

function tagsOf(t: any) {
  const tags = t?.musicinfo?.tags || {}
  return [...(tags.genres || []), ...(tags.instruments || []), ...(tags.vartags || [])].filter(Boolean)
}

function sample(t: any) {
  return {
    id: String(t.id),
    title: t.name,
    artist: t.artist_name,
    album: t.album_name,
    duration: t.duration,
    releasedate: t.releasedate,
    tags: tagsOf(t).slice(0, 14),
    audio: Boolean(t.audio),
    artwork: Boolean(t.image || t.album_image),
    license: t.license_ccurl || null
  }
}

async function tracks(params: Record<string,string>) {
  const qs = new URLSearchParams({
    client_id: clientId(),
    format: 'json',
    limit: '20',
    fullcount: 'true',
    include: 'musicinfo',
    audioformat: 'mp32',
    ...params
  })
  const response = await fetch(`${base}/tracks/?${qs.toString()}`, { headers: { accept: 'application/json' }})
  const json: any = await response.json().catch(() => null)
  const items = Array.isArray(json?.results) ? json.results : []
  return {
    ok: response.ok && json?.headers?.status === 'success',
    count: items.length,
    fullcount: json?.headers?.results_fullcount ?? null,
    streamable: items.filter((t:any)=>Boolean(t.audio)).length,
    samples: items.slice(0,5).map(sample),
    error: json?.headers?.status === 'success' ? undefined : json?.headers?.error_message
  }
}

async function similar(id: string) {
  const qs = new URLSearchParams({
    client_id: clientId(),
    format: 'json',
    limit: '10',
    include: 'musicinfo',
    audioformat: 'mp32',
    id
  })
  const response = await fetch(`${base}/tracks/similar/?${qs.toString()}`, { headers: { accept: 'application/json' }})
  const json:any = await response.json().catch(()=>null)
  const items = Array.isArray(json?.results) ? json.results : []
  return {
    ok: response.ok && json?.headers?.status === 'success',
    seedId: id,
    count: items.length,
    streamable: items.filter((t:any)=>Boolean(t.audio)).length,
    samples: items.slice(0,5).map((t:any)=>({ ...sample(t), score: t.score ?? null })),
    error: json?.headers?.status === 'success' ? undefined : json?.headers?.error_message
  }
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='GET') return res.status(405).end()
  if(!clientId()) return res.status(503).json({error:'JAMENDO_CLIENT_ID missing'})
  try{
    const [featuredMetal,newMetal,metalcoreSearch,blackSearch,doomSearch,deathSearch,djentSearch,blackExact,doomExact] = await Promise.all([
      tracks({tags:'metal',featured:'1',groupby:'artist_id',boost:'popularity_month'}),
      tracks({tags:'metal',order:'releasedate_desc',type:'single albumtrack'}),
      tracks({search:'metalcore',boost:'popularity_month',type:'single albumtrack'}),
      tracks({search:'black metal',boost:'popularity_month',type:'single albumtrack'}),
      tracks({search:'doom metal',boost:'popularity_month',type:'single albumtrack'}),
      tracks({search:'death metal',boost:'popularity_month',type:'single albumtrack'}),
      tracks({search:'djent',boost:'popularity_month',type:'single albumtrack'}),
      tracks({tags:'black metal',boost:'popularity_month',type:'single albumtrack'}),
      tracks({tags:'doom metal',boost:'popularity_month',type:'single albumtrack'})
    ])

    const seeds = [
      ...featuredMetal.samples,
      ...metalcoreSearch.samples,
      ...blackSearch.samples,
      ...doomSearch.samples
    ].map((x:any)=>x.id).filter(Boolean)
    let similarTest:any = {ok:false,count:0,error:'No seed produced similarity results'}
    for(const id of [...new Set(seeds)].slice(0,8)){
      const result = await similar(String(id))
      if(result.count>0){ similarTest=result; break }
      similarTest=result
    }

    return res.status(200).json({
      generatedAt:new Date().toISOString(),
      featuredMetal,
      newMetal,
      searches:{
        metalcore:metalcoreSearch,
        blackMetal:blackSearch,
        doomMetal:doomSearch,
        deathMetal:deathSearch,
        djent:djentSearch
      },
      exactTags:{
        blackPlusMetal:blackExact,
        doomPlusMetal:doomExact
      },
      similar:similarTest
    })
  }catch(error){
    return res.status(500).json({error:error instanceof Error?error.message:'Jamendo deep test failed'})
  }
}
