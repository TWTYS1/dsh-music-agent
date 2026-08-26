export interface Track {
  id: string
  name: string
  artists: readonly string[]
  album: string
  durationMs: number
  playable: boolean
  source: string
}

export interface TrackSearchQuery {
  query: string
  mood?: string
  scene?: string
  limit?: number
}

export interface TrackSearchResult {
  tracks: readonly Track[]
  total: number
  source: string
}

export interface MusicGateway {
  searchTracks(query: TrackSearchQuery): Promise<TrackSearchResult>
}
