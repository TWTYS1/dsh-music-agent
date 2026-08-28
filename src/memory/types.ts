/**
 * 记忆的数据形状。
 *
 * profile 是可覆盖的结构化事实；episodes 是 append-only 的事件日志。
 * 派生量（掌握程度、薄弱项、口味）不在此声明为存储字段 —— 它们由
 * episodes 计算得出，独立存储会与事实脱同步。
 */

export type Instrument = 'voice' | 'piano'

export type SolfegeSystem = 'fixed-do' | 'movable-do'

export type SkillLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced'

export const INSTRUMENT_LABELS_ZH: Readonly<Record<Instrument, string>> = {
  voice: '声乐',
  piano: '钢琴',
}

export const SOLFEGE_LABELS_ZH: Readonly<Record<SolfegeSystem, string>> = {
  'fixed-do': '固定调唱名',
  'movable-do': '首调唱名',
}

export const LEVEL_LABELS_ZH: Readonly<Record<SkillLevel, string>> = {
  beginner: '零基础',
  elementary: '入门',
  intermediate: '中级',
  advanced: '进阶',
}

/** 声乐音域。舒适音域通常窄于生理极限，练习应落在舒适区。 */
export interface VocalRange {
  readonly lowest: string
  readonly highest: string
  readonly comfortableLow?: string
  readonly comfortableHigh?: string
  /** ISO 时间。音域会随训练变化，因此需要知道这是何时测的。 */
  readonly measuredAt: string
}

export interface MusicProfile {
  readonly instruments: readonly Instrument[]
  readonly vocalRange?: VocalRange
  readonly solfegeSystem: SolfegeSystem
  readonly level?: SkillLevel
  readonly goals: readonly string[]
  readonly updatedAt: string
}

export const EMPTY_PROFILE: MusicProfile = {
  instruments: [],
  solfegeSystem: 'fixed-do',
  goals: [],
  updatedAt: '1970-01-01T00:00:00.000Z',
}

export type EpisodeKind =
  | 'exercise-attempt'
  | 'concept-touched'
  | 'playback'
  | 'track-feedback'
  | 'profile-change'

interface EpisodeBase {
  readonly kind: EpisodeKind
  /** ISO 时间，派生计算的衰减依据。 */
  readonly at: string
}

/** 练习作答。判分发生在模型侧，因此由模型回写。 */
export interface ExerciseAttemptEpisode extends EpisodeBase {
  readonly kind: 'exercise-attempt'
  readonly exerciseType: string
  readonly difficulty: number
  readonly correct: boolean
  /** 题目涉及的概念标签，用于聚合掌握度与薄弱项。 */
  readonly concept: string
  readonly seed?: number
}

/** 接触过的乐理概念。由乐理工具执行时自动记录。 */
export interface ConceptTouchedEpisode extends EpisodeBase {
  readonly kind: 'concept-touched'
  readonly tool: string
  readonly concept: string
}

/** 播放记录。由 play_notes 自动记录。 */
export interface PlaybackEpisode extends EpisodeBase {
  readonly kind: 'playback'
  readonly notes: readonly string[]
  readonly style: string
}

/** 歌曲反馈，口味画像的输入。 */
export interface TrackFeedbackEpisode extends EpisodeBase {
  readonly kind: 'track-feedback'
  readonly trackId: string
  readonly trackName: string
  readonly verdict: 'accepted' | 'skipped' | 'blocked'
}

/** profile 变更留痕。覆盖字段时记录旧值，使改口有迹可循。 */
export interface ProfileChangeEpisode extends EpisodeBase {
  readonly kind: 'profile-change'
  readonly field: string
  readonly from: string
  readonly to: string
}

export type Episode =
  | ExerciseAttemptEpisode
  | ConceptTouchedEpisode
  | PlaybackEpisode
  | TrackFeedbackEpisode
  | ProfileChangeEpisode

export function isInstrument(value: string): value is Instrument {
  return value === 'voice' || value === 'piano'
}

export function isSolfegeSystem(value: string): value is SolfegeSystem {
  return value === 'fixed-do' || value === 'movable-do'
}

export function isSkillLevel(value: string): value is SkillLevel {
  return value === 'beginner' || value === 'elementary'
    || value === 'intermediate' || value === 'advanced'
}
