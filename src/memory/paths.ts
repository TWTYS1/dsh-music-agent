/**
 * 记忆的落盘位置。
 *
 * 放在 $DSH_HOME 下而非项目目录：记忆是用户的私有数据，不应进入版本控制，
 * 而 .dsh-music-dev/ 已被 .gitignore 排除。
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** DSH_HOME 由启动脚本设置；缺失时回退到 DSH 默认位置。 */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

export function memoryDir(): string {
  const dir = join(dshHome(), 'music-memory')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function profilePath(): string {
  return join(memoryDir(), 'profile.json')
}

export function episodesPath(): string {
  return join(memoryDir(), 'episodes.jsonl')
}
