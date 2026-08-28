/**
 * 把记忆渲染成注入提示词的文本。纯函数。
 *
 * 这段文本进入每一次模型请求，因此长度必须受控 —— 只放会改变
 * 教学决策的内容，不做完整转储。想看全部记忆用 get_memory 工具。
 */

import type { DerivedMemory } from './derive.js'
import {
  INSTRUMENT_LABELS_ZH,
  LEVEL_LABELS_ZH,
  type MusicProfile,
  SOLFEGE_LABELS_ZH,
} from './types.js'

/** 各清单在提示词里的条目上限，避免记忆越用越占上下文。 */
const MAX_LISTED = 6

function listConcepts(stats: DerivedMemory['masteredConcepts']): string {
  return stats
    .slice(0, MAX_LISTED)
    .map(stat => `${stat.concept}（正确率 ${Math.round(stat.accuracy * 100)}%）`)
    .join('、')
}

/**
 * 渲染为提示词文本。
 *
 * 绝不返回 undefined：renderPrompt 对已注册但无值的变量引用会抛异常，
 * 那将使整轮对话在组装提示词阶段失败。空记忆返回明确的占位说明。
 */
export function renderMemory(profile: MusicProfile, derived: DerivedMemory): string {
  const lines: string[] = []

  if (profile.instruments.length > 0) {
    lines.push(`乐器：${profile.instruments.map(i => INSTRUMENT_LABELS_ZH[i]).join('、')}`)
  }

  // 用户自述水平优先于推算值；推算值仅在无自述时作为参考出示。
  if (profile.level !== undefined) {
    lines.push(`水平：${LEVEL_LABELS_ZH[profile.level]}`)
  } else if (derived.levelEstimate !== undefined) {
    lines.push(`水平：${LEVEL_LABELS_ZH[derived.levelEstimate]}（由练习结果推算，未经确认）`)
  }

  if (profile.vocalRange !== undefined) {
    const range = profile.vocalRange
    const comfortable = range.comfortableLow !== undefined && range.comfortableHigh !== undefined
      ? `，舒适区 ${range.comfortableLow} 到 ${range.comfortableHigh}`
      : ''
    lines.push(
      `声乐音域：${range.lowest} 到 ${range.highest}${comfortable}`
      + `（测于 ${range.measuredAt.slice(0, 10)}）。为声乐出练习音时必须落在此范围内。`,
    )
  } else if (profile.instruments.includes('voice')) {
    lines.push('声乐音域：未测。首次进行声乐练习前应先建议做一次音域测试。')
  }

  lines.push(`唱名体系：${SOLFEGE_LABELS_ZH[profile.solfegeSystem]}`)

  if (profile.goals.length > 0) {
    lines.push(`学习目标：${profile.goals.join('；')}`)
  }

  if (derived.masteredConcepts.length > 0) {
    lines.push(`已掌握：${listConcepts(derived.masteredConcepts)}。不必从头讲解这些。`)
  }

  if (derived.weakPoints.length > 0) {
    lines.push(`薄弱项：${listConcepts(derived.weakPoints)}。出题时优先覆盖。`)
  }

  if (derived.totalAttempts > 0) {
    lines.push(
      `练习累计 ${derived.totalAttempts} 题，加权正确率 `
      + `${Math.round(derived.overallAccuracy * 100)}%。`,
    )
  }

  if (derived.acceptedTracks.length > 0) {
    lines.push(`喜欢过的曲目：${derived.acceptedTracks.slice(0, MAX_LISTED).join('、')}`)
  }
  if (derived.skippedTracks.length > 0) {
    lines.push(`跳过过的曲目：${derived.skippedTracks.slice(0, MAX_LISTED).join('、')}`)
  }

  if (lines.length <= 1) {
    return '尚无用户记忆。可在对话中了解用户的乐器、水平与目标，'
      + '并调用 remember_profile 记录；不要凭空假设。'
  }

  return lines.join('\n')
}
