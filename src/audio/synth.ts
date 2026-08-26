/**
 * 音频合成：音符 → PCM 样本。
 *
 * 纯函数，无 I/O，可独立验证 —— 与 theory/ 同样的纪律。
 * 音色用加法合成（基频 + 泛音列）而非纯正弦：纯正弦听起来单薄，
 * 分辨和弦性质时反而更困难。
 */

import { type Note, letterIndex, midiValue } from '../theory/note.js'

export const DEFAULT_SAMPLE_RATE = 44100

export interface ToneOptions {
  readonly sampleRate: number
  readonly durationMs: number
  readonly amplitude: number
}

export const DEFAULT_TONE_OPTIONS: ToneOptions = {
  sampleRate: DEFAULT_SAMPLE_RATE,
  durationMs: 900,
  amplitude: 0.8,
}

/** 泛音相对强度，近似电钢琴／钟琴音色。 */
const HARMONIC_WEIGHTS: readonly number[] = [1, 0.35, 0.18, 0.09, 0.05]

const HARMONIC_SUM = HARMONIC_WEIGHTS.reduce((total, weight) => total + weight, 0)

/** A4 = 440 Hz，对应 MIDI 69。要求音名带八度。 */
export function noteFrequency(note: Note): number {
  return 440 * 2 ** ((midiValue(note) - 69) / 12)
}

/**
 * 包络。
 *
 * 起始与结尾的斜坡不是修饰而是必需：波形从 0 突变会产生可听的爆音（click）。
 * 中段用指数衰减模拟击键或拨弦的自然衰减。
 */
function envelopeAt(timeSec: number, durationSec: number): number {
  const attackSec = 0.008
  const releaseSec = 0.03

  if (timeSec < attackSec) return timeSec / attackSec

  const remaining = durationSec - timeSec
  if (remaining < releaseSec) return Math.max(0, remaining / releaseSec)

  return Math.exp(-(timeSec - attackSec) * 1.6)
}

/** 合成单个音。 */
export function renderTone(frequency: number, options: ToneOptions): Float32Array {
  const totalSamples = Math.max(1, Math.round(options.sampleRate * options.durationMs / 1000))
  const durationSec = options.durationMs / 1000
  const nyquist = options.sampleRate / 2
  const samples = new Float32Array(totalSamples)

  for (let index = 0; index < totalSamples; index += 1) {
    const timeSec = index / options.sampleRate
    let value = 0
    for (const [harmonic, weight] of HARMONIC_WEIGHTS.entries()) {
      const partialFrequency = frequency * (harmonic + 1)
      // 超过奈奎斯特频率的泛音会折返成噪声，必须丢弃。
      if (partialFrequency >= nyquist) break
      value += weight * Math.sin(2 * Math.PI * partialFrequency * timeSec)
    }
    samples[index] = (value / HARMONIC_SUM) * envelopeAt(timeSec, durationSec) * options.amplitude
  }

  return samples
}

/** 叠加多轨并在超过满刻度时归一化，避免削波失真。 */
export function mixTracks(tracks: readonly Float32Array[], totalSamples: number): Float32Array {
  const mixed = new Float32Array(totalSamples)
  for (const track of tracks) {
    const limit = Math.min(track.length, totalSamples)
    for (let index = 0; index < limit; index += 1) {
      mixed[index] = (mixed[index] ?? 0) + (track[index] ?? 0)
    }
  }

  let peak = 0
  for (let index = 0; index < totalSamples; index += 1) {
    peak = Math.max(peak, Math.abs(mixed[index] ?? 0))
  }
  if (peak > 1) {
    for (let index = 0; index < totalSamples; index += 1) {
      mixed[index] = (mixed[index] ?? 0) / peak
    }
  }

  return mixed
}

/** 和弦：所有音同时发声。 */
export function renderChord(
  frequencies: readonly number[],
  options: ToneOptions,
): Float32Array {
  if (frequencies.length === 0) return new Float32Array(0)
  const tracks = frequencies.map(frequency => renderTone(frequency, options))
  const totalSamples = Math.max(...tracks.map(track => track.length))
  return mixTracks(tracks, totalSamples)
}

/** 旋律：依次发声，音之间留间隔。 */
export function renderSequence(
  frequencies: readonly number[],
  options: ToneOptions,
  gapMs: number,
): Float32Array {
  if (frequencies.length === 0) return new Float32Array(0)

  const stepSamples = Math.round(options.sampleRate * (options.durationMs + gapMs) / 1000)
  const toneSamples = Math.round(options.sampleRate * options.durationMs / 1000)
  const totalSamples = stepSamples * (frequencies.length - 1) + toneSamples
  const output = new Float32Array(totalSamples)

  for (const [position, frequency] of frequencies.entries()) {
    const tone = renderTone(frequency, options)
    const offset = position * stepSamples
    for (let index = 0; index < tone.length; index += 1) {
      const target = offset + index
      if (target >= totalSamples) break
      output[target] = (output[target] ?? 0) + (tone[index] ?? 0)
    }
  }

  let peak = 0
  for (let index = 0; index < totalSamples; index += 1) {
    peak = Math.max(peak, Math.abs(output[index] ?? 0))
  }
  if (peak > 1) {
    for (let index = 0; index < totalSamples; index += 1) {
      output[index] = (output[index] ?? 0) / peak
    }
  }

  return output
}

/** 首尾拼接两段音频，中间插入静音。 */
export function concatWithGap(
  first: Float32Array,
  second: Float32Array,
  sampleRate: number,
  gapMs: number,
): Float32Array {
  const gapSamples = Math.round(sampleRate * gapMs / 1000)
  const output = new Float32Array(first.length + gapSamples + second.length)
  output.set(first, 0)
  output.set(second, first.length + gapSamples)
  return output
}

/**
 * 为不带八度的音名分配八度，使音列保持上升。
 *
 * 依据字母序而非半音数：音阶与和弦的音名字母本身是递增的，
 * 字母序回绕（B→C）即意味着进入下一个八度。转位和弦（E G C）
 * 也因此得到正确的 E4 G4 C5 而不是挤在同一八度里。
 * 已显式带八度的音名保持原值，并成为后续音的基准。
 */
export function assignOctaves(notes: readonly Note[], startOctave = 4): Note[] {
  const result: Note[] = []
  let octave = startOctave
  let previousLetterIndex = -1

  for (const note of notes) {
    if (note.octave !== undefined) {
      octave = note.octave
      previousLetterIndex = letterIndex(note.letter)
      result.push(note)
      continue
    }

    const currentLetterIndex = letterIndex(note.letter)
    if (previousLetterIndex >= 0 && currentLetterIndex < previousLetterIndex) {
      octave += 1
    }
    previousLetterIndex = currentLetterIndex
    result.push({ letter: note.letter, accidental: note.accidental, octave })
  }

  return result
}
