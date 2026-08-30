export type TrackSource='bandcamp'|'jamendo'|'audius'
export type Track={
  id:string
  source:TrackSource
  sourceId:string
  title:string
  artist:string
  artistId?:string
  album:string
  albumId?:string
  duration:number
  genre?:string
  subgenres?:string[]
  tags?:string[]
  year?:number
  track?:number
  created?:string
  coverArt?:string
  artworkUrl?:string
  bitRate?:number
  suffix?:string
  contentType?:string
  country?:string
  bpm?:number
  musicalKey?:string
  mood?:string
  license?:string
}
export type TrackPreference={trackId:string;liked:boolean;disliked:boolean}
export type TrackStat={trackId:string;plays:number;completes:number;skipsEarly:number;repeats:number;totalListenedMs:number;lastPlayedAt?:string|null}
export type AppSettings={preferredGenres:string[];excludedGenres:string[];notificationsEnabled:boolean;notificationGenres:string[];notificationTime:string;autoplay:boolean;defaultMode:'sequential'|'shuffle'}
export type SavedState={queueTrackIds:string[];currentIndex:number;positionMs:number;mode:'sequential'|'shuffle';filterState:Record<string,unknown>;sortState:Record<string,unknown>}
export type UserData={settings:AppSettings|null;state:SavedState|null;preferences:TrackPreference[];stats:TrackStat[]}
export type Playlist={id:string;name:string;source:string;bandcampPlaylistId?:string|null;trackIds:string[];tracks?:Track[]}
export type DiscoverPayload={featured:Track[];newReleases:Track[];trending:Track[];genres:string[]}
export type ViewName='home'|'discover'|'liked'|'playlists'|'settings'
export type PushSubscriptionJSON={endpoint?:string;expirationTime?:number|null;keys?:{p256dh?:string;auth?:string}}
