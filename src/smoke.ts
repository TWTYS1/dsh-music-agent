/**
 * 确定性检查。
 *
 * 乐理有唯一正确答案，因此这里覆盖的是最容易算错的场景 —— 尤其是
 * 音名拼写：拼写错误不会让程序崩溃，只会静默地教错乐理。
 */

import {
  assignOctaves,
  noteFrequency,
  renderChord,
  renderSequence,
  renderTone,
} from './audio/synth.js'
import { encodeWav, readWavHeader } from './audio/wav.js'
import { deriveMemory } from './memory/derive.js'
import { renderMemory } from './memory/render.js'
import { EMPTY_PROFILE, type Episode, type MusicProfile } from './memory/types.js'
import { buildChord } from './theory/chord.js'
import {
  type Difficulty,
  type ExerciseType,
  generateExercise,
  gradeExercise,
} from './theory/exercise.js'
import { getCircleOfFifths, getKeySignature } from './theory/key.js'
import { formatInterval, intervalBetween } from './theory/interval.js'
import { formatNote, parseNote, transposeBySemitones } from './theory/note.js'
import { buildScale, formatScale } from './theory/scale.js'
import { resolveChordQuality, resolveScaleMode } from './theory/vocabulary.js'
import { MockMusicGateway } from './gateway/mock-music-gateway.js'
import { createSearchTracksTool } from './tools/search-tracks.js'

let failures = 0

function check(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    failures += 1
    console.error(`FAIL ${label}\n  expected: ${expected}\n  actual:   ${actual}`)
  }
}

function scaleOf(tonic: string, mode: string): string {
  return formatScale(buildScale(parseNote(tonic), resolveScaleMode(mode)))
}

function chordOf(root: string, quality: string, inversion = 0): string {
  const chord = buildChord(parseNote(root), resolveChordQuality(quality), inversion as 0 | 1 | 2 | 3)
  return chord.notes.map(formatNote).join(' ')
}

// ── 音阶拼写：七声音阶中七个字母必须各出现一次 ──────────────────────
check('C 大调', scaleOf('C', 'major'), 'C D E F G A B')
// 第七音必须是 F# 而不是等音的 Gb，这是半音数建模最典型的错误。
check('G 大调', scaleOf('G', 'major'), 'G A B C D E F#')
// 升号调的极端情况，必须出现 B#。
check('C# 大调', scaleOf('C#', 'major'), 'C# D# E# F# G# A# B#')
check('Eb 大调', scaleOf('Eb', 'major'), 'Eb F G Ab Bb C D')
check('F# 大调', scaleOf('F#', 'major'), 'F# G# A# B C# D# E#')
check('Cb 大调', scaleOf('Cb', 'major'), 'Cb Db Eb Fb Gb Ab Bb')

// ── 小调与调式 ──────────────────────────────────────────────────
check('A 自然小调', scaleOf('A', '自然小调'), 'A B C D E F G')
// 和声小调升高第七音：G 必须变成 G#。
check('A 和声小调', scaleOf('A', '和声小调'), 'A B C D E F G#')
check('A 旋律小调', scaleOf('A', '旋律小调'), 'A B C D E F# G#')
check('D 多利亚', scaleOf('D', '多利亚'), 'D E F G A B C')
check('E 弗里吉亚', scaleOf('E', '弗里吉亚'), 'E F G A B C D')
check('F 利底亚', scaleOf('F', '利底亚'), 'F G A B C D E')
check('G 混合利底亚', scaleOf('G', '混合利底亚'), 'G A B C D E F')
check('B 洛克里亚', scaleOf('B', '洛克里亚'), 'B C D E F G A')
// 五声音阶跳过度数，字母不再连续。
check('C 大调五声', scaleOf('C', '大调五声音阶'), 'C D E G A')
check('A 小调五声', scaleOf('A', '小调五声音阶'), 'A C D E G')

