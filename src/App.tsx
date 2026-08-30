import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, Compass, Heart, Home, ListMusic, ListPlus, LockKeyhole, Pause, Play, Search,
  Settings, Shuffle, SkipBack, SkipForward, Sparkles, ThumbsDown, Trash2, X
} from 'lucide-react'
import { api, createSession, logout, subscribePush } from './api'
import type { AppSettings, DiscoverPayload, Playlist, Track, UserData, ViewName } from './types'

const DEFAULT_SETTINGS: AppSettings = {
  preferredGenres: [],
  excludedGenres: [],
  notificationsEnabled: false,
  notificationGenres: [],
  notificationTime: '08:00',
  autoplay: true,
  defaultMode: 'sequential'
}

const EMPTY_DISCOVER: DiscoverPayload = { featured: [], newReleases: [], trending: [], genres: [] }

const fmt=(seconds:number)=>{
  const value=Math.max(0,Number(seconds)||0)
  return `${Math.floor(value/60)}:${Math.floor(value%60).toString().padStart(2,'0')}`
}
const cover=(track?:Track|null)=>track?.artworkUrl||(track?.coverArt?`/api/cover?id=${encodeURIComponent(track.coverArt)}`:'/icon-512.png')
const dateValue=(track:Track)=>track.created?Date.parse(track.created)||0:(track.year?Date.parse(`${track.year}-01-01`):0)
const mix=<T,>(items:T[])=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
const uniqueTracks=(items:Track[])=>{const seen=new Set<string>();return items.filter(track=>track?.id&&!seen.has(track.id)&&(seen.add(track.id),true))}
const sourceName=(track:Track)=>track.source==='bandcamp'?'Bandcamp':track.source==='jamendo'?'Jamendo':'Audius'
const searchable=(track:Track)=>[
  track.title,track.artist,track.album,track.genre,track.country,track.mood,track.musicalKey,
  ...(track.subgenres||[]),...(track.tags||[])
].filter(Boolean).join(' ').toLowerCase()

function smartPick(tracks:Track[],data:UserData,settings:AppSettings){
  const pool=tracks.filter(track=>!data.preferences.find(pref=>pref.trackId===track.id)?.disliked)
  if(!pool.length)return tracks[0]||null
  if(Math.random()<.16)return pool[Math.floor(Math.random()*pool.length)]

  const prefs=new Map(data.preferences.map(pref=>[pref.trackId,pref]))
  const stats=new Map(data.stats.map(stat=>[stat.trackId,stat]))
  const liked=pool.filter(track=>prefs.get(track.id)?.liked)
  const likedArtists=new Set(liked.map(track=>track.artist.toLowerCase()))
  const likedGenres=new Set(liked.flatMap(track=>[track.genre,...(track.subgenres||[]),...(track.tags||[])].filter(Boolean).map(value=>String(value).toLowerCase())))
  const preferred=new Set(settings.preferredGenres.map(value=>value.toLowerCase()))

  const scored=pool.map(track=>{
    const pref=prefs.get(track.id)
    const stat=stats.get(track.id)
    const terms=[track.genre,...(track.subgenres||[]),...(track.tags||[])].filter(Boolean).map(value=>String(value).toLowerCase())
    let weight=1
    if(pref?.liked)weight+=10
    if(likedArtists.has(track.artist.toLowerCase()))weight+=5
    if(terms.some(term=>likedGenres.has(term)))weight+=5
    if(terms.some(term=>preferred.has(term)))weight+=4
    if(stat){
      weight+=Math.min(4,stat.completes*.8)
      weight+=Math.min(3,stat.repeats*.9)
      weight-=Math.min(3,stat.skipsEarly*.6)
    }
    if(Date.now()-dateValue(track)<1000*60*60*24*45)weight+=1.6
    if(track.source==='jamendo')weight+=.4
    if(track.source==='audius'&&(track.bpm||track.mood))weight+=.35
    return{track,weight:Math.max(.08,weight)}
  })

  let cursor=Math.random()*scored.reduce((sum,item)=>sum+item.weight,0)
  for(const item of scored){cursor-=item.weight;if(cursor<=0)return item.track}
  return scored[0].track
}

function SourceBadge({track}:{track:Track}){
  return <span className={`source-badge source-${track.source}`}>{sourceName(track)}</span>
}

function Unlock({onDone}:{onDone:()=>void}){
  const[key,setKey]=useState('')
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)
  return <main className="unlock">
    <form className="unlock-card" onSubmit={async event=>{
      event.preventDefault();setBusy(true);setError('')
      try{await createSession(key);onDone()}catch(error){setError(error instanceof Error?error.message:'Unlock failed')}finally{setBusy(false)}
    }}>
      <img src="/icon-512.png" alt="HeavyCamp"/>
      <p className="eyebrow">PRIVATE METAL PLAYER</p>
      <h1>HeavyCamp</h1>
      <p>Bandcamp collection plus free metal discovery from Jamendo and Audius.</p>
      <label><LockKeyhole size={17}/><input autoFocus type="password" placeholder="Access key" value={key} onChange={event=>setKey(event.target.value)}/></label>
      {error&&<small className="error">{error}</small>}
      <button disabled={busy||!key}>{busy?'Unlocking…':'Unlock HeavyCamp'}</button>
    </form>
  </main>
}

