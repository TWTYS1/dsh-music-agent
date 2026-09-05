/**
 * 声乐工具：音域测试的流程推进。
 *
 * 工具本身无状态 —— 已测结果由模型从对话中收集并回传，
 * 因此同一个测试可以跨多轮对话继续，也不需要持久化中间状态。
 */

import {
  type Direction,
  type TestedNote,
  nextRangeStep,
  resolveVerdict,
} from '../vocal/range-test.js'

export interface VocalTool<TInput, TOutput> {
  readonly name: string
  readonly description: string
  execute(input: TInput): TOutput
}

/**
 * tested 的成员字段声明为可选：工具 schema 里嵌套对象的属性不强制必填，
 * 因此模型可能传来缺字段的条目。此处显式校验而非依赖类型假设。
 */
export interface RangeStepQuery {
  startNote: string
  direction: string
  tested?: readonly { note?: string | undefined; verdict?: string | undefined }[] | undefined
}

export function createVocalRangeStepTool(): VocalTool<
  RangeStepQuery,
  Record<string, unknown>
> {
  return {
    name: 'vocal_range_step',
    description: 'Compute the next note, phase, and progress for a vocal range test.',
    execute: ({ startNote, direction, tested }) => {
      if (direction !== 'up' && direction !== 'down') {
        throw new Error(`direction must be up or down, got: ${direction}`)
      }

      const history: TestedNote[] = (tested ?? []).map((entry, index) => {
        if (entry.note === undefined || entry.note.trim() === '') {
          throw new Error(`tested[${index}].note is required`)
        }
        if (entry.verdict === undefined || entry.verdict.trim() === '') {
          throw new Error(`tested[${index}].verdict is required`)
        }
        return { note: entry.note, verdict: resolveVerdict(entry.verdict) }
      })

      const state = nextRangeStep(startNote, direction as Direction, history)

      return {
        round: state.round,
        phase: state.phase,
        phaseZh: state.phase === 'coarse' ? '粗测（全音步进）' : '精测（半音步进）',
        done: state.done,
        progressZh: state.progressZh,
        testedCount: history.length,
        ...(state.nextNote === undefined ? {} : { nextNote: state.nextNote }),
        ...(state.nextStepSemitones === undefined
          ? {}
          : { nextStepSemitones: state.nextStepSemitones }),
        ...(state.limitNote === undefined ? {} : { limitNote: state.limitNote }),
        ...(state.comfortableNote === undefined
          ? {}
          : { comfortableNote: state.comfortableNote }),
      }
    },
  }
}