// ── 音程：增四度与减五度半音数相同，功能不同 ─────────────────────
const augmentedFourth = intervalBetween(parseNote('C'), parseNote('F#'))
const diminishedFifth = intervalBetween(parseNote('C'), parseNote('Gb'))
check('增四度', formatInterval(augmentedFourth), 'augmented4')
check('减五度', formatInterval(diminishedFifth), 'diminished5')
check(
  '增四度与减五度半音数相同',
  `${augmentedFourth.semitones} ${diminishedFifth.semitones}`,
  '6 6',
)
check('纯五度', formatInterval(intervalBetween(parseNote('C'), parseNote('G'))), 'perfect5')
check('小三度', formatInterval(intervalBetween(parseNote('A'), parseNote('C'))), 'minor3')
check('大七度', formatInterval(intervalBetween(parseNote('C'), parseNote('B'))), 'major7')
// 同度的减小情形：原始半音距离会算成 11，必须修正为 -1。
check('减一度', formatInterval(intervalBetween(parseNote('C'), parseNote('Cb'))), 'diminished1')

// ── 和弦构成 ────────────────────────────────────────────────────
check('C 大三和弦', chordOf('C', '大三和弦'), 'C E G')
check('A 小三和弦', chordOf('A', '小三和弦'), 'A C E')
check('G 属七和弦', chordOf('G', '属七和弦'), 'G B D F')
check('C 大七和弦', chordOf('C', '大七和弦'), 'C E G B')
check('B 半减七和弦', chordOf('B', '半减七和弦'), 'B D F A')
// 减七和弦四音等距，第七音是减七度，必须拼成 Bbb 而不是等音的 A。
check('C 减七和弦', chordOf('C', '减七和弦'), 'C Eb Gb Bbb')
check('C 增三和弦', chordOf('C', '增三和弦'), 'C E G#')
check('C 挂四和弦', chordOf('C', '挂四和弦'), 'C F G')

// 转位只改变排列，不改变音名集合。
check('C 大三和弦第一转位', chordOf('C', '大三和弦', 1), 'E G C')
check('C 大三和弦第二转位', chordOf('C', '大三和弦', 2), 'G C E')
check('G 属七和弦第三转位', chordOf('G', '属七和弦', 3), 'F G B D')

const rootPosition = buildChord(parseNote('C'), 'major', 0)
const secondInversion = buildChord(parseNote('C'), 'major', 2)
check(
  '转位后音名集合不变',
  [...secondInversion.notes].map(formatNote).sort().join(' '),
  [...rootPosition.notes].map(formatNote).sort().join(' '),
)
check('转位低音', formatNote(secondInversion.bass), 'G')
check('转位和弦符号', secondInversion.symbol, 'C/G')

// ── 调号与五度圈 ────────────────────────────────────────────────
const cMajor = getKeySignature(parseNote('C'), 'major')
check('C 大调调号', `${cMajor.sharps} ${cMajor.flats}`, '0 0')
check('C 大调关系小调', cMajor.relativeKey.labelZh, 'A小调')

const gMajor = getKeySignature(parseNote('G'), 'major')
check('G 大调升号数', String(gMajor.sharps), '1')
check('G 大调变化音', gMajor.alteredNotes.map(formatNote).join(' '), 'F#')
check('G 大调关系小调', gMajor.relativeKey.labelZh, 'E小调')

const ebMajor = getKeySignature(parseNote('Eb'), 'major')
check('Eb 大调降号数', String(ebMajor.flats), '3')
check('Eb 大调五度圈位置', String(ebMajor.circlePosition), '-3')

const aMinor = getKeySignature(parseNote('A'), 'natural-minor')
check('A 小调调号', `${aMinor.sharps} ${aMinor.flats}`, '0 0')
check('A 小调关系大调', aMinor.relativeKey.labelZh, 'C大调')

const circle = getCircleOfFifths(parseNote('C'), 'major')
check('C 顺时针邻居', formatNote(circle.sharpward.tonic), 'G')
check('C 逆时针邻居', formatNote(circle.flatward.tonic), 'F')
check('C 关系调', circle.relative.labelZh, 'A小调')
check('C 同主音调', circle.parallel.labelZh, 'C小调')

// ── 音名解析 ────────────────────────────────────────────────────
check('解析 f#', formatNote(parseNote('f#')), 'F#')
check('解析 Bbb', formatNote(parseNote('Bbb')), 'Bbb')
check('解析 Fx', formatNote(parseNote('Fx')), 'F##')
check('解析带八度', formatNote(parseNote('C#4')), 'C#4')

// ── 练习生成器 ──────────────────────────────────────────────────
// 这里检查性质而非具体题面：题面依赖 PRNG，硬编码会让将来调整生成逻辑
// 时产生假失败，而可复现性与结构不变量才是真正需要保证的契约。

