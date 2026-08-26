/**
 * 受控词表。
 *
 * 存在理由：若模型今天说「忧郁」明天说「emo」，记忆无法聚合、推荐无法对齐。
 * 所有领域概念必须映射到固定标识。本文件同时承担中文输入的反查，
 * 使模型可以用「大三和弦」或 'major' 任一种写法调用工具。
 */

import { type ChordQuality, CHORD_DEFINITIONS } from './chord.js'
import { type KeyMode } from './key.js'
import { type ScaleMode, SCALE_DEFINITIONS } from './scale.js'

/** 情绪词表，供曲库检索与推荐对齐使用。 */
export const MOOD_VOCABULARY = [
  '轻松', '平静', '专注', '活力', '愉快', '温暖', '治愈', '忧郁', '梦幻', '激昂',
] as const

/** 场景词表。 */
export const SCENE_VOCABULARY = [
  '通勤', '学习', '工作', '运动', '睡前', '独处', '聚会', '旅行', '雨天', '阅读', '清晨',
] as const

export type Mood = (typeof MOOD_VOCABULARY)[number]
export type Scene = (typeof SCENE_VOCABULARY)[number]

export function isMood(value: string): value is Mood {
  return (MOOD_VOCABULARY as readonly string[]).includes(value)
}

export function isScene(value: string): value is Scene {
  return (SCENE_VOCABULARY as readonly string[]).includes(value)
}

/** 中文调式别名，覆盖常见简写。 */
const SCALE_ALIASES: Readonly<Record<string, ScaleMode>> = {
  '大调': 'major',
  '自然大调': 'major',
  '小调': 'natural-minor',
  '自然小调': 'natural-minor',
  '和声小调': 'harmonic-minor',
  '旋律小调': 'melodic-minor',
  '多利亚': 'dorian',
  '多利亚调式': 'dorian',
  '弗里吉亚': 'phrygian',
  '弗里吉亚调式': 'phrygian',
  '利底亚': 'lydian',
  '利底亚调式': 'lydian',
  '混合利底亚': 'mixolydian',
  '混合利底亚调式': 'mixolydian',
  '洛克里亚': 'locrian',
  '洛克里亚调式': 'locrian',
  '大调五声': 'major-pentatonic',
  '大调五声音阶': 'major-pentatonic',
  '五声音阶': 'major-pentatonic',
  '小调五声': 'minor-pentatonic',
  '小调五声音阶': 'minor-pentatonic',
}

const CHORD_ALIASES: Readonly<Record<string, ChordQuality>> = {
  '大三和弦': 'major',
  '大三': 'major',
  '小三和弦': 'minor',
  '小三': 'minor',
  '减三和弦': 'diminished',
  '减三': 'diminished',
  '增三和弦': 'augmented',
  '增三': 'augmented',
  '大七和弦': 'major7',
  '大七': 'major7',
  '小七和弦': 'minor7',
  '小七': 'minor7',
  '属七和弦': 'dominant7',
  '属七': 'dominant7',
  '半减七和弦': 'minor7flat5',
  '半减七': 'minor7flat5',
  '减七和弦': 'diminished7',
  '减七': 'diminished7',
  '挂二和弦': 'sus2',
  '挂二': 'sus2',
  '挂四和弦': 'sus4',
  '挂四': 'sus4',
}

/** 解析调式，接受内部标识或中文术语。 */
export function resolveScaleMode(input: string): ScaleMode {
  const trimmed = input.trim()
  if (Object.hasOwn(SCALE_DEFINITIONS, trimmed)) return trimmed as ScaleMode
  const alias = SCALE_ALIASES[trimmed]
  if (alias !== undefined) return alias
  throw new Error(`unknown scale mode: ${input}`)
}

/** 解析和弦品质，接受内部标识或中文术语。 */
export function resolveChordQuality(input: string): ChordQuality {
  const trimmed = input.trim()
  if (Object.hasOwn(CHORD_DEFINITIONS, trimmed)) return trimmed as ChordQuality
  const alias = CHORD_ALIASES[trimmed]
  if (alias !== undefined) return alias
  throw new Error(`unknown chord quality: ${input}`)
}

/** 解析调号用的调式，只接受大调与自然小调。 */
export function resolveKeyMode(input: string): KeyMode {
  const mode = resolveScaleMode(input)
  if (mode === 'major' || mode === 'natural-minor') return mode
  throw new Error(`key signatures are defined only for major and natural minor, got: ${input}`)
}

/** 供工具 schema 的 description 列出可选值。 */
export function listScaleModes(): readonly { mode: ScaleMode; labelZh: string }[] {
  return Object.entries(SCALE_DEFINITIONS)
    .map(([mode, definition]) => ({ mode: mode as ScaleMode, labelZh: definition.labelZh }))
}

export function listChordQualities(): readonly { quality: ChordQuality; labelZh: string }[] {
  return Object.entries(CHORD_DEFINITIONS)
    .map(([quality, definition]) => ({
      quality: quality as ChordQuality,
      labelZh: definition.labelZh,
    }))
}
