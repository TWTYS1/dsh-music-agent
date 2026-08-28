/**
 * 记忆读写：memory/ 中唯一有 I/O 的模块。
 *
 * profile 存单个 JSON，episodes 存 JSONL 追加。选 JSONL 而非单个数组：
 * 追加一行是原子性最好的写法，进程中断不会毁掉已有记录。
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { episodesPath, profilePath } from './paths.js'
import { EMPTY_PROFILE, type Episode, type MusicProfile } from './types.js'

/** 读取失败一律回落到空 profile —— 记忆不可用不应让 Agent 无法对话。 */
export function loadProfile(): MusicProfile {
  const path = profilePath()
  if (!existsSync(path)) return EMPTY_PROFILE
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MusicProfile>
    return {
      instruments: parsed.instruments ?? [],
      solfegeSystem: parsed.solfegeSystem ?? 'fixed-do',
      goals: parsed.goals ?? [],
      updatedAt: parsed.updatedAt ?? EMPTY_PROFILE.updatedAt,
      ...(parsed.vocalRange === undefined ? {} : { vocalRange: parsed.vocalRange }),
      ...(parsed.level === undefined ? {} : { level: parsed.level }),
    }
  } catch {
    return EMPTY_PROFILE
  }
}

export function saveProfile(profile: MusicProfile): void {
  writeFileSync(profilePath(), `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
}

export function appendEpisode(episode: Episode): void {
  appendFileSync(episodesPath(), `${JSON.stringify(episode)}\n`, 'utf8')
}

/**
 * 读取 episodes。
 *
 * 单行解析失败时跳过该行而非抛出：一条损坏记录不应让整个记忆不可读。
 */
export function loadEpisodes(): Episode[] {
  const path = episodesPath()
  if (!existsSync(path)) return []

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return []
  }

  const episodes: Episode[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const parsed = JSON.parse(trimmed) as Episode
      if (typeof parsed.kind === 'string' && typeof parsed.at === 'string') {
        episodes.push(parsed)
      }
    } catch {
      // 跳过损坏行
    }
  }
  return episodes
}

/** 记录 profile 字段变更，使用户改口有迹可循。 */
export function recordProfileChange(field: string, from: string, to: string): void {
  if (from === to) return
  appendEpisode({
    kind: 'profile-change',
    at: new Date().toISOString(),
    field,
    from,
    to,
  })
}
