import type { MusicGateway, TrackSearchQuery, TrackSearchResult } from '../gateway/music-gateway.js'

export interface MusicTool<TInput, TOutput> {
  readonly name: string
  readonly description: string
  execute(input: TInput): Promise<TOutput>
}

export function createSearchTracksTool(
  gateway: MusicGateway,
): MusicTool<TrackSearchQuery, TrackSearchResult> {
  return {
    name: 'search_tracks',
    description: 'Search the read-only music catalog by keyword, mood, and scene.',
    execute: input => gateway.searchTracks(input),
  }
}