function TrackList({
  tracks,current,prefMap,onPlay,onLike,onPlaylist,onRemove,empty='No tracks here yet.'
}:{
  tracks:Track[]
  current:Track|null
  prefMap:Map<string,{liked:boolean;disliked:boolean}>
  onPlay:(track:Track,list:Track[])=>void
  onLike:(track:Track)=>void
  onPlaylist:(track:Track)=>void
  onRemove?:(track:Track)=>void
  empty?:string
}){
  if(!tracks.length)return <div className="library-empty"><ListMusic size={22}/><div><b>{empty}</b><p>Try another filter or discover something new.</p></div></div>
  return <div className="tracks">
    {tracks.map(track=><article className={current?.id===track.id?'current':''} key={track.id}>
      <button className="row-main" onClick={()=>onPlay(track,tracks)}>
        <img src={cover(track)} alt=""/>
        <span className="track-copy">
          <b>{track.title}</b>
          <small>{track.artist} · {track.album}</small>
          <span className="row-tags"><SourceBadge track={track}/>{track.genre&&<em>{track.genre}</em>}</span>
        </span>
      </button>
      <span className="dur">{fmt(track.duration)}</span>
      <button className={prefMap.get(track.id)?.liked?'liked':''} onClick={()=>onLike(track)} aria-label="Like">
        <Heart size={18} fill={prefMap.get(track.id)?.liked?'currentColor':'none'}/>
      </button>
      <button onClick={()=>onPlaylist(track)} aria-label="Add to playlist"><ListPlus size={18}/></button>
      {onRemove&&<button onClick={()=>onRemove(track)} aria-label="Remove from playlist"><Trash2 size={17}/></button>}
    </article>)}
  </div>
}

function TrackRail({title,subtitle,tracks,onPlay}:{title:string;subtitle:string;tracks:Track[];onPlay:(track:Track,list:Track[])=>void}){
  if(!tracks.length)return null
  return <section className="discover-section">
    <div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span>{tracks.length}</span></div>
    <div className="track-rail">
      {tracks.map(track=><button className="discover-card" key={track.id} onClick={()=>onPlay(track,tracks)}>
        <img src={cover(track)} alt=""/>
        <span className="discover-card-copy">
          <SourceBadge track={track}/>
          <b>{track.title}</b>
          <small>{track.artist}</small>
          <em>{track.genre||'Metal'} · {fmt(track.duration)}</em>
        </span>
      </button>)}
    </div>
  </section>
}

