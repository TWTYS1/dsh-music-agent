/**
 * 和弦构成与转位。
 *
 * 和弦用音程列表定义（度数 + 性质），而不是半音间隔，
 * 这样 dim7 的减七度不会被拼成大六度。
 */

import { type Interval, type IntervalQuality, makeInterval, noteFromInterval } from './interval.js'
import { type Note, formatNote } from './note.js'

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'major7'
  | 'minor7'
  | 'dominant7'
  | 'minor7flat5'
  | 'diminished7'
  | 'sus2'
  | 'sus4'

/** 0 = 原位，1 = 第一转位，依此类推。 */
export type Inversion = 0 | 1 | 2 | 3

interface ChordDefinition {
  readonly intervals: readonly (readonly [number, IntervalQuality])[]
  /** 和弦符号后缀，接在根音之后。 */
  readonly symbol: string
  readonly labelZh: string
}

export const CHORD_DEFINITIONS: Readonly<Record<ChordQuality, ChordDefinition>> = {
  'major': {
    intervals: [[1, 'perfect'], [3, 'major'], [5, 'perfect']],
    symbol: '', labelZh: '大三和弦',
  },
  'minor': {
    intervals: [[1, 'perfect'], [3, 'minor'], [5, 'perfect']],
    symbol: 'm', labelZh: '小三和弦',
  },
  'diminished': {
    intervals: [[1, 'perfect'], [3, 'minor'], [5, 'diminished']],
    symbol: 'dim', labelZh: '减三和弦',
  },
  'augmented': {
    intervals: [[1, 'perfect'], [3, 'major'], [5, 'augmented']],
    symbol: 'aug', labelZh: '增三和弦',
  },
  'major7': {
    intervals: [[1, 'perfect'], [3, 'major'], [5, 'perfect'], [7, 'major']],
    symbol: 'maj7', labelZh: '大七和弦',
  },
  'minor7': {
    intervals: [[1, 'perfect'], [3, 'minor'], [5, 'perfect'], [7, 'minor']],
    symbol: 'm7', labelZh: '小七和弦',
  },
  'dominant7': {
    intervals: [[1, 'perfect'], [3, 'major'], [5, 'perfect'], [7, 'minor']],
    symbol: '7', labelZh: '属七和弦',
  },
  'minor7flat5': {
    intervals: [[1, 'perfect'], [3, 'minor'], [5, 'diminished'], [7, 'minor']],
    symbol: 'm7b5', labelZh: '半减七和弦',
  },
  'diminished7': {
    intervals: [[1, 'perfect'], [3, 'minor'], [5, 'diminished'], [7, 'diminished']],
    symbol: 'dim7', labelZh: '减七和弦',
  },
  'sus2': {
    intervals: [[1, 'perfect'], [2, 'major'], [5, 'perfect']],
    symbol: 'sus2', labelZh: '挂二和弦',
  },
  'sus4': {
    intervals: [[1, 'perfect'], [4, 'perfect'], [5, 'perfect']],
    symbol: 'sus4', labelZh: '挂四和弦',
  },
}

const INVERSION_LABELS_ZH: readonly string[] = ['原位', '第一转位', '第二转位', '第三转位']

export interface Chord {
  readonly root: Note
  readonly quality: ChordQuality
  readonly inversion: Inversion
  readonly labelZh: string
  readonly symbol: string
  /** 按转位后的排列顺序。 */
  readonly notes: readonly Note[]
  /** 原位各音相对根音的音程，顺序与原位排列一致。 */
  readonly intervals: readonly Interval[]
  /** 转位时的最低音。 */
  readonly bass: Note
}

export function isChordQuality(value: string): value is ChordQuality {
  return Object.hasOwn(CHORD_DEFINITIONS, value)
}

export function isInversion(value: number): value is Inversion {
  return value === 0 || value === 1 || value === 2 || value === 3
}

export function buildChord(root: Note, quality: ChordQuality, inversion: Inversion = 0): Chord {
  const definition = CHORD_DEFINITIONS[quality]
  if (inversion >= definition.intervals.length) {
    throw new Error(
      `${quality} has ${definition.intervals.length} notes and cannot take inversion ${inversion}`,
    )
  }

  const intervals = definition.intervals.map(([number, intervalQuality]) =>
    makeInterval(number, intervalQuality))
  const rootPosition = intervals.map(interval => noteFromInterval(root, interval))
  // 转位只改变排列，不改变音名集合。
  const notes = [...rootPosition.slice(inversion), ...rootPosition.slice(0, inversion)]

  const bass = notes[0]
  if (bass === undefined) throw new Error(`chord ${quality} produced no notes`)

  const inversionLabel = INVERSION_LABELS_ZH[inversion] ?? `第${inversion}转位`
  const suffix = inversion === 0 ? '' : `/${formatNote(bass)}`

  return {
    root,
    quality,
    inversion,
    labelZh: `${formatNote(root)}${definition.labelZh}${inversion === 0 ? '' : `（${inversionLabel}）`}`,
    symbol: `${formatNote(root)}${definition.symbol}${suffix}`,
    notes,
    intervals,
    bass,
  }
}

export function formatChord(chord: Chord): string {
  return chord.notes.map(formatNote).join(' ')
}
