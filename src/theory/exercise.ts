/**
 * 练习题生成器。
 *
 * 题目由乐理规则生成，而非预录题库 —— 因此不会用完，且难度可参数化。
 * 生成过程接受 seed 并使用确定性 PRNG：同一 seed 必得同一道题，
 * 这样练习可复现、可测试，同时仍能产生无限变化。
 */

import { type Chord, type ChordQuality, type Inversion, buildChord } from './chord.js'
import { type Interval, type IntervalQuality, formatIntervalZh, makeInterval, noteFromInterval } from './interval.js'
import { type Note, formatNote, parseNote } from './note.js'
import { type ScaleMode, buildScale } from './scale.js'
import { getKeySignature } from './key.js'

export type ExerciseType =
  | 'interval-identify'
  | 'chord-identify'
  | 'scale-degree'
  | 'key-signature'

/** 1 最易，5 最难。 */
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Exercise {
  readonly type: ExerciseType
  readonly difficulty: Difficulty
  readonly seed: number
  /** 面向用户的题干。 */
  readonly prompt: string
  /** 结构化题目数据，供前端渲染谱例或键盘。 */
  readonly question: Readonly<Record<string, unknown>>
  readonly answer: string
  /** 含正确答案的选项，已打乱。 */
  readonly options: readonly string[]
  /** 讲解，仅在用户作答后出示。 */
  readonly explanation: string
}

/** mulberry32：小而稳定的确定性 PRNG。 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new Error('cannot pick from an empty list')
  return item
}

function shuffle<T>(random: () => number, items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i]
    const b = result[j]
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }
  return result
}

/** 取前 count 个不同的干扰项，与答案去重。 */
function distractors(
  random: () => number,
  pool: readonly string[],
  answer: string,
  count: number,
): string[] {
  const candidates = shuffle(random, pool.filter(item => item !== answer))
  return candidates.slice(0, count)
}

// ── 难度分级：每级在上一级基础上扩大候选范围 ──────────────────────

const TONICS_BY_DIFFICULTY: Readonly<Record<Difficulty, readonly string[]>> = {
  1: ['C', 'G', 'F'],
  2: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb'],
  3: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db'],
  4: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'F#', 'Gb', 'C#'],
  5: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'F#', 'Gb', 'C#', 'Cb'],
}

const INTERVALS_BY_DIFFICULTY: Readonly<
  Record<Difficulty, readonly (readonly [number, IntervalQuality])[]>
> = {
  1: [[2, 'major'], [3, 'minor'], [3, 'major'], [4, 'perfect'], [5, 'perfect']],
  2: [
    [2, 'minor'], [2, 'major'], [3, 'minor'], [3, 'major'], [4, 'perfect'],
    [5, 'perfect'], [6, 'minor'], [6, 'major'], [7, 'minor'], [7, 'major'],
  ],
  3: [
    [2, 'minor'], [2, 'major'], [3, 'minor'], [3, 'major'], [4, 'perfect'],
    [4, 'augmented'], [5, 'diminished'], [5, 'perfect'], [6, 'minor'], [6, 'major'],
    [7, 'minor'], [7, 'major'],
  ],
  4: [
    [2, 'minor'], [2, 'major'], [2, 'augmented'], [3, 'diminished'], [3, 'minor'],
    [3, 'major'], [4, 'diminished'], [4, 'perfect'], [4, 'augmented'], [5, 'diminished'],
    [5, 'perfect'], [5, 'augmented'], [6, 'minor'], [6, 'major'], [7, 'diminished'],
    [7, 'minor'], [7, 'major'],
  ],
  5: [
    [2, 'minor'], [2, 'major'], [2, 'augmented'], [3, 'diminished'], [3, 'minor'],
    [3, 'major'], [4, 'diminished'], [4, 'perfect'], [4, 'augmented'], [5, 'diminished'],
    [5, 'perfect'], [5, 'augmented'], [6, 'diminished'], [6, 'minor'], [6, 'major'],
    [6, 'augmented'], [7, 'diminished'], [7, 'minor'], [7, 'major'],
  ],
}