const EXERCISE_TYPES: readonly ExerciseType[] = [
  'interval-identify', 'chord-identify', 'scale-degree', 'key-signature',
]
const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5]

for (const type of EXERCISE_TYPES) {
  for (const difficulty of DIFFICULTIES) {
    // 固定 seed，保证遍历本身也是确定性的。
    const seed = 20260825 + difficulty
    let exercise
    try {
      exercise = generateExercise(type, difficulty, seed)
    } catch (error) {
      failures += 1
      console.error(`FAIL 生成 ${type} 难度 ${difficulty} 抛出异常\n  ${String(error)}`)
      continue
    }

    const label = `${type} 难度 ${difficulty}`
    check(`${label} 答案在选项中`, String(exercise.options.includes(exercise.answer)), 'true')
    check(`${label} 选项无重复`, String(new Set(exercise.options).size), String(exercise.options.length))
    check(`${label} 题干非空`, String(exercise.prompt.length > 0), 'true')
    check(`${label} 讲解非空`, String(exercise.explanation.length > 0), 'true')
    check(`${label} 回显 seed`, String(exercise.seed), String(seed))
    check(`${label} 判定正确答案`, String(gradeExercise(exercise, exercise.answer)), 'true')

    // 同一 seed 必须复现同一道题，否则练习无法重做、测试无法稳定。
    const repeated = generateExercise(type, difficulty, seed)
    check(`${label} 可复现`, JSON.stringify(repeated), JSON.stringify(exercise))
  }
}

// 不同 seed 应当产生不同题目，否则难度范围内的多样性形同虚设。
const seedA = generateExercise('interval-identify', 3, 1)
const seedB = generateExercise('interval-identify', 3, 2)
check('不同 seed 产生不同题', String(seedA.prompt !== seedB.prompt), 'true')
check('错答判定为否', String(gradeExercise(seedA, '一定不是答案')), 'false')

// ── 音频合成 ────────────────────────────────────────────────────
// 检查可测量的信号属性：频率换算、样本长度、不削波、WAV 头正确、
// 以及八度分配保持上升。声音好不好听无法自动测量，只能人耳判断。

check('A4 频率', String(Math.round(noteFrequency(parseNote('A4')))), '440')
check('A3 频率', String(Math.round(noteFrequency(parseNote('A3')))), '220')
check('C4 频率', String(Math.round(noteFrequency(parseNote('C4')) * 100) / 100), '261.63')
// 等音同高：F#4 与 Gb4 拼写不同但频率必须一致。
check(
  '等音同频',
  String(noteFrequency(parseNote('F#4')) === noteFrequency(parseNote('Gb4'))),
  'true',
)

const toneOptions = { sampleRate: 44100, durationMs: 500, amplitude: 0.8 }
const tone = renderTone(440, toneOptions)
check('单音样本数', String(tone.length), String(Math.round(44100 * 0.5)))
check('起点无爆音', String(Math.abs(tone[0] ?? 1) < 0.01), 'true')
check('终点无爆音', String(Math.abs(tone[tone.length - 1] ?? 1) < 0.01), 'true')

let tonePeak = 0
for (const sample of tone) tonePeak = Math.max(tonePeak, Math.abs(sample))
check('单音不削波', String(tonePeak <= 1), 'true')
check('单音有声', String(tonePeak > 0.1), 'true')

// 四音叠加最易削波，归一化必须生效。
const chordSamples = renderChord([261.63, 311.13, 369.99, 440], toneOptions)
let chordPeak = 0
for (const sample of chordSamples) chordPeak = Math.max(chordPeak, Math.abs(sample))
check('和弦不削波', String(chordPeak <= 1), 'true')

const sequenceSamples = renderSequence([261.63, 293.66, 329.63], toneOptions, 50)
check(
  '序列长于单音',
  String(sequenceSamples.length > tone.length * 2),
  'true',
)

// 八度分配：字母序回绕即进入下一八度，转位和弦不应挤在同一八度。
const scaleOctaves = assignOctaves(
  ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(parseNote),
  4,
).map(formatNote).join(' ')
check('音阶八度分配', scaleOctaves, 'C4 D4 E4 F4 G4 A4 B4')

