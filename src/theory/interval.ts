/**
 * 音程：度数 + 性质。
 *
 * 半音数不足以表示音程 —— 增四度与减五度都是 6 个半音，
 * 但功能完全不同。度数由字母距离决定，性质由半音偏差决定。
 */

import {
  type Letter,
  type Note,
  letterAt,
  letterIndex,
  midiValue,
  noteFromLetterAndPitchClass,
  naturalPitchClass,
  pitchClass,
} from './note.js'

export type IntervalQuality = 'diminished' | 'minor' | 'perfect' | 'major' | 'augmented'

export interface Interval {
  /** 1 = 同度，8 = 八度。大于 8 表示复合音程。 */
  readonly number: number
  readonly quality: IntervalQuality
  /** 派生值：由度数与性质决定。 */
  readonly semitones: number
}

/** 单纯音程（1-8）的大音程或纯音程半音数。 */
const BASE_SEMITONES: readonly number[] = [0, 0, 2, 4, 5, 7, 9, 11, 12]

const QUALITY_LABEL: Readonly<Record<IntervalQuality, string>> = {
  diminished: '减', minor: '小', perfect: '纯', major: '大', augmented: '增',
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size
}

/** 1、4、5、8 度为完全音程，只有减/纯/增，没有大小。 */
export function isPerfectNumber(intervalNumber: number): boolean {
  const simple = mod(intervalNumber - 1, 7) + 1
  return simple === 1 || simple === 4 || simple === 5
}

/** 复合音程的基准半音数 = 单纯音程基准 + 8 度的整数倍。 */
function baseSemitones(intervalNumber: number): number {
  const octaves = Math.floor((intervalNumber - 1) / 7)
  const simple = mod(intervalNumber - 1, 7) + 1
  const base = BASE_SEMITONES[simple]
  if (base === undefined) throw new Error(`unsupported interval number: ${intervalNumber}`)
  return base + octaves * 12
}

function qualityFromOffset(intervalNumber: number, offset: number): IntervalQuality {
  if (isPerfectNumber(intervalNumber)) {
    if (offset === -1) return 'diminished'
    if (offset === 0) return 'perfect'
    if (offset === 1) return 'augmented'
    throw new Error(`offset ${offset} has no quality for perfect interval ${intervalNumber}`)
  }
  if (offset === -2) return 'diminished'
  if (offset === -1) return 'minor'
  if (offset === 0) return 'major'
  if (offset === 1) return 'augmented'
  throw new Error(`offset ${offset} has no quality for interval ${intervalNumber}`)
}

function offsetFromQuality(intervalNumber: number, quality: IntervalQuality): number {
  if (isPerfectNumber(intervalNumber)) {
    if (quality === 'diminished') return -1
    if (quality === 'perfect') return 0
    if (quality === 'augmented') return 1
    throw new Error(`${quality} is not valid for perfect interval ${intervalNumber}`)
  }
  if (quality === 'diminished') return -2
  if (quality === 'minor') return -1
  if (quality === 'major') return 0
  if (quality === 'augmented') return 1
  throw new Error(`${quality} is not valid for interval ${intervalNumber}`)
}

export function makeInterval(intervalNumber: number, quality: IntervalQuality): Interval {
  if (!Number.isInteger(intervalNumber) || intervalNumber < 1) {
    throw new Error(`invalid interval number: ${intervalNumber}`)
  }
  const semitones = baseSemitones(intervalNumber) + offsetFromQuality(intervalNumber, quality)
  return { number: intervalNumber, quality, semitones }
}

/**
 * 计算两音之间的音程。
 *
 * 两音都带八度时按实际音高计算，可得复合音程；
 * 否则视为同一八度内的单纯音程（to 在 from 之上）。
 */
export function intervalBetween(from: Note, to: Note): Interval {
  if (from.octave !== undefined && to.octave !== undefined) {
    const letterDistance = (letterIndex(to.letter) - letterIndex(from.letter))
      + (to.octave - from.octave) * 7
    if (letterDistance < 0) {
      throw new Error('intervalBetween expects the second note to be higher or equal')
    }
    const semitones = midiValue(to) - midiValue(from)
    const intervalNumber = letterDistance + 1
    return {
      number: intervalNumber,
      quality: qualityFromOffset(intervalNumber, semitones - baseSemitones(intervalNumber)),
      semitones,
    }
  }

  const intervalNumber = mod(letterIndex(to.letter) - letterIndex(from.letter), 7) + 1
  const base = baseSemitones(intervalNumber)
  const rawDistance = mod(pitchClass(to) - pitchClass(from), 12)
  // 同度或八度附近，原始距离可能落在错误的一侧（C→Cb 得 11 而非 -1）。
  const semitones = [rawDistance - 12, rawDistance, rawDistance + 12]
    .reduce((best, candidate) =>
      Math.abs(candidate - base) < Math.abs(best - base) ? candidate : best)
  return {
    number: intervalNumber,
    quality: qualityFromOffset(intervalNumber, semitones - base),
    semitones,
  }
}

/**
 * 从根音按音程构造目标音。
 *
 * 先由度数决定字母，再把该字母修正到目标音高 —— 顺序不能颠倒，
 * 否则拼写会错。
 */
export function noteFromInterval(root: Note, interval: Interval): Note {
  const letter: Letter = letterAt(letterIndex(root.letter) + interval.number - 1)
  const targetPitchClass = mod(pitchClass(root) + interval.semitones, 12)

  if (root.octave === undefined) {
    return noteFromLetterAndPitchClass(letter, targetPitchClass)
  }

  const targetMidi = midiValue(root) + interval.semitones
  const spelled = noteFromLetterAndPitchClass(letter, targetPitchClass)
  // 由目标音高与已定字母反推八度，保证 B#3 之类跨界拼写的八度正确。
  const octave = (targetMidi - naturalPitchClass(letter) - spelled.accidental) / 12 - 1
  return { letter, accidental: spelled.accidental, octave }
}

export function formatInterval(interval: Interval): string {
  return `${interval.quality}${interval.number}`
}

export function formatIntervalZh(interval: Interval): string {
  return `${QUALITY_LABEL[interval.quality]}${interval.number}度`
}
