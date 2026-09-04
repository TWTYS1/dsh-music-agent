/**
 * 播放工具：把乐理音名变成可听的声音。
 *
 * 只有一个工具而非 play_scale / play_chord / play_interval 三个：
 * 音名序列已经能表达全部三种场景，多余的工具只会占用上下文预算。
 */

import {
  DEFAULT_SAMPLE_RATE,
  type ToneOptions,
  assignOctaves,
  concatWithGap,
  noteFrequency,
  renderChord,
  renderSequence,
} from '../audio/synth.js'
import { playWav } from '../audio/player.js'
import { encodeWav } from '../audio/wav.js'
import { formatNote, parseNote } from '../theory/note.js'

export type PlayStyle = 'chord' | 'sequence' | 'sequence-then-chord'

export const PLAY_STYLE_LABELS_ZH: Readonly<Record<PlayStyle, string>> = {
  'chord': '同时奏响',
  'sequence': '依次奏响',
  'sequence-then-chord': '先依次再同时',
}

export function isPlayStyle(value: string): value is PlayStyle {
  return value === 'chord' || value === 'sequence' || value === 'sequence-then-chord'
}

export interface PlayNotesQuery {
  notes: string[]
  style?: string
  bpm?: number
  octave?: number
  holdMs?: number
  repeat?: number
}

export interface PlayTool<TInput, TOutput> {
  readonly name: string
  readonly description: string
  execute(input: TInput): TOutput
}

export function createPlayNotesTool(): PlayTool<PlayNotesQuery, Record<string, unknown>> {
  return {
    name: 'play_notes',
    description: 'Synthesize and play notes as a chord, a sequence, or both.',
    execute: ({ notes, style, bpm, octave, holdMs, repeat }) => {
      if (notes.length === 0) throw new Error('notes must not be empty')
      if (notes.length > 16) throw new Error(`at most 16 notes, got ${notes.length}`)

      const requestedStyle = style ?? 'chord'
      if (!isPlayStyle(requestedStyle)) {
        throw new Error(
          `unknown style: ${requestedStyle}. valid: chord, sequence, sequence-then-chord`,
        )
      }

      const startOctave = octave ?? 4
      if (!Number.isInteger(startOctave) || startOctave < 1 || startOctave > 7) {
        throw new Error(`octave must be an integer 1-7, got ${startOctave}`)
      }

      const tempo = bpm ?? 100
      if (!Number.isFinite(tempo) || tempo < 30 || tempo > 240) {
        throw new Error(`bpm must be 30-240, got ${tempo}`)
      }

      const parsed = assignOctaves(notes.map(parseNote), startOctave)
      const frequencies = parsed.map(noteFrequency)

      const hold = holdMs ?? undefined
      if (hold !== undefined && (!Number.isFinite(hold) || hold < 200 || hold > 6000)) {
        throw new Error(`holdMs must be 200-6000, got ${hold}`)
      }
      const times = repeat ?? 1
      if (!Number.isInteger(times) || times < 1 || times > 5) {
        throw new Error(`repeat must be an integer 1-5, got ${times}`)
      }

      // 依次奏响时每音占一拍；和弦统一用较长的时值以便听清性质。
      // holdMs 显式给出时覆盖两者 —— 跟唱参考音需要远长于「听和弦性质」的时值。
      const beatMs = 60_000 / tempo
      const sequenceOptions: ToneOptions = {
        sampleRate: DEFAULT_SAMPLE_RATE,
        durationMs: hold ?? Math.min(beatMs * 0.9, 1200),
        amplitude: 0.8,
      }
      const chordOptions: ToneOptions = {
        sampleRate: DEFAULT_SAMPLE_RATE,
        durationMs: hold ?? 1600,
        amplitude: 0.8,
      }
      const gapMs = beatMs * 0.1

      let samples: Float32Array
      if (requestedStyle === 'chord') {
        samples = renderChord(frequencies, chordOptions)
      } else if (requestedStyle === 'sequence') {
        samples = renderSequence(frequencies, sequenceOptions, gapMs)
      } else {
        samples = concatWithGap(
          renderSequence(frequencies, sequenceOptions, gapMs),
          renderChord(frequencies, chordOptions),
          DEFAULT_SAMPLE_RATE,
          220,
        )
      }

      // 重复整段而非单音：跟唱时听两遍同样的音才有把握，
      // 而把重复做在音频里比让模型多次调用工具更省一轮往返。
      if (times > 1) {
        let combined = samples
        for (let index = 1; index < times; index += 1) {
          combined = concatWithGap(combined, samples, DEFAULT_SAMPLE_RATE, 600)
        }
        samples = combined
      }

      const wav = encodeWav(samples, DEFAULT_SAMPLE_RATE)
      const spelled = parsed.map(formatNote)
      const playback = playWav(
        wav,
        `${spelled.join(',')}|${requestedStyle}|${tempo}|${hold ?? 'auto'}|${times}`,
      )

      return {
        played: playback.started,
        style: requestedStyle,
        styleZh: PLAY_STYLE_LABELS_ZH[requestedStyle],
        notes: spelled,
        frequencies: frequencies.map(value => Math.round(value * 100) / 100),
        durationMs: Math.round(samples.length / DEFAULT_SAMPLE_RATE * 1000),
        bpm: tempo,
        repeat: times,
        ...(hold === undefined ? {} : { holdMs: hold }),
        cached: playback.cached,
        player: playback.player,
        ...(playback.started ? {} : { warning: '未找到可用的系统播放器，音频文件已生成但未播放。' }),
      }
    },
  }
}
