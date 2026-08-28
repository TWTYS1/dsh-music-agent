/**
 * 记忆工具。
 *
 * 只有三个：写档案、记练习结果、读记忆。派生量不提供写入工具 ——
 * 它们由 episodes 计算得出，可写入就意味着可与事实矛盾。
 */

import { deriveMemory } from '../memory/derive.js'
import { renderMemory } from '../memory/render.js'
import {
  appendEpisode,
  loadEpisodes,
  loadProfile,
  recordProfileChange,
  saveProfile,
} from '../memory/store.js'
import {
  INSTRUMENT_LABELS_ZH,
  LEVEL_LABELS_ZH,
  type Instrument,
  type MusicProfile,
  SOLFEGE_LABELS_ZH,
  type SkillLevel,
  type SolfegeSystem,
  type VocalRange,
  isInstrument,
  isSkillLevel,
  isSolfegeSystem,
} from '../memory/types.js'
import { parseNote } from '../theory/note.js'

export interface MemoryTool<TInput, TOutput> {
  readonly name: string
  readonly description: string
  execute(input: TInput): TOutput
}

export interface RememberProfileQuery {
  instruments?: string[]
  level?: string
  solfegeSystem?: string
  goals?: string[]
  vocalLowest?: string
  vocalHighest?: string
  vocalComfortableLow?: string
  vocalComfortableHigh?: string
}

/** 音域端点必须是合法音名且带八度，否则播放时无法确定音高。 */
function parseRangeNote(label: string, value: string): string {
  const note = parseNote(value)
  if (note.octave === undefined) {
    throw new Error(`${label} must include an octave, e.g. A3 or C5, got: ${value}`)
  }
  return value
}

export function createRememberProfileTool(): MemoryTool<
  RememberProfileQuery,
  Record<string, unknown>
> {
  return {
    name: 'remember_profile',
    description: 'Persist what the user states about instruments, level, solfege, goals, range.',
    execute: input => {
      const current = loadProfile()
      const changes: string[] = []

      let instruments: readonly Instrument[] = current.instruments
      if (input.instruments !== undefined) {
        const parsed: Instrument[] = []
        for (const raw of input.instruments) {
          const trimmed = raw.trim()
          if (!isInstrument(trimmed)) {
            throw new Error(`unknown instrument: ${raw}. valid: voice, piano`)
          }
          if (!parsed.includes(trimmed)) parsed.push(trimmed)
        }
        if (parsed.join(',') !== current.instruments.join(',')) {
          recordProfileChange('instruments', current.instruments.join(','), parsed.join(','))
          changes.push('instruments')
        }
        instruments = parsed
      }

      let level: SkillLevel | undefined = current.level
      if (input.level !== undefined) {
        const trimmed = input.level.trim()
        if (!isSkillLevel(trimmed)) {
          throw new Error(
            `unknown level: ${input.level}. valid: beginner, elementary, intermediate, advanced`,
          )
        }
        if (trimmed !== current.level) {
          recordProfileChange('level', current.level ?? '', trimmed)
          changes.push('level')
        }
        level = trimmed
      }

      let solfegeSystem: SolfegeSystem = current.solfegeSystem
      if (input.solfegeSystem !== undefined) {
        const trimmed = input.solfegeSystem.trim()
        if (!isSolfegeSystem(trimmed)) {
          throw new Error(
            `unknown solfege system: ${input.solfegeSystem}. valid: fixed-do, movable-do`,
          )
        }
        if (trimmed !== current.solfegeSystem) {
          recordProfileChange('solfegeSystem', current.solfegeSystem, trimmed)
          changes.push('solfegeSystem')
        }
        solfegeSystem = trimmed
      }

      let goals: readonly string[] = current.goals
      if (input.goals !== undefined) {
        const cleaned = input.goals.map(goal => goal.trim()).filter(goal => goal !== '')
        if (cleaned.join('|') !== current.goals.join('|')) {
          recordProfileChange('goals', current.goals.join('|'), cleaned.join('|'))
          changes.push('goals')
        }
        goals = cleaned
      }

      let vocalRange: VocalRange | undefined = current.vocalRange
      if (input.vocalLowest !== undefined || input.vocalHighest !== undefined) {
        if (input.vocalLowest === undefined || input.vocalHighest === undefined) {
          throw new Error('vocalLowest and vocalHighest must be provided together')
        }
        const lowest = parseRangeNote('vocalLowest', input.vocalLowest)
        const highest = parseRangeNote('vocalHighest', input.vocalHighest)
        const comfortableLow = input.vocalComfortableLow === undefined
          ? undefined
          : parseRangeNote('vocalComfortableLow', input.vocalComfortableLow)
        const comfortableHigh = input.vocalComfortableHigh === undefined
          ? undefined
          : parseRangeNote('vocalComfortableHigh', input.vocalComfortableHigh)

        recordProfileChange(
          'vocalRange',
          current.vocalRange === undefined
            ? ''
            : `${current.vocalRange.lowest}-${current.vocalRange.highest}`,
          `${lowest}-${highest}`,
        )
        changes.push('vocalRange')
        vocalRange = {
          lowest,
          highest,
          measuredAt: new Date().toISOString(),
          ...(comfortableLow === undefined ? {} : { comfortableLow }),
          ...(comfortableHigh === undefined ? {} : { comfortableHigh }),
        }
      }

      const updated: MusicProfile = {
        instruments,
        solfegeSystem,
        goals,
        updatedAt: new Date().toISOString(),
        ...(vocalRange === undefined ? {} : { vocalRange }),
        ...(level === undefined ? {} : { level }),
      }
      saveProfile(updated)

      return {
        saved: true,
        changedFields: changes,
        profile: {
          instruments: updated.instruments,
          instrumentsZh: updated.instruments.map(i => INSTRUMENT_LABELS_ZH[i]),
          solfegeSystem: updated.solfegeSystem,
          solfegeSystemZh: SOLFEGE_LABELS_ZH[updated.solfegeSystem],
          goals: updated.goals,
          ...(updated.level === undefined ? {} : {
            level: updated.level,
            levelZh: LEVEL_LABELS_ZH[updated.level],
          }),
          ...(updated.vocalRange === undefined ? {} : { vocalRange: updated.vocalRange }),
        },
      }
    },
  }
}