export default function App(){
  const[audio]=useState(()=>new Audio())
  const[locked,setLocked]=useState<boolean|null>(null)
  const[health,setHealth]=useState({bandcamp:false,jamendo:false,audius:true,database:false,push:false})
  const[library,setLibrary]=useState<Track[]>([])
  const[discover,setDiscover]=useState<DiscoverPayload>(EMPTY_DISCOVER)
  const[likedTracks,setLikedTracks]=useState<Track[]>([])
  const[data,setData]=useState<UserData>({settings:null,state:null,preferences:[],stats:[]})
  const[playlists,setPlaylists]=useState<Playlist[]>([])
  const[view,setView]=useState<ViewName>(()=>(new URLSearchParams(location.search).get('view') as ViewName)||'home')
  const[current,setCurrent]=useState<Track|null>(null)
  const[playing,setPlaying]=useState(false)
  const[pos,setPos]=useState(0)
  const[dur,setDur]=useState(0)
  const[mode,setMode]=useState<'sequential'|'shuffle'>('sequential')
  const[queue,setQueue]=useState<string[]>([])
  const[index,setIndex]=useState(0)
  const[homeSearch,setHomeSearch]=useState('')
  const[homeGenre,setHomeGenre]=useState('all')
  const[sourceFilter,setSourceFilter]=useState<'all'|'bandcamp'|'jamendo'|'audius'>('all')
  const[sort,setSort]=useState<'date'|'artist'|'source'>('date')
  const[settings,setSettings]=useState<AppSettings>(DEFAULT_SETTINGS)
  const[toast,setToast]=useState('')
  const[modal,setModal]=useState<Track|null>(null)
  const[needsDb,setNeedsDb]=useState(false)
  const[discoverQuery,setDiscoverQuery]=useState('')
  const[discoverGenre,setDiscoverGenre]=useState('all')
  const[discoverResults,setDiscoverResults]=useState<Track[]>([])
  const[discoverBusy,setDiscoverBusy]=useState(false)
  const[selectedPlaylist,setSelectedPlaylist]=useState<string|null>(null)

  const queueRef=useRef<string[]>([])
  const idxRef=useRef(0)
  const currentRef=useRef<Track|null>(null)
  const startRef=useRef(0)
  const autoplayRef=useRef(false)
  const allTracks=useMemo(()=>uniqueTracks([
    ...library,...discover.featured,...discover.newReleases,...discover.trending,...discoverResults,...likedTracks,
    ...playlists.flatMap(playlist=>playlist.tracks||[])
  ]),[library,discover,discoverResults,likedTracks,playlists])
  const prefMap=useMemo(()=>new Map(data.preferences.map(pref=>[pref.trackId,pref])),[data.preferences])

  const genreOptions=useMemo(()=>[...new Set([
    ...discover.genres,
    ...allTracks.flatMap(track=>[track.genre,...(track.subgenres||[])]).filter(Boolean) as string[]
  ])].sort(),[discover.genres,allTracks])

  const homeTracks=useMemo(()=>{
    let items=[...allTracks]
    if(sourceFilter!=='all')items=items.filter(track=>track.source===sourceFilter)
    if(homeGenre!=='all'){
      const needle=homeGenre.toLowerCase()
      items=items.filter(track=>[track.genre,...(track.subgenres||[]),...(track.tags||[])].filter(Boolean).some(value=>String(value).toLowerCase().includes(needle)))
    }
    if(homeSearch.trim()){
      const query=homeSearch.toLowerCase()
      items=items.filter(track=>searchable(track).includes(query))
    }
    items.sort((a,b)=>sort==='artist'?a.artist.localeCompare(b.artist):sort==='source'?a.source.localeCompare(b.source):dateValue(b)-dateValue(a))
    return items
  },[allTracks,sourceFilter,homeGenre,homeSearch,sort])

  const currentPlaylist=useMemo(()=>playlists.find(playlist=>playlist.id===selectedPlaylist)||null,[playlists,selectedPlaylist])

  const refreshPlaylists=useCallback(async()=>{
    if(needsDb)return
    const response=await api<{playlists:Playlist[]}>('playlists')
    setPlaylists(response.playlists)
  },[needsDb])

  const load=useCallback(async()=>{
    try{
      const nextHealth=await api<typeof health>('health')
      setHealth(nextHealth)
      const [libraryResponse,discoverResponse]=await Promise.all([
        api<{tracks:Track[]}>('library'),
        api<DiscoverPayload>('discover')
      ])
      setLibrary(libraryResponse.tracks)
      setDiscover(discoverResponse)

      let user:UserData={settings:null,state:null,preferences:[],stats:[]}
      let playlistResponse:Playlist[]=[]
      let savedLikes:Track[]=[]
      if(nextHealth.database){
        try{
          const [userResponse,playlistPayload,likesPayload]=await Promise.all([
            api<UserData>('userData'),
            api<{playlists:Playlist[]}>('playlists'),
            api<{tracks:Track[]}>('likedTracks')
          ])
          user=userResponse
          playlistResponse=playlistPayload.playlists
          savedLikes=likesPayload.tracks
          setNeedsDb(false)
        }catch{
          setNeedsDb(true)
        }
      }else setNeedsDb(true)

      setData(user)
      setPlaylists(playlistResponse)
      setLikedTracks(savedLikes)
      const nextSettings={...DEFAULT_SETTINGS,...(user.settings||{})}
      setSettings(nextSettings)
      setMode(user.state?.mode||nextSettings.defaultMode)

      const combined=uniqueTracks([
        ...libraryResponse.tracks,
        ...discoverResponse.featured,
        ...discoverResponse.newReleases,
        ...discoverResponse.trending,
        ...savedLikes,
        ...playlistResponse.flatMap(playlist=>playlist.tracks||[])
      ])
      const savedId=user.state?.queueTrackIds?.[user.state.currentIndex||0]
      const hero=combined.find(track=>track.id===savedId)||smartPick(combined,user,nextSettings)
      if(hero){
        const restored=user.state?.queueTrackIds?.filter(id=>combined.some(track=>track.id===id))||[]
        const ids=restored.length?restored:combined.map(track=>track.id)
        const heroIndex=Math.max(0,ids.indexOf(hero.id))
        setQueue(ids);queueRef.current=ids
        setIndex(heroIndex);idxRef.current=heroIndex
        setCurrent(hero);currentRef.current=hero
        setTimeout(()=>{if(user.state?.positionMs)audio.currentTime=user.state.positionMs/1000},350)
      }
    }catch(error){
      setToast(error instanceof Error?error.message:'Could not load HeavyCamp')
    }
  },[audio])

  useEffect(()=>{api('health').then(()=>setLocked(false)).catch(()=>setLocked(true))},[])
  useEffect(()=>{if(locked===false)void load()},[locked,load])
  useEffect(()=>{queueRef.current=queue},[queue])
  useEffect(()=>{idxRef.current=index},[index])
  useEffect(()=>{currentRef.current=current},[current])

  useEffect(()=>{
    const params=new URLSearchParams(location.search)
    if(view==='home')params.delete('view');else params.set('view',view)
    history.replaceState(null,'',`${location.pathname}${params.toString()?`?${params.toString()}`:''}`)
  },[view])

  useEffect(()=>{
    if(view!=='discover')return
    const active=discoverQuery.trim()||discoverGenre!=='all'
    if(!active){setDiscoverResults([]);return}
    const timer=setTimeout(async()=>{
      setDiscoverBusy(true)
      try{
        const response=await api<{jamendo:Track[];audius:Track[]}>('discover',{
          method:'POST',
          body:{query:discoverQuery.trim(),genre:discoverGenre==='all'?undefined:discoverGenre,limit:36}
        })
        setDiscoverResults(uniqueTracks([...response.jamendo,...response.audius]))
      }catch(error){
        setToast(error instanceof Error?error.message:'Discovery search failed')
      }finally{setDiscoverBusy(false)}
    },450)
    return()=>clearTimeout(timer)
  },[view,discoverQuery,discoverGenre])

  const report=useCallback((completed=false)=>{
    const track=currentRef.current
    if(!track||startRef.current<1||needsDb)return
    void api('history',{
      method:'POST',
      body:{
        trackId:track.id,
        track,
        listenedMs:startRef.current*1000,
        durationMs:track.duration*1000,
        completed,
        skippedEarly:!completed&&startRef.current<20,
        queueContext:{mode,view,source:track.source}
      }
    }).catch(()=>{})
    startRef.current=0
  },[needsDb,mode,view])

  const playTrack=useCallback((track:Track,list:Track[]=homeTracks,autoplay=true)=>{
    if(currentRef.current?.id!==track.id)report(false)
    let ids=uniqueTracks(list).map(item=>item.id)
    if(!ids.includes(track.id))ids=[track.id,...ids]
    if(mode==='shuffle')ids=[track.id,...mix(ids.filter(id=>id!==track.id))]
    const nextIndex=Math.max(0,ids.indexOf(track.id))
    setQueue(ids);queueRef.current=ids
    setIndex(nextIndex);idxRef.current=nextIndex
    autoplayRef.current=autoplay
    setCurrent(track);currentRef.current=track
  },[homeTracks,mode,report])

  const byIndex=useCallback((target:number)=>{
    const ids=queueRef.current
    if(!ids.length)return
    const nextIndex=(target+ids.length)%ids.length
    const track=allTracks.find(item=>item.id===ids[nextIndex])
    if(!track)return
    report(false)
    setIndex(nextIndex);idxRef.current=nextIndex
    autoplayRef.current=true
    setCurrent(track);currentRef.current=track
  },[allTracks,report])

  const next=useCallback(()=>byIndex(idxRef.current+1),[byIndex])
  const prev=useCallback(()=>{
    if(audio.currentTime>4){audio.currentTime=0;return}
    byIndex(idxRef.current-1)
  },[audio,byIndex])

  useEffect(()=>{
    if(!current)return
    audio.src=`/api/stream?id=${encodeURIComponent(current.id)}`
    audio.load()
    setPos(0);setDur(current.duration||0);startRef.current=0
    if(autoplayRef.current)void audio.play().catch(()=>{})
    autoplayRef.current=false
    if('mediaSession'in navigator){
      navigator.mediaSession.metadata=new MediaMetadata({
        title:current.title,
        artist:current.artist,
        album:current.album,
        artwork:[{src:cover(current),sizes:'512x512'}]
      })
    }
  },[current,audio])

  useEffect(()=>{
    const onPlay=()=>setPlaying(true)
    const onPause=()=>setPlaying(false)
    const onTime=()=>{
      setPos(audio.currentTime)
      startRef.current=Math.max(startRef.current,audio.currentTime)
      if('mediaSession'in navigator&&Number.isFinite(audio.duration)&&audio.duration>0){
        try{navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)})}catch{}
      }
    }
    const onMeta=()=>setDur(audio.duration||currentRef.current?.duration||0)
    const onEnd=()=>{report(true);if(settings.autoplay)next()}
    audio.addEventListener('play',onPlay);audio.addEventListener('pause',onPause);audio.addEventListener('timeupdate',onTime);audio.addEventListener('loadedmetadata',onMeta);audio.addEventListener('ended',onEnd)
    return()=>{audio.removeEventListener('play',onPlay);audio.removeEventListener('pause',onPause);audio.removeEventListener('timeupdate',onTime);audio.removeEventListener('loadedmetadata',onMeta);audio.removeEventListener('ended',onEnd)}
  },[audio,next,report,settings.autoplay])

  useEffect(()=>{
    if(!('mediaSession'in navigator))return
    const handlers:[MediaSessionAction,MediaSessionActionHandler][]=[
      ['play',()=>void audio.play()],['pause',()=>audio.pause()],['previoustrack',prev],['nexttrack',next],
      ['seekbackward',details=>audio.currentTime=Math.max(0,audio.currentTime-(details.seekOffset||10))],
      ['seekforward',details=>audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+(details.seekOffset||10))],
      ['seekto',details=>{if(details.seekTime!=null)audio.currentTime=details.seekTime}]
    ]
    handlers.forEach(([action,handler])=>{try{navigator.mediaSession.setActionHandler(action,handler)}catch{}})
    return()=>handlers.forEach(([action])=>{try{navigator.mediaSession.setActionHandler(action,null)}catch{}})
  },[audio,next,prev])

  useEffect(()=>{
    const timer=setInterval(()=>{
      if(needsDb||!currentRef.current)return
      void api('state',{
        method:'POST',
        body:{
          queueTrackIds:queueRef.current,
          currentIndex:idxRef.current,
          positionMs:Math.round(audio.currentTime*1000),
          mode,
          filterState:{homeGenre,homeSearch,sourceFilter},
          sortState:{field:sort}
        }
      }).catch(()=>{})
    },15000)
    return()=>clearInterval(timer)
  },[audio,mode,homeGenre,homeSearch,sourceFilter,sort,needsDb])

  const preference=async(track:Track,value:'liked'|'disliked'|'neutral')=>{
    setData(currentData=>({...currentData,preferences:[
      ...currentData.preferences.filter(pref=>pref.trackId!==track.id),
      {trackId:track.id,liked:value==='liked',disliked:value==='disliked'}
    ]}))
    setLikedTracks(currentLikes=>value==='liked'?uniqueTracks([track,...currentLikes]):currentLikes.filter(item=>item.id!==track.id))
    if(!needsDb){
      try{await api('preference',{method:'POST',body:{trackId:track.id,value,track}})}
      catch{setToast('Could not save preference.')}
    }
  }

  const toggleLike=(track:Track)=>void preference(track,prefMap.get(track.id)?.liked?'neutral':'liked')

  const toggleShuffle=()=>{
    const nextMode=mode==='shuffle'?'sequential':'shuffle'
    setMode(nextMode)
    if(!current)return
    let ids=homeTracks.map(track=>track.id)
    if(nextMode==='shuffle')ids=[current.id,...mix(ids.filter(id=>id!==current.id))]
    setQueue(ids);queueRef.current=ids
    const nextIndex=Math.max(0,ids.indexOf(current.id))
    setIndex(nextIndex);idxRef.current=nextIndex
  }

  const createPlaylist=async(name:string)=>{
    if(needsDb)return
    await api('playlists',{method:'POST',body:{action:'create',name}})
    await refreshPlaylists()
  }

  const addToPlaylist=async(playlistId:string,track:Track)=>{
    await api('playlists',{method:'POST',body:{action:'add',playlistId,trackId:track.id,track}})
    await refreshPlaylists()
    setModal(null)
    setToast('Added to playlist')
  }

  const removeFromPlaylist=async(playlistId:string,track:Track)=>{
    await api('playlists',{method:'POST',body:{action:'remove',playlistId,trackId:track.id}})
    await refreshPlaylists()
    setToast('Removed from playlist')
  }

  if(locked===null)return <div className="splash"><img src="/icon-512.png"/><strong>HeavyCamp</strong></div>
  if(locked)return <Unlock onDone={()=>setLocked(false)}/>

  const likedDisplay=uniqueTracks(likedTracks)
  const selectedTracks=currentPlaylist?.tracks||[]
  const smart=()=>smartPick(homeTracks.length?homeTracks:allTracks,data,settings)

  return <div className="app">
    <header>
      <button className="brand" onClick={()=>setView('home')}>
        <img src="/icon-512.png" alt="HeavyCamp"/>
        <span><b>HeavyCamp</b><small>DISCOVER · HEAR · BELIEVE</small></span>
      </button>
      <div className="header-sources">
        <span className={health.bandcamp?'ok':''}>Bandcamp</span>
        <span className={health.jamendo?'ok':''}>Jamendo</span>
        <span className={health.audius?'ok':''}>Audius</span>
      </div>
      <button className="lock" onClick={async()=>{await logout();setLocked(true)}}>Lock</button>
    </header>

    <main>
      {view==='home'&&<>
        {current&&<section className="hero">
          <div className="blur" style={{backgroundImage:`url(${cover(current)})`}}/>
          <div className="hero-grid">
            <img className="art" src={cover(current)} alt={`${current.album} cover`}/>
            <div className="meta">
              <div className="hero-kicker"><p className="eyebrow">NOW PLAYING</p><SourceBadge track={current}/></div>
              <h1>{current.title}</h1>
              <h2>{current.artist}</h2>
              <p>{current.album}</p>
              <div className="chips">
                {current.country&&<span>{current.country}</span>}
                <span>{current.genre||'Metal'}</span>
                <span>{fmt(current.duration)}</span>
                {current.year&&<span>{current.year}</span>}
                {current.bpm&&<span>{Math.round(current.bpm)} BPM</span>}
                {current.mood&&<span>{current.mood}</span>}
              </div>
              <input className="range" type="range" min="0" max={Math.max(1,dur||current.duration)} value={Math.min(pos,Math.max(1,dur||current.duration))} onChange={event=>audio.currentTime=Number(event.target.value)}/>
              <div className="times"><span>{fmt(pos)}</span><span>{fmt(dur||current.duration)}</span></div>
              <div className="controls">
                <button className={mode==='shuffle'?'active':''} onClick={toggleShuffle}><Shuffle/></button>
                <button onClick={prev}><SkipBack fill="currentColor"/></button>
                <button className="play" onClick={()=>playing?audio.pause():void audio.play()}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button>
                <button onClick={next}><SkipForward fill="currentColor"/></button>
                <button className={prefMap.get(current.id)?.liked?'liked':''} onClick={()=>toggleLike(current)}><Heart fill={prefMap.get(current.id)?.liked?'currentColor':'none'}/></button>
              </div>
              <div className="secondary">
                <button onClick={()=>{void preference(current,prefMap.get(current.id)?.disliked?'neutral':'disliked');next()}}><ThumbsDown/> Not for me</button>
                <button onClick={()=>setModal(current)}><ListPlus/> Add to playlist</button>
                <button onClick={()=>{const picked=smart();if(picked)playTrack(picked,homeTracks,false)}}><Sparkles/> Smart pick</button>
              </div>
            </div>
          </div>
        </section>}

        <section className="library glass-panel">
          <div className="title">
            <div><p className="eyebrow">MULTI-SOURCE LIBRARY</p><h2>Heavy rotation</h2><p>Bandcamp collection + fresh Jamendo and Audius metal.</p></div>
            <span>{homeTracks.length} tracks</span>
          </div>
          <div className="filters">
            <label><Search size={17}/><input placeholder="Search tracks, albums, artists…" value={homeSearch} onChange={event=>setHomeSearch(event.target.value)}/></label>
            <select value={sourceFilter} onChange={event=>setSourceFilter(event.target.value as any)}>
              <option value="all">All sources</option><option value="bandcamp">Bandcamp</option><option value="jamendo">Jamendo</option><option value="audius">Audius</option>
            </select>
            <select value={homeGenre} onChange={event=>setHomeGenre(event.target.value)}>
              <option value="all">All genres</option>{genreOptions.map(value=><option key={value} value={value}>{value}</option>)}
            </select>
            <select value={sort} onChange={event=>setSort(event.target.value as any)}>
              <option value="date">Newest</option><option value="artist">Band</option><option value="source">Source</option>
            </select>
          </div>
          <TrackList tracks={homeTracks.slice(0,120)} current={current} prefMap={prefMap} onPlay={(track,list)=>playTrack(track,list,true)} onLike={toggleLike} onPlaylist={setModal}/>
        </section>
      </>}

      {view==='discover'&&<section className="page discover-page">
        <div className="page-heading">
          <p className="eyebrow">FREE METAL DISCOVERY</p>
          <h1>Discover</h1>
          <p>New independent metal from Jamendo and Audius, filtered into one HeavyCamp experience.</p>
        </div>
        <div className="discover-search glass-panel">
          <label><Search size={18}/><input placeholder="Search metal, artist, track…" value={discoverQuery} onChange={event=>setDiscoverQuery(event.target.value)}/>{discoverQuery&&<button onClick={()=>setDiscoverQuery('')}><X size={16}/></button>}</label>
          <div className="genre-scroll">
            <button className={discoverGenre==='all'?'active':''} onClick={()=>setDiscoverGenre('all')}>All metal</button>
            {discover.genres.map(value=><button key={value} className={discoverGenre===value?'active':''} onClick={()=>setDiscoverGenre(value)}>{value}</button>)}
          </div>
        </div>
        {discoverBusy?<div className="loading-card">Searching Jamendo + Audius…</div>:
        (discoverQuery.trim()||discoverGenre!=='all')?
          <section className="glass-panel discover-results">
            <div className="section-heading"><div><h2>Results</h2><p>{discoverGenre==='all'?'Across Jamendo and Audius':discoverGenre}</p></div><span>{discoverResults.length}</span></div>
            <TrackList tracks={discoverResults} current={current} prefMap={prefMap} onPlay={(track,list)=>playTrack(track,list,true)} onLike={toggleLike} onPlaylist={setModal} empty="No matching metal found."/>
          </section>:
          <>
            <TrackRail title="New releases" subtitle="Fresh metal recently added to Jamendo." tracks={discover.newReleases} onPlay={(track,list)=>playTrack(track,list,true)}/>
            <TrackRail title="Trending now" subtitle="What is moving inside Audius Metal this week." tracks={discover.trending} onPlay={(track,list)=>playTrack(track,list,true)}/>
            <TrackRail title="Featured Metal" subtitle="Curated Jamendo metal with stronger quality signals." tracks={discover.featured} onPlay={(track,list)=>playTrack(track,list,true)}/>
          </>}
      </section>}

      {view==='liked'&&<section className="page">
        <div className="page-heading"><p className="eyebrow">YOUR TASTE</p><h1>Liked tracks</h1><p>One favourites list across Bandcamp, Jamendo and Audius.</p></div>
        <div className="glass-panel">
          <TrackList tracks={likedDisplay} current={current} prefMap={prefMap} onPlay={(track,list)=>playTrack(track,list,true)} onLike={toggleLike} onPlaylist={setModal} empty="No liked tracks yet."/>
        </div>
      </section>}

      {view==='playlists'&&<section className="page playlist-page">
        <div className="page-heading"><p className="eyebrow">YOUR LIBRARY</p><h1>{currentPlaylist?currentPlaylist.name:'Playlists'}</h1><p>{currentPlaylist?'Bandcamp, Jamendo and Audius can live in the same queue.':'Build focused queues from any HeavyCamp source.'}</p></div>
        {currentPlaylist?<>
          <div className="playlist-toolbar"><button className="ghost-button" onClick={()=>setSelectedPlaylist(null)}>← All playlists</button><span>{selectedTracks.length} tracks</span></div>
          <div className="glass-panel">
            <TrackList tracks={selectedTracks} current={current} prefMap={prefMap} onPlay={(track,list)=>playTrack(track,list,true)} onLike={toggleLike} onPlaylist={setModal} onRemove={track=>void removeFromPlaylist(currentPlaylist.id,track)} empty="This playlist is empty."/>
          </div>
        </>:<>
          <form className="playlist-create glass-panel" onSubmit={async event=>{
            event.preventDefault()
            const form=new FormData(event.currentTarget)
            const name=String(form.get('name')||'').trim()
            if(name){await createPlaylist(name);event.currentTarget.reset()}
          }}>
            <input name="name" placeholder="New playlist name"/>
            <button>Create playlist</button>
          </form>
          {playlists.length===0?<div className="empty-state"><ListMusic size={30}/><div><b>No playlists yet</b><p>Create one, then add music from any source using the + button.</p></div></div>:
          <div className="playlist-grid">
            {playlists.map(playlist=><button className="playlist-tile glass-panel" key={playlist.id} onClick={()=>setSelectedPlaylist(playlist.id)}>
              <div className="playlist-covers">
                {(playlist.tracks||[]).slice(0,4).map(track=><img key={track.id} src={cover(track)} alt=""/>)}
                {!playlist.tracks?.length&&<ListMusic size={30}/>}
              </div>
              <span><b>{playlist.name}</b><small>{playlist.trackIds.length} {playlist.trackIds.length===1?'track':'tracks'}</small></span>
            </button>)}
          </div>}
        </>}
      </section>}

      {view==='settings'&&<section className="settings-page page">
        <div className="page-heading"><p className="eyebrow">HEAVYCAMP</p><h1>Settings</h1><p>Playback, discovery and notification controls.</p></div>
        {needsDb&&<div className="notice"><b>Neon needs initialization.</b><button onClick={async()=>{
          try{await api('bootstrap',{method:'POST'});setNeedsDb(false);setToast('Neon initialized');await load()}catch(error){setToast(error instanceof Error?error.message:'Initialization failed')}
        }}>Initialize database</button></div>}
        <div className="settings-grid">
          <div className="card">
            <h3>Playback</h3>
            <label>Default mode<select value={settings.defaultMode} onChange={event=>setSettings({...settings,defaultMode:event.target.value as any})}><option value="sequential">In order</option><option value="shuffle">Random</option></select></label>
            <label className="toggle">Autoplay next<input type="checkbox" checked={settings.autoplay} onChange={event=>setSettings({...settings,autoplay:event.target.checked})}/></label>
          </div>
          <div className="card">
            <h3><Compass size={18}/> Music sources</h3>
            <div className="source-status"><span>Bandcamp <b className={health.bandcamp?'online':'offline'}>{health.bandcamp?'Connected':'Unavailable'}</b></span><span>Jamendo <b className={health.jamendo?'online':'offline'}>{health.jamendo?'Connected':'Unavailable'}</b></span><span>Audius <b className="online">Connected</b></span></div>
            <p>Bandcamp supplies your personal collection. Jamendo powers free discovery. Audius adds trending and experimental discovery.</p>
          </div>
          <div className="card">
            <h3><Bell size={18}/> Morning notifications</h3>
            <label className="toggle">Enable push<input type="checkbox" checked={settings.notificationsEnabled} onChange={event=>setSettings({...settings,notificationsEnabled:event.target.checked})}/></label>
            <div className="notification-window"><span>Delivery</span><b>Morning digest</b><small>Scheduled around 08:00 in Portugal.</small></div>
            <div className="pills">{discover.genres.map(value=><button key={value} className={settings.notificationGenres.includes(value)?'active':''} onClick={()=>setSettings({...settings,notificationGenres:settings.notificationGenres.includes(value)?settings.notificationGenres.filter(item=>item!==value):[...settings.notificationGenres,value]})}>{value}</button>)}</div>
            <div className="push-actions">
              <button className="push-button" onClick={async()=>{
                try{
                  await subscribePush()
                  const nextSettings={...settings,notificationsEnabled:true}
                  setSettings(nextSettings)
                  if(!needsDb)await api('settings',{method:'POST',body:nextSettings})
                  setToast('Push notifications enabled on this device')
                }catch(error){setToast(error instanceof Error?error.message:'Push failed')}
              }}><Bell size={16}/> Enable on this device</button>
              <button className="push-test" onClick={async()=>{
                try{const result=await api<{sent:number;total:number}>('testPush',{method:'POST'});setToast(result.sent?`Test notification sent (${result.sent}/${result.total})`:'Push test did not reach a device')}
                catch(error){setToast(error instanceof Error?error.message:'Push test failed')}
              }}>Send test notification</button>
            </div>
            <small className="settings-help">HeavyCamp scans Bandcamp, Jamendo and Audius each morning and alerts you only about new music matching your selected genres.</small>
          </div>
          <div className="card">
            <h3><Sparkles size={18}/> Smart Hero</h3>
            <p>Likes, complete plays, repeats, skips, artist affinity, subgenres, recency and source diversity shape the launch recommendation.</p>
            <div className="pills">{discover.genres.slice(0,8).map(value=><button key={value} className={settings.preferredGenres.includes(value)?'active':''} onClick={()=>setSettings({...settings,preferredGenres:settings.preferredGenres.includes(value)?settings.preferredGenres.filter(item=>item!==value):[...settings.preferredGenres,value]})}>{value}</button>)}</div>
          </div>
        </div>
        <button className="primary" disabled={needsDb} onClick={async()=>{await api('settings',{method:'POST',body:settings});setToast('Settings saved')}}>Save settings</button>
      </section>}
    </main>

    {view!=='home'&&current&&<div className="mini-player" role="button" tabIndex={0} onClick={()=>setView('home')} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setView('home')}}}>
      <img src={cover(current)} alt=""/>
      <span><b>{current.title}</b><small>{current.artist} · {sourceName(current)}</small></span>
      <button aria-label={playing?'Pause':'Play'} onClick={event=>{event.stopPropagation();playing?audio.pause():void audio.play()}}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
    </div>}

    <nav className="nav">
      {([
        ['home',Home,'Home'],
        ['discover',Compass,'Discover'],
        ['liked',Heart,'Liked'],
        ['playlists',ListMusic,'Playlists'],
        ['settings',Settings,'Settings']
      ] as const).map(([value,Icon,label])=><button key={value} className={view===value?'active':''} onClick={()=>setView(value)}><Icon/><small>{label}</small></button>)}
    </nav>

    {modal&&<div className="modal" onClick={()=>setModal(null)}>
      <div className="modal-card" onClick={event=>event.stopPropagation()}>
        <div className="modal-title"><div><p className="eyebrow">ADD TO PLAYLIST</p><h3>{modal.title}</h3><small>{modal.artist} · {sourceName(modal)}</small></div><button className="modal-close" onClick={()=>setModal(null)}><X/></button></div>
        {playlists.map(playlist=><button key={playlist.id} onClick={()=>void addToPlaylist(playlist.id,modal)}><ListMusic/>{playlist.name}<span>{playlist.trackIds.length}</span></button>)}
        <form onSubmit={async event=>{
          event.preventDefault()
          const form=new FormData(event.currentTarget)
          const name=String(form.get('name')||'').trim()
          if(name){await createPlaylist(name);event.currentTarget.reset()}
        }}><input name="name" placeholder="Create a new playlist"/><button>Create</button></form>
      </div>
    </div>}

    {toast&&<button className="toast" onClick={()=>setToast('')}>{toast}</button>}
  </div>
}
