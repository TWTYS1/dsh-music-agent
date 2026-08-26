import type { MusicGateway, Track, TrackSearchQuery, TrackSearchResult } from './music-gateway.js'

type MockTrack = Track & { moods: readonly string[]; scenes: readonly string[]; keywords: readonly string[] }

const MOCK_TRACKS: readonly MockTrack[] = [
  { id: 'mock-001', name: '晨光漫步', artists: ['林屿'], album: '城市清晨', durationMs: 218_000, playable: true, source: 'mock', moods: ['轻松', '温暖'], scenes: ['通勤', '清晨'], keywords: ['原声', '吉他'] },
  { id: 'mock-002', name: '夜航星河', artists: ['闻川'], album: '远方来信', durationMs: 264_000, playable: true, source: 'mock', moods: ['宁静', '梦幻'], scenes: ['睡前', '独处'], keywords: ['氛围', '电子'] },
  { id: 'mock-003', name: '城市节拍', artists: ['北纬乐队'], album: '街角脉冲', durationMs: 196_000, playable: true, source: 'mock', moods: ['活力', '愉快'], scenes: ['通勤', '运动'], keywords: ['流行', '节奏'] },
  { id: 'mock-004', name: '雨巷来信', artists: ['苏澄'], album: '纸上天气', durationMs: 242_000, playable: false, source: 'mock', moods: ['忧郁', '平静'], scenes: ['雨天', '阅读'], keywords: ['钢琴', '民谣'] },
  { id: 'mock-005', name: '专注流线', artists: ['静态信号'], album: '白噪边界', durationMs: 305_000, playable: true, source: 'mock', moods: ['专注', '平静'], scenes: ['学习', '工作'], keywords: ['纯音乐', '氛围'] },
  { id: 'mock-006', name: '周末海风', artists: ['夏末电台'], album: '沿海公路', durationMs: 231_000, playable: true, source: 'mock', moods: ['轻松', '治愈'], scenes: ['旅行', '聚会'], keywords: ['流行', '吉他'] },
]

const normalize = (value: string): string => value.trim().toLocaleLowerCase()
const contains = (values: readonly string[], expected: string): boolean =>
  values.some(value => normalize(value).includes(normalize(expected)))

export class MockMusicGateway implements MusicGateway {
  constructor(private readonly tracks: readonly MockTrack[] = MOCK_TRACKS) {}

  async searchTracks(input: TrackSearchQuery): Promise<TrackSearchResult> {
    const terms = normalize(input.query).split(/\s+/u).filter(Boolean)
    const matches = this.tracks.filter(track => {
      const text = normalize([track.name, track.album, ...track.artists, ...track.keywords].join(' '))
      return terms.every(term => text.includes(term))
        && (input.mood === undefined || contains(track.moods, input.mood))
        && (input.scene === undefined || contains(track.scenes, input.scene))
    })
    const limit = Math.max(1, Math.min(input.limit ?? 5, 20))
    const tracks = matches.slice(0, limit).map(({ id, name, artists, album, durationMs, playable, source }) =>
      ({ id, name, artists, album, durationMs, playable, source }))
    return { tracks, total: matches.length, source: 'mock-music-gateway' }
  }
}