const invertedOctaves = assignOctaves(['E', 'G', 'C'].map(parseNote), 4)
  .map(formatNote).join(' ')
check('转位八度分配', invertedOctaves, 'E4 G4 C5')

const explicitOctaves = assignOctaves([parseNote('G3'), parseNote('C')], 4)
  .map(formatNote).join(' ')
check('显式八度优先', explicitOctaves, 'G3 C4')

// WAV 头必须自洽，否则系统播放器会拒绝播放而不给出原因。
const wav = encodeWav(tone, 44100)
const header = readWavHeader(wav)
check('WAV 采样率', String(header.sampleRate), '44100')
check('WAV 声道', String(header.channels), '1')
check('WAV 位深', String(header.bitsPerSample), '16')
check('WAV 样本数', String(header.sampleCount), String(tone.length))
check('WAV 字节数', String(wav.length), String(44 + tone.length * 2))
check('WAV RIFF 标识', String.fromCharCode(...wav.slice(0, 4)), 'RIFF')
check('WAV WAVE 标识', String.fromCharCode(...wav.slice(8, 12)), 'WAVE')

// ── 半音移调 ────────────────────────────────────────────────────
// 音域测试逐半音步进，跨八度边界最易算错，因此这里重点覆盖边界。

const up = (note: string, semitones: number): string =>
  formatNote(transposeBySemitones(parseNote(note), semitones, 'sharp'))
const upFlat = (note: string, semitones: number): string =>
  formatNote(transposeBySemitones(parseNote(note), semitones, 'flat'))

check('C4 上行半音', up('C4', 1), 'C#4')
check('C4 上行半音（降号偏好）', upFlat('C4', 1), 'Db4')
// 跨八度边界：B4 上行必须进入第 5 八度。
check('B4 上行半音', up('B4', 1), 'C5')
check('C4 下行半音', up('C4', -1), 'B3')
check('C4 上行八度', up('C4', 12), 'C5')
check('C4 下行八度', up('C4', -12), 'C3')
check('A3 上行三半音', up('A3', 3), 'C4')
check('F5 下行五半音', up('F5', -5), 'C5')
// 等音输入应得到同一音高，拼写按偏好归一。
check('F#4 与 Gb4 移调后同高', up('F#4', 0), up('Gb4', 0))
check('移调保持音高', String(noteFrequency(parseNote(up('A4', 12)))), String(880))

// ── 记忆派生 ────────────────────────────────────────────────────
// 派生量不独立存储，因此「同样的 episodes 必然得到同样的画像」是必须保证的
// 契约。这里也验证时间衰减：旧错误不该永久压低判定。

const NOW = Date.parse('2026-08-26T00:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString()
}

function attempt(concept: string, correct: boolean, days: number, difficulty = 2): Episode {
  return {
    kind: 'exercise-attempt',
    at: daysAgo(days),
    exerciseType: 'chord-identify',
    concept,
    difficulty,
    correct,
  }
}

const emptyDerived = deriveMemory([], NOW)
check('空记忆无掌握项', String(emptyDerived.masteredConcepts.length), '0')
check('空记忆无薄弱项', String(emptyDerived.weakPoints.length), '0')
check('空记忆无水平推算', String(emptyDerived.levelEstimate === undefined), 'true')
check('空记忆渲染非空', String(renderMemory(EMPTY_PROFILE, emptyDerived).length > 0), 'true')

// 全对且样本充足 → 掌握
const masteredDerived = deriveMemory([
  attempt('大三和弦', true, 1), attempt('大三和弦', true, 2), attempt('大三和弦', true, 3),
], NOW)
check(
  '连续答对判为掌握',
  masteredDerived.masteredConcepts.map(s => s.concept).join(','),
  '大三和弦',
)
check('掌握项不出现在薄弱项', String(masteredDerived.weakPoints.length), '0')

// 多错少对 → 薄弱
const weakDerived = deriveMemory([
  attempt('减七和弦', false, 1), attempt('减七和弦', false, 2), attempt('减七和弦', true, 3),
], NOW)
check('多错判为薄弱', weakDerived.weakPoints.map(s => s.concept).join(','), '减七和弦')

// 样本不足不下结论，避免一次侥幸就算掌握
const thinDerived = deriveMemory([attempt('增三和弦', true, 1)], NOW)
check('样本不足不判掌握', String(thinDerived.masteredConcepts.length), '0')
check(
  '样本不足归入练习中',
  thinDerived.practicingConcepts.map(s => s.concept).join(','),
  '增三和弦',
)

