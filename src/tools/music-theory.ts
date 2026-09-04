/**
 * 乐理工具：把 theory/ 的纯函数暴露给模型。
 *
 * 这一层只做输入解析、输出投影与错误信息整理，不含乐理逻辑 ——
 * 乐理必须留在 theory/ 内，以便脱离 DSH 独立验证。
 */

import { type Inversion, buildChord, isInversion } from '../theory/chord.js'
import {
  type Difficulty,
  type Exercise,
  type ExerciseType,
  EXERCISE_TYPE_LABELS_ZH,
  generateExercise,
  isDifficulty,
  isExerciseType,
} from '../theory/exercise.js'
import { formatInterval, formatIntervalZh, intervalBetween } from '../theory/interval.js'
import { getCircleOfFifths, getKeySignature } from '../theory/key.js'
import { formatNote, formatNoteZh, parseNote, transposeBySemitones } from '../theory/note.js'
import { buildScale } from '../theory/scale.js'
import { resolveChordQuality, resolveKeyMode, resolveScaleMode } from '../theory/vocabulary.js'

export interface TheoryTool<TInput, TOutput> {
  readonly name: string
  readonly description: string
  execute(input: TInput): TOutput
}

export interface ScaleQuery {
  tonic: string
  mode: string
}

export function createGetScaleTool(): TheoryTool<ScaleQuery, Record<string, unknown>> {
  return {
    name: 'get_scale',
    description: 'Derive a scale from a tonic and mode, with degrees and key signature.',
    execute: ({ tonic, mode }) => {
      const parsedTonic = parseNote(tonic)
      const scaleMode = resolveScaleMode(mode)
      const scale = buildScale(parsedTonic, scaleMode)

      const signature = scaleMode === 'major' || scaleMode === 'natural-minor'
        ? getKeySignature(parsedTonic, scaleMode)
        : undefined

      return {
        tonic: formatNote(parsedTonic),
        tonicZh: formatNoteZh(parsedTonic),
        mode: scaleMode,
        modeZh: scale.labelZh,
        notes: scale.notes.map(formatNote),
        degrees: scale.degrees.map(degree => ({
          degree: degree.degree,
          note: formatNote(degree.note),
          semitonesFromTonic: degree.semitonesFromTonic,
          ...(degree.functionZh === undefined ? {} : { functionZh: degree.functionZh }),
        })),
        ...(signature === undefined ? {} : {
          keySignature: {
            sharps: signature.sharps,
            flats: signature.flats,
            alteredNotes: signature.alteredNotes.map(formatNote),
          },
        }),
      }
    },
  }
}

export interface ChordQuery {
  root: string
  quality: string
  inversion?: number
}

export function createGetChordTool(): TheoryTool<ChordQuery, Record<string, unknown>> {
  return {
    name: 'get_chord',
    description: 'Build a chord from a root and quality, optionally inverted.',
    execute: ({ root, quality, inversion }) => {
      const parsedRoot = parseNote(root)
      const chordQuality = resolveChordQuality(quality)
      const requested = inversion ?? 0
      if (!isInversion(requested)) {
        throw new Error(`inversion must be 0-3, got: ${requested}`)
      }
      const chord = buildChord(parsedRoot, chordQuality, requested as Inversion)

      return {
        root: formatNote(parsedRoot),
        quality: chordQuality,
        labelZh: chord.labelZh,
        symbol: chord.symbol,
        inversion: chord.inversion,
        notes: chord.notes.map(formatNote),
        bass: formatNote(chord.bass),
        intervals: chord.intervals.map(interval => ({
          number: interval.number,
          quality: interval.quality,
          semitones: interval.semitones,
          labelZh: formatIntervalZh(interval),
        })),
      }
    },
  }
}

export interface IntervalQuery {
  from: string
  to: string
}

export function createGetIntervalTool(): TheoryTool<IntervalQuery, Record<string, unknown>> {
  return {
    name: 'get_interval',
    description: 'Measure the interval between two notes as a degree plus quality.',
    execute: ({ from, to }) => {
      const fromNote = parseNote(from)
      const toNote = parseNote(to)
      const interval = intervalBetween(fromNote, toNote)

      return {
        from: formatNote(fromNote),
        to: formatNote(toNote),
        number: interval.number,
        quality: interval.quality,
        semitones: interval.semitones,
        label: formatInterval(interval),
        labelZh: formatIntervalZh(interval),
      }
    },
  }
}

