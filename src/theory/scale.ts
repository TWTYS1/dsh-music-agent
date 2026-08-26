/**
 * 音阶与调式推导。
 *
 * 每种音阶用「字母前进步数 + 相对主音半音数」成对定义，而不是只用半音数。
 * 字母步数保证拼写：七声音阶中七个字母各出现一次，因此 G 大调第七音
 * 必然落在 F 上并被修正为 F#，不会变成 Gb。
 * 五声音阶跳过部分度数，同一套结构也能表达。
 */

import {
  type Note,
  formatNote,
  letterAt,
  letterIndex,
  noteFromLetterAndPitchClass,
  pitchClass,
} from './note.js'

export type ScaleMode =
  | 'major'
  | 'natural-minor'
  | 'harmonic-minor'
  | 'melodic-minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'major-pentatonic'
  | 'minor-pentatonic'

interface ScaleDefinition {
  /** 相对主音字母的前进步数。 */
  readonly degreeSteps: readonly number[]
  /** 相对主音的半音数。 */
  readonly semitones: readonly number[]
  readonly labelZh: string
}

const HEPTATONIC_STEPS = [0, 1, 2, 3, 4, 5, 6] as const

export const SCALE_DEFINITIONS: Readonly<Record<ScaleMode, ScaleDefinition>> = {
  'major': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 4, 5, 7, 9, 11], labelZh: '自然大调',
  },
  'natural-minor': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 3, 5, 7, 8, 10], labelZh: '自然小调',
  },
  'harmonic-minor': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 3, 5, 7, 8, 11], labelZh: '和声小调',
  },
  'melodic-minor': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 3, 5, 7, 9, 11], labelZh: '旋律小调（上行）',
  },
  'dorian': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 3, 5, 7, 9, 10], labelZh: '多利亚调式',
  },
  'phrygian': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 1, 3, 5, 7, 8, 10], labelZh: '弗里吉亚调式',
  },
  'lydian': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 4, 6, 7, 9, 11], labelZh: '利底亚调式',
  },
  'mixolydian': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 2, 4, 5, 7, 9, 10], labelZh: '混合利底亚调式',
  },
  'locrian': {
    degreeSteps: HEPTATONIC_STEPS, semitones: [0, 1, 3, 5, 6, 8, 10], labelZh: '洛克里亚调式',
  },
  'major-pentatonic': {
    degreeSteps: [0, 1, 2, 4, 5], semitones: [0, 2, 4, 7, 9], labelZh: '大调五声音阶',
  },
  'minor-pentatonic': {
    degreeSteps: [0, 2, 3, 4, 6], semitones: [0, 3, 5, 7, 10], labelZh: '小调五声音阶',
  },
}

/** 七声音阶各级的功能名称。第七级按半音数区分导音与下主音。 */
const DEGREE_LABELS_ZH: readonly string[] = [
  '主音', '上主音', '中音', '下属音', '属音', '下中音', '导音',
]

export interface ScaleDegree {
  /** 1 起算的级数。 */
  readonly degree: number
  readonly note: Note
  /** 相对主音的半音数。 */
  readonly semitonesFromTonic: number
  /** 仅七声音阶提供功能名称。 */
  readonly functionZh?: string
}

export interface Scale {
  readonly tonic: Note
  readonly mode: ScaleMode
  readonly labelZh: string
  readonly degrees: readonly ScaleDegree[]
  readonly notes: readonly Note[]
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size
}

export function isScaleMode(value: string): value is ScaleMode {
  return Object.hasOwn(SCALE_DEFINITIONS, value)
}

export function buildScale(tonic: Note, mode: ScaleMode): Scale {
  const definition = SCALE_DEFINITIONS[mode]
  const tonicPitchClass = pitchClass(tonic)
  const tonicLetterIndex = letterIndex(tonic.letter)
  const isHeptatonic = definition.degreeSteps.length === 7

  const degrees = definition.degreeSteps.map((step, index) => {
    const semitone = definition.semitones[index]
    if (semitone === undefined) {
      throw new Error(`scale definition for ${mode} is inconsistent at index ${index}`)
    }
    const letter = letterAt(tonicLetterIndex + step)
    const note = noteFromLetterAndPitchClass(letter, mod(tonicPitchClass + semitone, 12))

    if (!isHeptatonic) {
      return { degree: index + 1, note, semitonesFromTonic: semitone }
    }
    // 第七级为大七度时是导音，小七度时称下主音。
    const label = index === 6 && semitone === 10 ? '下主音' : DEGREE_LABELS_ZH[index]
    return label === undefined
      ? { degree: index + 1, note, semitonesFromTonic: semitone }
      : { degree: index + 1, note, semitonesFromTonic: semitone, functionZh: label }
  })

  return {
    tonic,
    mode,
    labelZh: definition.labelZh,
    degrees,
    notes: degrees.map(entry => entry.note),
  }
}

export function formatScale(scale: Scale): string {
  return scale.notes.map(formatNote).join(' ')
}