// 时间衰减：同样的错误分布，久远的那组权重更低，因此更容易被新证据翻转。
const recentWrong = deriveMemory([attempt('音程', false, 0), attempt('音程', false, 1)], NOW)
const oldWrong = deriveMemory([attempt('音程', false, 180), attempt('音程', false, 181)], NOW)
const recentWeight = recentWrong.weakPoints[0]?.weightedAttempts ?? 0
const oldWeight = oldWrong.weakPoints[0]?.weightedAttempts ?? 0
check('近期加权高于久远', String(recentWeight > oldWeight), 'true')
check('久远记录仍保留原始次数', String(oldWrong.weakPoints[0]?.rawAttempts ?? 0), '2')

// 派生必须是纯函数：同样输入同样输出
const episodesForPurity: Episode[] = [
  attempt('纯四度', true, 1), attempt('纯四度', false, 2),
  { kind: 'concept-touched', at: daysAgo(1), tool: 'get_scale', concept: '音阶:自然大调' },
  { kind: 'track-feedback', at: daysAgo(1), trackId: 'mock-001', trackName: '晨光漫步', verdict: 'accepted' },
  { kind: 'track-feedback', at: daysAgo(2), trackId: 'mock-004', trackName: '雨巷来信', verdict: 'skipped' },
]
check(
  '派生为纯函数',
  JSON.stringify(deriveMemory(episodesForPurity, NOW)),
  JSON.stringify(deriveMemory(episodesForPurity, NOW)),
)

const feedbackDerived = deriveMemory(episodesForPurity, NOW)
check('采纳曲目', feedbackDerived.acceptedTracks.join(','), '晨光漫步')
check('跳过曲目', feedbackDerived.skippedTracks.join(','), '雨巷来信')
check('接触概念含音阶', String(feedbackDerived.touchedConcepts.includes('音阶:自然大调')), 'true')

// 渲染必须始终返回字符串：provider 返回 undefined 会让整轮对话在组装提示词时失败。
const fullProfile: MusicProfile = {
  instruments: ['voice', 'piano'],
  solfegeSystem: 'fixed-do',
  level: 'elementary',
  goals: ['能听出喜欢的歌用了什么和弦'],
  vocalRange: {
    lowest: 'A2', highest: 'F5',
    comfortableLow: 'C3', comfortableHigh: 'D5',
    measuredAt: '2026-08-20T00:00:00.000Z',
  },
  updatedAt: '2026-08-20T00:00:00.000Z',
}
const rendered = renderMemory(fullProfile, feedbackDerived)
check('渲染含乐器', String(rendered.includes('声乐') && rendered.includes('钢琴')), 'true')
check('渲染含音域', String(rendered.includes('A2') && rendered.includes('F5')), 'true')
check('渲染含唱名体系', String(rendered.includes('固定调唱名')), 'true')
check('渲染含目标', String(rendered.includes('和弦')), 'true')
check('渲染为字符串', typeof rendered, 'string')

// 未测音域且学声乐时，应主动提示去测
const voiceOnly: MusicProfile = {
  instruments: ['voice'], solfegeSystem: 'fixed-do', goals: [],
  updatedAt: '2026-08-20T00:00:00.000Z',
}
check(
  '未测音域时提示测试',
  String(renderMemory(voiceOnly, emptyDerived).includes('音域测试')),
  'true',
)

// ── 曲库（Mock）────────────────────────────────────────────────
const searchTracks = createSearchTracksTool(new MockMusicGateway())
const searchResult = await searchTracks.execute({ query: '', mood: '轻松', scene: '通勤' })
const track = searchResult.tracks[0]
check('search_tracks 工具名', searchTracks.name, 'search_tracks')
check('search_tracks 命中数', String(searchResult.total), '1')
check('search_tracks 首条', track?.id ?? '<none>', 'mock-001')
if (track !== undefined) {
  const complete = Boolean(track.name) && track.artists.length > 0 && Boolean(track.album)
    && track.durationMs > 0 && typeof track.playable === 'boolean' && Boolean(track.source)
  check('search_tracks 字段完整', String(complete), 'true')
}

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`)
}

console.log('smoke ok: all checks passed')
