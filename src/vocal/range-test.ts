/**
 * 声乐音域测试的流程逻辑。纯函数，无 I/O，无状态。
 *
 * 为什么不把流程写在 persona 里交给模型管：模型会忘记测到第几个音、
 * 会算错步进、会跳过精测阶段。流程放进代码后，进度与下一个音都是算出来的，
 * 而且可以用 smoke 验证。模型只负责播放、提问、把用户的回答传回来。
 *
 * 状态全部由调用方传入的 tested 列表承载，因此本模块无需持久状态。
 */

import { type Note, formatNote, midiValue, parseNote, transposeBySemitones } from '../theory/note.js'

/** 用户对某个音的反馈。 */
export type Verdict = 'comfortable' | 'strained' | 'unreachable'

export type Direction = 'up' | 'down'

const VERDICT_ALIASES: Readonly<Record<string, Verdict>> = {
  'comfortable': 'comfortable',
  '舒服': 'comfortable',
  '轻松': 'comfortable',
  '可以': 'comfortable',
  'strained': 'strained',
  '勉强': 'strained',
  '吃力': 'strained',
  '费劲': 'strained',
  'unreachable': 'unreachable',
  '唱不上去': 'unreachable',
  '唱不到': 'unreachable',
  '唱不下去': 'unreachable',
  '不行': 'unreachable',
}

export function resolveVerdict(input: string): Verdict {
  const trimmed = input.trim()
  const hit = VERDICT_ALIASES[trimmed]
  if (hit !== undefined) return hit
  throw new Error(
    `unknown verdict: ${input}. valid: comfortable/舒服, strained/勉强, unreachable/唱不上去`,
  )
}

export interface TestedNote {
  readonly note: string
  readonly verdict: Verdict
}

/**
 * 粗测用全音步进、精测用半音。
 *
 * 逐半音测满一个八度要 12 轮，嗓子会累、注意力也散。先用全音快速逼近边界，
 * 越界后再退回来用半音确认，一个八度约 6 到 8 轮即可完成 ——
 * 这也是声乐教学里实际的做法。
 */
const COARSE_STEP = 2
const FINE_STEP = 1

export type Phase = 'coarse' | 'fine'

export interface RangeTestState {
  readonly direction: Direction
  readonly round: number
  readonly phase: Phase
  readonly done: boolean
  /** 未完成时给出下一个该播放的音。 */
  readonly nextNote?: string
  /** 下一步的步进半音数，供说明用。 */
  readonly nextStepSemitones?: number
  /** 勉强也算的极限音，完成时给出。 */
  readonly limitNote?: string
  /** 回答「舒服」的最远音，完成时给出。 */
  readonly comfortableNote?: string
  /** 面向用户的进度描述。 */
  readonly progressZh: string
}

function sign(direction: Direction): number {
  return direction === 'up' ? 1 : -1
}

/** 按方向取最远的音：向上取最高，向下取最低。 */
function farthest(notes: readonly Note[], direction: Direction): Note | undefined {
  if (notes.length === 0) return undefined
  return notes.reduce((best, candidate) => {
    const better = direction === 'up'
      ? midiValue(candidate) > midiValue(best)
      : midiValue(candidate) < midiValue(best)
    return better ? candidate : best
  })
}

/**
 * 由已测结果推导测试状态。
 *
 * tested 为空时返回起点本身作为第一个待测音。
 */
export function nextRangeStep(
  startNote: string,
  direction: Direction,
  tested: readonly TestedNote[],
): RangeTestState {
  const start = parseNote(startNote)
  if (start.octave === undefined) {
    throw new Error(`startNote must include an octave, e.g. C4, got: ${startNote}`)
  }

  const round = tested.length + 1

  if (tested.length === 0) {
    return {
      direction,
      round,
      phase: 'coarse',
      done: false,
      nextNote: formatNote(start),
      nextStepSemitones: 0,
      progressZh: `准备开始${direction === 'up' ? '向上' : '向下'}测试，第 1 个音是起点 ${formatNote(start)}。`,
    }
  }

  const reached = tested
    .filter(entry => entry.verdict !== 'unreachable')
    .map(entry => parseNote(entry.note))
  const comfortable = tested
    .filter(entry => entry.verdict === 'comfortable')
    .map(entry => parseNote(entry.note))
  const unreachable = tested
    .filter(entry => entry.verdict === 'unreachable')
    .map(entry => parseNote(entry.note))

  const farthestReached = farthest(reached, direction)
  const farthestComfortable = farthest(comfortable, direction)
  const nearestUnreachable = farthest(unreachable, direction === 'up' ? 'down' : 'up')

  const directionZh = direction === 'up' ? '向上' : '向下'
  const boundaryZh = farthestReached === undefined
    ? '暂无可达音'
    : `目前可达到 ${formatNote(farthestReached)}`
  const comfortableZh = farthestComfortable === undefined
    ? ''
    : `，舒适边界 ${formatNote(farthestComfortable)}`

  // 起点就唱不了：无法继续，交由调用方改起点重测。
  if (farthestReached === undefined) {
    return {
      direction,
      round,
      phase: 'coarse',
      done: true,
      progressZh: `起点 ${formatNote(start)} 就无法唱出，请换一个更${direction === 'up' ? '低' : '高'}的起点重新开始。`,
    }
  }

  // 尚未越界：继续粗测。
  if (nearestUnreachable === undefined) {
    const next = transposeBySemitones(farthestReached, sign(direction) * COARSE_STEP, 'sharp')
    return {
      direction,
      round,
      phase: 'coarse',
      done: false,
      nextNote: formatNote(next),
      nextStepSemitones: COARSE_STEP,
      progressZh: `第 ${round} 个音（粗测，${directionZh}一个全音）：${boundaryZh}${comfortableZh}。`,
    }
  }

  // 已越界：若与最远可达音之间还留有半音间隙，退回来精测。
  const gap = Math.abs(midiValue(nearestUnreachable) - midiValue(farthestReached))
  if (gap > FINE_STEP) {
    const next = transposeBySemitones(farthestReached, sign(direction) * FINE_STEP, 'sharp')
    return {
      direction,
      round,
      phase: 'fine',
      done: false,
      nextNote: formatNote(next),
      nextStepSemitones: FINE_STEP,
      progressZh: `第 ${round} 个音（精测，${directionZh}一个半音）：`
        + `${formatNote(nearestUnreachable)} 已唱不了，${boundaryZh}${comfortableZh}。`,
    }
  }

  // 间隙已收窄到半音，边界确定。
  return {
    direction,
    round: tested.length,
    phase: 'fine',
    done: true,
    limitNote: formatNote(farthestReached),
    ...(farthestComfortable === undefined
      ? {}
      : { comfortableNote: formatNote(farthestComfortable) }),
    progressZh: `${directionZh}测试完成：极限 ${formatNote(farthestReached)}`
      + `${farthestComfortable === undefined ? '' : `，舒适边界 ${formatNote(farthestComfortable)}`}。`,
  }
}