const CHORDS_BY_DIFFICULTY: Readonly<Record<Difficulty, readonly ChordQuality[]>> = {
  1: ['major', 'minor'],
  2: ['major', 'minor', 'diminished', 'augmented', 'dominant7'],
  3: ['major', 'minor', 'diminished', 'augmented', 'dominant7', 'major7', 'minor7', 'sus2', 'sus4'],
  4: [
    'major', 'minor', 'diminished', 'augmented', 'dominant7', 'major7', 'minor7',
    'sus2', 'sus4', 'minor7flat5', 'diminished7',
  ],
  5: [
    'major', 'minor', 'diminished', 'augmented', 'dominant7', 'major7', 'minor7',
    'sus2', 'sus4', 'minor7flat5', 'diminished7',
  ],
}

const MODES_BY_DIFFICULTY: Readonly<Record<Difficulty, readonly ScaleMode[]>> = {
  1: ['major', 'natural-minor'],
  2: ['major', 'natural-minor', 'harmonic-minor', 'melodic-minor'],
  3: ['major', 'natural-minor', 'harmonic-minor', 'melodic-minor', 'major-pentatonic', 'minor-pentatonic'],
  4: [
    'major', 'natural-minor', 'harmonic-minor', 'melodic-minor',
    'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  ],
  5: [
    'major', 'natural-minor', 'harmonic-minor', 'melodic-minor', 'major-pentatonic',
    'minor-pentatonic', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
  ],
}

/** 高难度才允许转位。 */
function maxInversion(difficulty: Difficulty, noteCount: number): Inversion {
  if (difficulty < 4) return 0
  const limit = Math.min(noteCount - 1, 3)
  return (limit < 0 ? 0 : limit) as Inversion
}

// ── 各题型 ───────────────────────────────────────────────────────

function intervalIdentify(random: () => number, difficulty: Difficulty): Exercise {
  const root = parseNote(pick(random, TONICS_BY_DIFFICULTY[difficulty]))
  const [number, quality] = pick(random, INTERVALS_BY_DIFFICULTY[difficulty])
  const interval = makeInterval(number, quality)
  const target = noteFromInterval(root, interval)
  const answer = formatIntervalZh(interval)

  const pool = INTERVALS_BY_DIFFICULTY[difficulty]
    .map(([n, q]) => formatIntervalZh(makeInterval(n, q)))
  const options = shuffle(random, [answer, ...distractors(random, pool, answer, 3)])

  return {
    type: 'interval-identify',
    difficulty,
    seed: 0,
    prompt: `${formatNote(root)} 到 ${formatNote(target)} 是什么音程？`,
    question: { from: formatNote(root), to: formatNote(target) },
    answer,
    options,
    explanation: `${formatNote(root)} 到 ${formatNote(target)} 相距 ${interval.semitones} 个半音，`
      + `字母跨度为 ${interval.number} 度，因此是${answer}。`,
  }
}

function chordIdentify(random: () => number, difficulty: Difficulty): Exercise {
  const root = parseNote(pick(random, TONICS_BY_DIFFICULTY[difficulty]))
  const quality = pick(random, CHORDS_BY_DIFFICULTY[difficulty])
  const noteCount = buildChord(root, quality, 0).notes.length
  const limit = maxInversion(difficulty, noteCount)
  const inversion = (limit === 0 ? 0 : Math.floor(random() * (limit + 1))) as Inversion
  const chord: Chord = buildChord(root, quality, inversion)
  const answer = chord.labelZh

  const pool = CHORDS_BY_DIFFICULTY[difficulty]
    .map(candidate => buildChord(root, candidate, 0).labelZh)
  const options = shuffle(random, [answer, ...distractors(random, pool, answer, 3)])

  return {
    type: 'chord-identify',
    difficulty,
    seed: 0,
    prompt: `${chord.notes.map(formatNote).join('、')} 构成什么和弦？`,
    question: { notes: chord.notes.map(formatNote), bass: formatNote(chord.bass) },
    answer,
    options,
    explanation: `根音为 ${formatNote(root)}，各音相对根音是 `
      + `${chord.intervals.map(formatIntervalZh).join('、')}，因此是${answer}。`,
  }
}

function scaleDegree(random: () => number, difficulty: Difficulty): Exercise {
  const tonic = parseNote(pick(random, TONICS_BY_DIFFICULTY[difficulty]))
  const mode = pick(random, MODES_BY_DIFFICULTY[difficulty])
  const scale = buildScale(tonic, mode)
  const target = pick(random, scale.degrees)
  const answer = formatNote(target.note)

  const pool = scale.notes.map(formatNote)
  const options = shuffle(random, [answer, ...distractors(random, pool, answer, 3)])

  return {
    type: 'scale-degree',
    difficulty,
    seed: 0,
    prompt: `${formatNote(tonic)}${scale.labelZh}的第 ${target.degree} 级是哪个音？`,
    question: {
      tonic: formatNote(tonic),
      mode,
      modeZh: scale.labelZh,
      degree: target.degree,
    },
    answer,
    options,
    explanation: `${formatNote(tonic)}${scale.labelZh}为 ${scale.notes.map(formatNote).join(' ')}，`
      + `第 ${target.degree} 级是 ${answer}`
      + `${target.functionZh === undefined ? '' : `（${target.functionZh}）`}。`,
  }
}

function keySignatureExercise(random: () => number, difficulty: Difficulty): Exercise {
  const tonic = parseNote(pick(random, TONICS_BY_DIFFICULTY[difficulty]))
  const mode = random() < 0.5 ? 'major' : 'natural-minor'
  const signature = getKeySignature(tonic, mode)
  const count = signature.sharps > 0 ? signature.sharps : signature.flats
  const kind = signature.sharps > 0 ? '升号' : signature.flats > 0 ? '降号' : ''
  const answer = count === 0 ? '没有升降号' : `${count} 个${kind}`

  const pool = ['没有升降号', ...[1, 2, 3, 4, 5, 6, 7].flatMap(n => [`${n} 个升号`, `${n} 个降号`])]
  const options = shuffle(random, [answer, ...distractors(random, pool, answer, 3)])

  return {
    type: 'key-signature',
    difficulty,
    seed: 0,
    prompt: `${signature.labelZh}的调号是什么？`,
    question: { tonic: formatNote(tonic), mode, labelZh: signature.labelZh },
    answer,
    options,
    explanation: signature.alteredNotes.length === 0
      ? `${signature.labelZh}没有升降号。`
      : `${signature.labelZh}的变化音为 ${signature.alteredNotes.map(formatNote).join(' ')}，`
        + `因此是${answer}。`,
  }
}

const GENERATORS: Readonly<
  Record<ExerciseType, (random: () => number, difficulty: Difficulty) => Exercise>
> = {
  'interval-identify': intervalIdentify,
  'chord-identify': chordIdentify,
  'scale-degree': scaleDegree,
  'key-signature': keySignatureExercise,
}

export const EXERCISE_TYPE_LABELS_ZH: Readonly<Record<ExerciseType, string>> = {
  'interval-identify': '音程辨识',
  'chord-identify': '和弦辨识',
  'scale-degree': '音阶级数',
  'key-signature': '调号辨识',
}

export function isExerciseType(value: string): value is ExerciseType {
  return Object.hasOwn(GENERATORS, value)
}

export function isDifficulty(value: number): value is Difficulty {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

/** seed 缺省时按时间取，显式传入则结果可复现。 */
export function generateExercise(
  type: ExerciseType,
  difficulty: Difficulty,
  seed?: number,
): Exercise {
  const effectiveSeed = seed ?? Math.floor(Math.random() * 0xFFFFFFFF)
  const exercise = GENERATORS[type](createRandom(effectiveSeed), difficulty)
  return { ...exercise, seed: effectiveSeed }
}

/** 判定作答。比较前去除空白，其余要求完全一致。 */
export function gradeExercise(exercise: Exercise, response: string): boolean {
  return response.trim() === exercise.answer.trim()
}