export interface RecordExerciseQuery {
  exerciseType: string
  concept: string
  difficulty: number
  correct: boolean
  seed?: number
}

export function createRecordExerciseResultTool(): MemoryTool<
  RecordExerciseQuery,
  Record<string, unknown>
> {
  return {
    name: 'record_exercise_result',
    description: 'Log one graded exercise attempt so mastery and weak points can be derived.',
    execute: input => {
      const concept = input.concept.trim()
      if (concept === '') throw new Error('concept must not be empty')
      if (!Number.isInteger(input.difficulty) || input.difficulty < 1 || input.difficulty > 5) {
        throw new Error(`difficulty must be an integer 1-5, got: ${input.difficulty}`)
      }

      appendEpisode({
        kind: 'exercise-attempt',
        at: new Date().toISOString(),
        exerciseType: input.exerciseType,
        concept,
        difficulty: input.difficulty,
        correct: input.correct,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      })

      const derived = deriveMemory(loadEpisodes())
      const stat = [
        ...derived.masteredConcepts,
        ...derived.weakPoints,
        ...derived.practicingConcepts,
      ].find(entry => entry.concept === concept)

      return {
        recorded: true,
        concept,
        correct: input.correct,
        conceptAccuracy: stat === undefined ? null : Math.round(stat.accuracy * 100) / 100,
        conceptAttempts: stat === undefined ? 0 : stat.rawAttempts,
        totalAttempts: derived.totalAttempts,
      }
    },
  }
}

export function createGetMemoryTool(): MemoryTool<Record<string, never>, Record<string, unknown>> {
  return {
    name: 'get_memory',
    description: 'Read the stored user profile plus derived mastery, weak points, and taste.',
    execute: () => {
      const profile = loadProfile()
      const derived = deriveMemory(loadEpisodes())
      return {
        profile,
        derived: {
          masteredConcepts: derived.masteredConcepts,
          weakPoints: derived.weakPoints,
          practicingConcepts: derived.practicingConcepts,
          touchedConcepts: derived.touchedConcepts,
          acceptedTracks: derived.acceptedTracks,
          skippedTracks: derived.skippedTracks,
          totalAttempts: derived.totalAttempts,
          overallAccuracy: derived.overallAccuracy,
          ...(derived.levelEstimate === undefined ? {} : { levelEstimate: derived.levelEstimate }),
          ...(derived.lastActivityAt === undefined ? {} : { lastActivityAt: derived.lastActivityAt }),
        },
        promptView: renderMemory(profile, derived),
      }
    },
  }
}

export interface TrackFeedbackQuery {
  trackId: string
  trackName: string
  verdict: string
}

export function createRecordTrackFeedbackTool(): MemoryTool<
  TrackFeedbackQuery,
  Record<string, unknown>
> {
  return {
    name: 'record_track_feedback',
    description: 'Log whether the user accepted, skipped, or blocked a recommended track.',
    execute: input => {
      const verdict = input.verdict.trim()
      if (verdict !== 'accepted' && verdict !== 'skipped' && verdict !== 'blocked') {
        throw new Error(`unknown verdict: ${input.verdict}. valid: accepted, skipped, blocked`)
      }
      appendEpisode({
        kind: 'track-feedback',
        at: new Date().toISOString(),
        trackId: input.trackId,
        trackName: input.trackName,
        verdict,
      })
      return { recorded: true, trackName: input.trackName, verdict }
    },
  }
}
