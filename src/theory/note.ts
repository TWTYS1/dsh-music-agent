/**
 * 音名模型：字母 + 变化音。
 *
 * 关键设计决策：绝不用 0-11 的半音数（pitch class）作为主表示。
 * 半音数会丢失拼写信息，导致 G 大调第七音输出 Gb 而不是 F#，
 * 或 C# 大调无法正确产生 B#。半音数只作为派生值。
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

/** -2 = 重降, -1 = 降, 0 = 本位, 1 = 升, 2 = 重升 */
export type Accidental = -2 | -1 | 0 | 1 | 2

export interface Note {
  readonly letter: Letter
  readonly accidental: Accidental
  /** 缺省表示不限定八度。采用科学音高记法，C4 为中央 C。 */
  readonly octave?: number
}

const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

/** 各字母在其八度内的自然半音位置。 */
const LETTER_SEMITONES: Readonly<Record<Letter, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

const ACCIDENTAL_TEXT: Readonly<Record<Accidental, string>> = {
  '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##',
}

const ACCIDENTAL_LABEL: Readonly<Record<Accidental, string>> = {
  '-2': '重降', '-1': '降', 0: '', 1: '升', 2: '重升',
}

/** 正模运算：JS 的 % 对负数返回负值，度数与半音换算不能用它。 */
function mod(value: number, size: number): number {
  return ((value % size) + size) % size
}

export function letterIndex(letter: Letter): number {
  return LETTER_ORDER.indexOf(letter)
}

/** 按字母序推进，跨越 B→C 时回绕。 */
export function letterAt(index: number): Letter {
  const letter = LETTER_ORDER[mod(index, LETTER_ORDER.length)]
  if (letter === undefined) throw new Error(`unreachable letter index: ${index}`)
  return letter
}

export function naturalPitchClass(letter: Letter): number {
  return LETTER_SEMITONES[letter]
}

/** 0-11，丢失拼写信息，仅用于比较音高。 */
export function pitchClass(note: Note): number {
  return mod(naturalPitchClass(note.letter) + note.accidental, 12)
}

/** MIDI 音高值，C4 = 60。要求 note 带八度。 */
export function midiValue(note: Note): number {
  if (note.octave === undefined) {
    throw new Error(`midiValue requires an octave: ${formatNote(note)}`)
  }
  return (note.octave + 1) * 12 + naturalPitchClass(note.letter) + note.accidental
}

export function isAccidental(value: number): value is Accidental {
  return value === -2 || value === -1 || value === 0 || value === 1 || value === 2
}

/**
 * 给定字母与目标半音，反推变化音。
 *
 * 这是保证拼写正确的核心：调用方先按度数决定字母，再用本函数
 * 把该字母修正到目标音高，而不是从半音数反推字母。
 */
export function noteFromLetterAndPitchClass(
  letter: Letter,
  targetPitchClass: number,
  octave?: number,
): Note {
  // 规范到 -6..5，避免跨八度边界时得到 ±11 这类无意义偏移。
  const offset = mod(targetPitchClass - naturalPitchClass(letter) + 6, 12) - 6
  if (!isAccidental(offset)) {
    throw new Error(
      `${letter} cannot reach pitch class ${targetPitchClass} within double accidentals`,
    )
  }
  return octave === undefined
    ? { letter, accidental: offset }
    : { letter, accidental: offset, octave }
}

export function formatNote(note: Note): string {
  const octave = note.octave === undefined ? '' : String(note.octave)
  return `${note.letter}${ACCIDENTAL_TEXT[note.accidental]}${octave}`
}

/** 中文音名，例如 F# → 升F。 */
export function formatNoteZh(note: Note): string {
  return `${ACCIDENTAL_LABEL[note.accidental]}${note.letter}`
}

const NOTE_PATTERN = /^([A-Ga-g])((?:#|b|x|♯|♭|♮)*)(-?\d+)?$/

/** 接受 C、f#、Bb、Ebb、C#4、Fx（x 为重升）等写法。 */
export function parseNote(text: string): Note {
  const match = NOTE_PATTERN.exec(text.trim())
  if (match === null) throw new Error(`invalid note: ${text}`)

  const [, rawLetter, rawAccidental, rawOctave] = match
  if (rawLetter === undefined) throw new Error(`invalid note: ${text}`)

  const letter = rawLetter.toUpperCase() as Letter
  let offset = 0
  for (const symbol of rawAccidental ?? '') {
    if (symbol === '#' || symbol === '♯') offset += 1
    else if (symbol === 'b' || symbol === '♭') offset -= 1
    else if (symbol === 'x') offset += 2
    // ♮ 为本位记号，不改变偏移
  }
  if (!isAccidental(offset)) throw new Error(`accidental out of range: ${text}`)

  if (rawOctave === undefined) return { letter, accidental: offset }
  return { letter, accidental: offset, octave: Number.parseInt(rawOctave, 10) }
}

/** 半音移调时的拼写偏好。 */
export type SpellingPreference = 'sharp' | 'flat'

/** 升号拼写下 0-11 半音对应的字母与变化音。 */
const SHARP_SPELLING: readonly (readonly [Letter, Accidental])[] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]

const FLAT_SPELLING: readonly (readonly [Letter, Accidental])[] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
]

/**
 * 按半音数移调。
 *
 * 与 noteFromInterval 的区别：那个按「度数 + 性质」构造，保证功能拼写正确；
 * 本函数只保证音高正确，拼写按偏好从固定表选取。适用于只关心音高的场景 ——
 * 例如逐半音测试声乐音域，此时 C#4 与 Db4 没有功能差别。
 *
 * 要求带八度，因为移调必须能跨越八度边界。
 */
export function transposeBySemitones(
  note: Note,
  semitones: number,
  preference: SpellingPreference = 'sharp',
): Note {
  const targetMidi = midiValue(note) + semitones
  if (targetMidi < 0 || targetMidi > 127) {
    throw new Error(`transposed note falls outside MIDI range: ${targetMidi}`)
  }

  const table = preference === 'sharp' ? SHARP_SPELLING : FLAT_SPELLING
  const entry = table[mod(targetMidi, 12)]
  if (entry === undefined) throw new Error(`unreachable spelling index for midi ${targetMidi}`)

  const [letter, accidental] = entry
  // 由 MIDI 值反推八度：C4 = 60，故八度 = floor(midi / 12) - 1。
  // 用字母的自然音高而非目标音高计算，确保 B#/Cb 这类跨界拼写落在正确八度。
  const octave = Math.floor((targetMidi - accidental) / 12) - 1
  return { letter, accidental, octave }
}

/** 同音异名判断：音高相同但拼写不同，例如 F# 与 Gb。 */
export function isEnharmonic(a: Note, b: Note): boolean {
  return pitchClass(a) === pitchClass(b)
}

export function isSameNote(a: Note, b: Note): boolean {
  return a.letter === b.letter && a.accidental === b.accidental && a.octave === b.octave
}
