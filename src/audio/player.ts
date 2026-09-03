/**
 * 播放层：唯一有 I/O 的音频模块。
 *
 * 走「写 WAV 文件 + 交给系统播放器」而非原生音频绑定：原生模块在 Windows 上
 * 需要编译工具链，容易安装失败，而系统播放器零依赖且在 CLI 与 GUI 下都可用 ——
 * 服务跑在本机，服务端出声就等于用户听到。
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE_DIR = join(tmpdir(), 'dsh-music-agent-audio')

/** 诊断日志：播放发生在独立进程里，没有日志时「没声音」无法排查。 */
function diag(message: string): void {
  try {
    appendFileSync(
      join(CACHE_DIR, 'playback.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8',
    )
  } catch {
    // 日志失败不得影响播放
  }
}

export interface PlaybackResult {
  readonly filePath: string
  /** 命中缓存时未重新合成。 */
  readonly cached: boolean
  /** 播放是否已实际发起。缺少可用播放器时为 false。 */
  readonly started: boolean
  readonly player: string
}

/** 内容相同则复用文件，避免重复合成同一个和弦。 */
function cacheKey(payload: string): string {
  return createHash('sha1').update(payload).digest('hex').slice(0, 16)
}

interface PlayerCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly label: string
}

function resolvePlayer(filePath: string): PlayerCommand | undefined {
  if (process.platform === 'win32') {
    // SoundPlayer 只支持 WAV。PlaySync 让子进程活到播完为止；若用异步 Play，
    // 进程会立即退出并掐断声音。
    return {
      command: 'powershell',
      args: [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `(New-Object Media.SoundPlayer -ArgumentList ([string]$env:DSH_AUDIO_FILE)).PlaySync()`,
      ],
      label: 'powershell SoundPlayer',
    }
  }
  if (process.platform === 'darwin') {
    return { command: 'afplay', args: [filePath], label: 'afplay' }
  }
  return { command: 'aplay', args: ['-q', filePath], label: 'aplay' }
}

/**
 * 写入 WAV 并发起播放，不等待播完。
 *
 * 关键：**不能用 detached: true**。在 Windows 上它让子进程脱离父进程的
 * 控制台与会话上下文，音频子系统随即拒绝服务，而 SoundPlayer.PlaySync()
 * 对这种失败不抛异常、不写 stderr、退出码仍为 0 —— 表现为「一切正常但没有声音」。
 * 实测同一命令：detached 存活 0.51 秒（未播放），非 detached 存活 3.69 秒（正常播放）。
 *
 * 不阻塞对话由 spawn 本身的异步性保证，不需要 detached。unref() 则确保
 * 播放进程不会阻止父进程退出。
 */
export function playWav(wav: Uint8Array, payloadKey: string): PlaybackResult {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

  const filePath = join(CACHE_DIR, `${cacheKey(payloadKey)}.wav`)
  const cached = existsSync(filePath)
  if (!cached) writeFileSync(filePath, wav)

  const player = resolvePlayer(filePath)
  if (player === undefined) {
    return { filePath, cached, started: false, player: 'none' }
  }

  try {
    // 路径经环境变量传递，避免把含空格或引号的路径拼进命令字符串。
    // stderr 用 pipe 而非 ignore：播放失败必须留下痕迹，否则「没声音」
    // 这类故障完全不可诊断。
    const child = spawn(player.command, [...player.args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, DSH_AUDIO_FILE: filePath },
    })

    diag(`spawn ok pid=${child.pid ?? '?'} cmd=${player.command} file=${filePath}`)

    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => diag(`spawn error: ${String(error)}`))
    child.on('exit', (code, signal) => {
      diag(`exit code=${code} signal=${signal} stderr=${stderr.trim() || '(空)'}`)
    })

    child.unref()
    return { filePath, cached, started: true, player: player.label }
  } catch (error) {
    diag(`spawn threw: ${String(error)}`)
    return { filePath, cached, started: false, player: player.label }
  }
}

export function audioCacheDir(): string {
  return CACHE_DIR
}
