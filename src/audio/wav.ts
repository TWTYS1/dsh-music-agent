/**
 * WAV 编码：Float32 样本 → 16 位 PCM 单声道 WAV 字节流。
 *
 * 选 WAV 而非压缩格式的理由：Windows 内置的 SoundPlayer 只认 WAV，
 * 而它是唯一无需任何额外依赖就能播放的途径。
 */

const HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)              // fmt 块长度
  view.setUint16(20, 1, true)               // 1 = 未压缩 PCM
  view.setUint16(22, 1, true)               // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)  // 每秒字节数
  view.setUint16(32, BYTES_PER_SAMPLE, true)               // 帧对齐
  view.setUint16(34, 16, true)              // 位深

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = HEADER_BYTES
  for (let index = 0; index < samples.length; index += 1) {
    const raw = samples[index] ?? 0
    const clamped = raw > 1 ? 1 : raw < -1 ? -1 : raw
    view.setInt16(offset, Math.round(clamped * 32767), true)
    offset += BYTES_PER_SAMPLE
  }

  return new Uint8Array(buffer)
}

/** 从 WAV 字节流读回采样率与样本数，供校验使用。 */
export function readWavHeader(bytes: Uint8Array): {
  sampleRate: number
  channels: number
  bitsPerSample: number
  sampleCount: number
} {
  if (bytes.length < HEADER_BYTES) throw new Error('wav too short')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const bitsPerSample = view.getUint16(34, true)
  const dataBytes = view.getUint32(40, true)
  return {
    sampleRate: view.getUint32(24, true),
    channels: view.getUint16(22, true),
    bitsPerSample,
    sampleCount: dataBytes / (bitsPerSample / 8),
  }
}