export interface KeyQuery {
  tonic: string
  mode: string
}

export function createGetKeySignatureTool(): TheoryTool<KeyQuery, Record<string, unknown>> {
  return {
    name: 'get_key_signature',
    description: 'Report the key signature, altered notes, and relative key of a key.',
    execute: ({ tonic, mode }) => {
      const parsedTonic = parseNote(tonic)
      const keyMode = resolveKeyMode(mode)
      const signature = getKeySignature(parsedTonic, keyMode)

      return {
        tonic: formatNote(parsedTonic),
        mode: keyMode,
        labelZh: signature.labelZh,
        sharps: signature.sharps,
        flats: signature.flats,
        alteredNotes: signature.alteredNotes.map(formatNote),
        circlePosition: signature.circlePosition,
        relativeKey: {
          tonic: formatNote(signature.relativeKey.tonic),
          mode: signature.relativeKey.mode,
          labelZh: signature.relativeKey.labelZh,
        },
      }
    },
  }
}

export function createGetCircleOfFifthsTool(): TheoryTool<KeyQuery, Record<string, unknown>> {
  return {
    name: 'get_circle_of_fifths',
    description: 'Show circle-of-fifths neighbours, relative key, and parallel key.',
    execute: ({ tonic, mode }) => {
      const parsedTonic = parseNote(tonic)
      const keyMode = resolveKeyMode(mode)
      const view = getCircleOfFifths(parsedTonic, keyMode)

      const project = (entry: typeof view.current) => ({
        tonic: formatNote(entry.tonic),
        mode: entry.mode,
        labelZh: entry.labelZh,
        circlePosition: entry.circlePosition,
      })

      return {
        current: project(view.current),
        sharpward: project(view.sharpward),
        flatward: project(view.flatward),
        relative: project(view.relative),
        parallel: project(view.parallel),
      }
    },
  }
}

export interface TransposeQuery {
  note: string
  semitones: number
  preference?: string
}

export function createTransposeNoteTool(): TheoryTool<TransposeQuery, Record<string, unknown>> {
  return {
    name: 'transpose_note',
    description: 'Shift a note by semitones, keeping pitch exact. Requires an octave.',
    execute: ({ note, semitones, preference }) => {
      const parsed = parseNote(note)
      if (parsed.octave === undefined) {
        throw new Error(`note must include an octave, e.g. C4 or A3, got: ${note}`)
      }
      if (!Number.isInteger(semitones)) {
        throw new Error(`semitones must be an integer, got: ${semitones}`)
      }
      const spelling = preference ?? 'sharp'
      if (spelling !== 'sharp' && spelling !== 'flat') {
        throw new Error(`preference must be sharp or flat, got: ${preference}`)
      }

      const result = transposeBySemitones(parsed, semitones, spelling)
      return {
        from: formatNote(parsed),
        to: formatNote(result),
        toZh: formatNoteZh(result),
        semitones,
        preference: spelling,
      }
    },
  }
}

export interface ExerciseQuery {
  type: string
  difficulty?: number
  seed?: number
}

export function createGenerateExerciseTool(): TheoryTool<ExerciseQuery, Record<string, unknown>> {
  return {
    name: 'generate_exercise',
    description: 'Generate a music theory exercise from rules, with answer and explanation.',
    execute: ({ type, difficulty, seed }) => {
      if (!isExerciseType(type)) {
        throw new Error(
          `unknown exercise type: ${type}. valid: ${Object.keys(EXERCISE_TYPE_LABELS_ZH).join(', ')}`,
        )
      }
      const level = difficulty ?? 1
      if (!isDifficulty(level)) throw new Error(`difficulty must be 1-5, got: ${level}`)

      const exercise: Exercise = generateExercise(
        type as ExerciseType,
        level as Difficulty,
        seed,
      )

      return {
        type: exercise.type,
        typeZh: EXERCISE_TYPE_LABELS_ZH[exercise.type],
        difficulty: exercise.difficulty,
        seed: exercise.seed,
        prompt: exercise.prompt,
        question: exercise.question,
        options: exercise.options,
        answer: exercise.answer,
        explanation: exercise.explanation,
      }
    },
  }
}
