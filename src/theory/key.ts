/**
 * 调号与五度圈。
 *
 * 调号从音阶推导而非查表：数音阶里的升降号即得。这样不必维护一张
 * 容易与音阶实现脱节的对照表。
 */

import { makeInterval, noteFromInterval } from './interval.js'
import { type Note, formatNote, formatNoteZh, pitchClass } from './note.js'
import { type ScaleMode, buildScale } from './scale.js'

/** 调号只对大调与自然小调有明确定义。 */
export type KeyMode = 'major' | 'natural-minor'

const PERFECT_FIFTH = makeInterval(5, 'perfect')
const MINOR_THIRD = makeInterval(3, 'minor')

export interface KeySignature {
  readonly tonic: Note
  readonly mode: KeyMode
  readonly labelZh: string
  /** 升号数量，重升按 2 计。 */
  readonly sharps: number
  /** 降号数量，重降按 2 计。 */
  readonly flats: number
  /** 带变化音的音名，按音阶顺序。 */
  readonly alteredNotes: readonly Note[]
  /** 五度圈位置，C 大调为 0，每个升号 +1，每个降号 -1。 */
  readonly circlePosition: number
  readonly relativeKey: { readonly tonic: Note; readonly mode: KeyMode; readonly labelZh: string }
}

function modeLabel(mode: KeyMode): string {
  return mode === 'major' ? '大调' : '小调'
}

export function isKeyMode(value: string): value is KeyMode {
  return value === 'major' || value === 'natural-minor'
}

/** 关系调：大调向下小三度得关系小调，小调向上小三度得关系大调。 */
function relativeTonic(tonic: Note, mode: KeyMode): Note {
  if (mode === 'major') {
    // 下小三度等于上大六度，避免实现向下的音程构造。
    return noteFromInterval(tonic, makeInterval(6, 'major'))
  }
  return noteFromInterval(tonic, MINOR_THIRD)
}

export function getKeySignature(tonic: Note, mode: KeyMode): KeySignature {
  const scaleMode: ScaleMode = mode
  const scale = buildScale(tonic, scaleMode)
  const alteredNotes = scale.notes.filter(note => note.accidental !== 0)

  const sharps = alteredNotes
    .filter(note => note.accidental > 0)
    .reduce((total, note) => total + note.accidental, 0)
  const flats = alteredNotes
    .filter(note => note.accidental < 0)
    .reduce((total, note) => total - note.accidental, 0)

  const relativeMode: KeyMode = mode === 'major' ? 'natural-minor' : 'major'
  const relative = relativeTonic(tonic, mode)

  return {
    tonic,
    mode,
    labelZh: `${formatNoteZh(tonic)}${modeLabel(mode)}`,
    sharps,
    flats,
    alteredNotes,
    circlePosition: sharps - flats,
    relativeKey: {
      tonic: relative,
      mode: relativeMode,
      labelZh: `${formatNoteZh(relative)}${modeLabel(relativeMode)}`,
    },
  }
}

export interface CircleOfFifthsEntry {
  readonly tonic: Note
  readonly mode: KeyMode
  readonly labelZh: string
  readonly circlePosition: number
}

export interface CircleOfFifthsView {
  readonly current: CircleOfFifthsEntry
  /** 顺时针方向，上纯五度，升号增加。 */
  readonly sharpward: CircleOfFifthsEntry
  /** 逆时针方向，下纯五度，降号增加。 */
  readonly flatward: CircleOfFifthsEntry
  readonly relative: CircleOfFifthsEntry
  /** 同主音的另一种调式。 */
  readonly parallel: CircleOfFifthsEntry
}

function entryOf(tonic: Note, mode: KeyMode): CircleOfFifthsEntry {
  const signature = getKeySignature(tonic, mode)
  return {
    tonic,
    mode,
    labelZh: signature.labelZh,
    circlePosition: signature.circlePosition,
  }
}

export function getCircleOfFifths(tonic: Note, mode: KeyMode): CircleOfFifthsView {
  const sharpward = noteFromInterval(tonic, PERFECT_FIFTH)
  // 下纯五度等于上纯四度。
  const flatward = noteFromInterval(tonic, makeInterval(4, 'perfect'))
  const relativeMode: KeyMode = mode === 'major' ? 'natural-minor' : 'major'
  const parallelMode: KeyMode = relativeMode

  return {
    current: entryOf(tonic, mode),
    sharpward: entryOf(sharpward, mode),
    flatward: entryOf(flatward, mode),
    relative: entryOf(relativeTonic(tonic, mode), relativeMode),
    parallel: entryOf(tonic, parallelMode),
  }
}

/** 同一调号下的等音调，例如 F# 大调与 Gb 大调。 */
export function isEnharmonicKey(a: KeySignature, b: KeySignature): boolean {
  return a.mode === b.mode && pitchClass(a.tonic) === pitchClass(b.tonic)
    && formatNote(a.tonic) !== formatNote(b.tonic)
}
