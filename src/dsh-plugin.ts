import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { deriveMemory } from './memory/derive.js'
import { renderMemory } from './memory/render.js'
import { appendEpisode, loadEpisodes, loadProfile } from './memory/store.js'
import {
  createGetMemoryTool,
  createRecordExerciseResultTool,
  createRecordTrackFeedbackTool,
  createRememberProfileTool,
} from './tools/memory.js'
import { MockMusicGateway } from './gateway/mock-music-gateway.js'
import { createSearchTracksTool } from './tools/search-tracks.js'
import { createPlayNotesTool } from './tools/audio.js'
import {
  createGenerateExerciseTool,
  createGetChordTool,
  createGetCircleOfFifthsTool,
  createGetIntervalTool,
  createGetKeySignatureTool,
  createGetScaleTool,
  createTransposeNoteTool,
} from './tools/music-theory.js'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const materializeJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

const NOTE_HINT = '音名，接受 C、F#、Bb、Ebb、Fx 等写法。'
const SCALE_MODE_HINT = '调式，接受中文或标识：大调、小调、和声小调、旋律小调、'
  + '多利亚、弗里吉亚、利底亚、混合利底亚、洛克里亚、大调五声音阶、小调五声音阶，'
  + '或 major、natural-minor、harmonic-minor、melodic-minor、dorian、phrygian、'
  + 'lydian、mixolydian、locrian、major-pentatonic、minor-pentatonic。'
const KEY_MODE_HINT = '调式，只支持大调与自然小调（major、natural-minor）。'

const searchTracksParameters = {
  query: {
    type: 'string', required: true,
    description: '搜歌关键词；用户未指定具体关键词而只给出情绪或场景时传空字符串。',
  },
  mood: { type: 'string', description: '可选情绪，例如轻松、平静、专注、活力。' },
  scene: { type: 'string', description: '可选场景，例如通勤、学习、睡前。' },
  limit: { type: 'integer', description: '最多返回数量，默认 5，范围 1 到 20。', default: 5 },
} as const satisfies ParameterSchemaSpec

const scaleParameters = {
  tonic: { type: 'string', required: true, description: `主音${NOTE_HINT}` },
  mode: { type: 'string', required: true, description: SCALE_MODE_HINT },
} as const satisfies ParameterSchemaSpec

const chordParameters = {
  root: { type: 'string', required: true, description: `根音${NOTE_HINT}` },
  quality: {
    type: 'string', required: true,
    description: '和弦品质，接受中文或标识：大三和弦、小三和弦、减三和弦、增三和弦、'
      + '大七和弦、小七和弦、属七和弦、半减七和弦、减七和弦、挂二和弦、挂四和弦，'
      + '或 major、minor、diminished、augmented、major7、minor7、dominant7、'
      + 'minor7flat5、diminished7、sus2、sus4。',
  },
  inversion: {
    type: 'integer', default: 0,
    description: '转位，0 为原位，1 为第一转位，依此类推；七和弦最大为 3。',
  },
} as const satisfies ParameterSchemaSpec

const intervalParameters = {
  from: { type: 'string', required: true, description: `起始${NOTE_HINT}` },
  to: { type: 'string', required: true, description: `目标${NOTE_HINT}` },
} as const satisfies ParameterSchemaSpec

const keyParameters = {
  tonic: { type: 'string', required: true, description: `主音${NOTE_HINT}` },
  mode: { type: 'string', required: true, description: KEY_MODE_HINT },
} as const satisfies ParameterSchemaSpec

const rememberProfileParameters = {
  instruments: {
    type: 'array', items: { type: 'string', enum: ['voice', 'piano'] },
    description: '用户所学乐器，可多个：voice 声乐、piano 钢琴。仅在用户明确说明时传。',
  },
  level: {
    type: 'string', enum: ['beginner', 'elementary', 'intermediate', 'advanced'],
    description: '水平：beginner 零基础、elementary 入门、intermediate 中级、advanced 进阶。',
  },
  solfegeSystem: {
    type: 'string', enum: ['fixed-do', 'movable-do'],
    description: '唱名体系：fixed-do 固定调（C 永远是 do）、movable-do 首调（主音是 do）。',
  },
  goals: {
    type: 'array', items: { type: 'string' },
    description: '学习目标，例如「能听出喜欢的歌用了什么和弦」。',
  },
  vocalLowest: {
    type: 'string',
    description: '声乐最低音，必须带八度，如 A2。与 vocalHighest 必须同时提供。',
  },
  vocalHighest: {
    type: 'string',
    description: '声乐最高音，必须带八度，如 F5。与 vocalLowest 必须同时提供。',
  },
  vocalComfortableLow: { type: 'string', description: '舒适音域下限，带八度，可选。' },
  vocalComfortableHigh: { type: 'string', description: '舒适音域上限，带八度，可选。' },
} as const satisfies ParameterSchemaSpec

const recordExerciseParameters = {
  exerciseType: {
    type: 'string', required: true,
    description: '题型，与 generate_exercise 的 type 一致。',
  },
  concept: {
    type: 'string', required: true,
    description: '概念标签，如「减七和弦」「增四度」「和声小调」。'
      + '同一概念必须始终用同一标签，否则掌握度无法聚合。',
  },
  difficulty: { type: 'integer', required: true, description: '难度 1 到 5。' },
  correct: { type: 'boolean', required: true, description: '用户是否答对。' },
  seed: { type: 'integer', description: '题目的 seed，便于复现该题。' },
} as const satisfies ParameterSchemaSpec

const trackFeedbackParameters = {
  trackId: { type: 'string', required: true, description: '曲目 id，来自 search_tracks。' },
  trackName: { type: 'string', required: true, description: '曲目名称。' },
  verdict: {
    type: 'string', required: true, enum: ['accepted', 'skipped', 'blocked'],
    description: 'accepted 喜欢、skipped 跳过、blocked 不想再听。',
  },
} as const satisfies ParameterSchemaSpec

const playNotesParameters = {
  notes: {
    type: 'array', required: true,
    items: { type: 'string' },
    description: '音名数组，最多 16 个，例如 ["C","E","G"] 或 ["C4","E4","G4"]。'
      + '不带八度时自动从指定八度起按上升排列。',
  },
  style: {
    type: 'string', default: 'chord',
    enum: ['chord', 'sequence', 'sequence-then-chord'],
    description: '奏法：chord 同时奏响（听和弦性质）、sequence 依次奏响（听音阶或旋律）、'
      + 'sequence-then-chord 先依次再同时（听辨练习常用）。',
  },
  bpm: {
    type: 'integer', default: 100,
    description: '依次奏响时的速度，范围 30 到 240，默认 100。',
  },
  octave: {
    type: 'integer', default: 4,
    description: '起始八度，范围 1 到 7，默认 4（C4 为中央 C）。',
  },
} as const satisfies ParameterSchemaSpec

const transposeParameters = {
  note: {
    type: 'string', required: true,
    description: `起始${NOTE_HINT}必须带八度，如 C4、A3。`,
  },
  semitones: {
    type: 'integer', required: true,
    description: '移动的半音数，正数向上、负数向下。上行一个半音传 1，下行传 -1。',
  },
  preference: {
    type: 'string', default: 'sharp', enum: ['sharp', 'flat'],
    description: '拼写偏好：sharp 用升号（C#），flat 用降号（Db）。只影响写法，不影响音高。',
  },
} as const satisfies ParameterSchemaSpec

const exerciseParameters = {
  type: {
    type: 'string', required: true,
    enum: ['interval-identify', 'chord-identify', 'scale-degree', 'key-signature'],
    description: '题型：interval-identify 音程辨识、chord-identify 和弦辨识、'
      + 'scale-degree 音阶级数、key-signature 调号辨识。',
  },
  difficulty: {
    type: 'integer', default: 1,
    description: '难度 1 到 5，默认 1。数值越高，涉及的调、音程与和弦越复杂，4 起出现转位。',
  },
  seed: {
    type: 'integer',
    description: '可选随机种子。传入相同种子会得到完全相同的题目，用于复现或重做同一题。',
  },
} as const satisfies ParameterSchemaSpec

export const name = 'dsh-music-agent'
export const inject = ['tools', 'systemPrompt']

/**
 * 记忆注入。
 *
 * 用 section + variable 而非 context()：后者会成为模型历史中的快照，
 * 进历史即可能被 compaction 压缩；段属于系统提示词，每步重新组装。
 *
 * provider 必须永远返回字符串 —— renderPrompt 对已注册但无值的引用会抛异常，
 * 那会让整轮对话在组装提示词阶段就失败。
 */
function applyMemoryInjection(ctx: Context): void {
  ctx.systemPrompt.variable('music_memory', () => {
    try {
      return renderMemory(loadProfile(), deriveMemory(loadEpisodes()))
    } catch {
      return '（用户记忆暂时不可读，请按无记忆处理，不要凭空假设。）'
    }
  })
  // order 50 落在部署 persona(0) 与工具引导(100+) 之间。
  ctx.systemPrompt.section({
    name: 'music-memory',
    order: 50,
    text: '## 用户记忆\n\n以下是关于当前用户的已知信息，用它调整教学深度、'
      + '出题方向与推荐；信息缺失时应主动了解并调用 remember_profile 记录。\n\n{{music_memory}}',
  })
}

export function apply(ctx: Context): void {
  applyMemoryInjection(ctx)

  const searchTracks = createSearchTracksTool(new MockMusicGateway())
  const getScale = createGetScaleTool()
  const getChord = createGetChordTool()
  const getInterval = createGetIntervalTool()
  const getKeySignature = createGetKeySignatureTool()
  const getCircleOfFifths = createGetCircleOfFifthsTool()
  const generateExercise = createGenerateExerciseTool()
  const playNotes = createPlayNotesTool()
  const rememberProfile = createRememberProfileTool()
  const recordExerciseResult = createRecordExerciseResultTool()
  const recordTrackFeedback = createRecordTrackFeedbackTool()
  const getMemory = createGetMemoryTool()
  const transposeNote = createTransposeNoteTool()

  /**
   * 概念接触自动记录。
   *
   * 这些调用都经过我们自己的工具，因此「用户接触过什么」是确定已知的，
   * 不需要 LLM 从对话里猜。记录失败必须静默 —— 记忆是辅助设施，
   * 不能因为写日志失败而让乐理查询本身失败。
   */
  const touchConcept = (tool: string, concept: string): void => {
    try {
      appendEpisode({ kind: 'concept-touched', at: new Date().toISOString(), tool, concept })
    } catch {
      // 忽略：记忆写入失败不应影响工具本身
    }
  }

  const renderJson = (_args: unknown, value: unknown) =>
    [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]

  ctx.tools.register(defineTool({
    name: searchTracks.name,
    description:
      '只读搜索歌曲目录。用户搜歌、找歌、按情绪或场景找歌、请求音乐推荐时必须调用本工具。'
      + '歌曲事实只能来自本工具返回结果，禁止凭记忆或常识补充。',
    parameters: searchTracksParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(await searchTracks.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: getScale.name,
    description:
      '推导音阶：返回音名序列、各级级数与功能名称，大调与自然小调另附调号。'
      + '讲解音阶、调式、级数时必须调用本工具，不得自行推算音名。',
    parameters: scaleParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => {
      const result = getScale.execute(args)
      touchConcept(getScale.name, `音阶:${String(result['modeZh'] ?? args.mode)}`)
      return materializeJson(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: getChord.name,
    description:
      '构造和弦：返回音名、音程结构、和弦符号与转位低音。'
      + '讲解和弦构成或转位时必须调用本工具，不得自行推算音名。',
    parameters: chordParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => {
      const result = getChord.execute(args)
      touchConcept(getChord.name, `和弦:${String(result['quality'] ?? args.quality)}`)
      return materializeJson(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: getInterval.name,
    description:
      '计算两音之间的音程：返回度数、性质与半音数。'
      + '注意增四度与减五度半音数相同但功能不同，必须调用本工具区分，不得凭半音数判断。',
    parameters: intervalParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => {
      const result = getInterval.execute(args)
      touchConcept(getInterval.name, `音程:${String(result['labelZh'] ?? '')}`)
      return materializeJson(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: getKeySignature.name,
    description:
      '查询调号：返回升降号数量、具体变化音名与关系调。讲解调号时必须调用本工具。',
    parameters: keyParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(getKeySignature.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: getCircleOfFifths.name,
    description:
      '查询五度圈关系：返回当前调、顺时针与逆时针相邻调、关系调与同主音调。'
      + '讲解调性关系、转调方向时必须调用本工具。',
    parameters: keyParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(getCircleOfFifths.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: playNotes.name,
    description:
      '合成并播放音符，让乐理可听。用户要求「听听看」「放一下」，或讲解和弦性质、'
      + '音阶色彩、音程距离时应调用本工具 —— 和弦的听觉特征（例如减七和弦四音等距的悬浮感）'
      + '无法用文字说清。'
      + '音名可先用 get_scale 或 get_chord 取得，再传入本工具。'
      + '用于听辨练习时，播放后不要透露音名，等用户作答。',
    parameters: playNotesParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => {
      const result = playNotes.execute(args)
      try {
        appendEpisode({
          kind: 'playback',
          at: new Date().toISOString(),
          notes: result['notes'] as string[],
          style: String(result['style'] ?? ''),
        })
      } catch {
        // 忽略：记忆写入失败不应影响播放
      }
      return materializeJson(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: transposeNote.name,
    description:
      '按半音移调，只保证音高正确、不保证功能拼写。'
      + '测试声乐音域时用它逐半音上行或下行，不要自行推算音名 —— '
      + '跨八度边界（如 B4 上行到 C5）容易算错。',
    parameters: transposeParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(transposeNote.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: rememberProfile.name,
    description:
      '记录用户档案：乐器、水平、唱名体系、学习目标、声乐音域。'
      + '用户陈述这些信息时必须调用本工具持久化，否则下次对话会遗忘。'
      + '不要替用户猜测未说明的字段。',
    parameters: rememberProfileParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(rememberProfile.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: recordExerciseResult.name,
    description:
      '记录一次已批改的练习作答。批改后必须调用本工具，掌握程度与薄弱项由这些记录派生，'
      + '不记录就等于没练过。concept 用稳定的概念标签（如「减七和弦」「增四度」），'
      + '同一概念务必使用同一标签，否则无法聚合。',
    parameters: recordExerciseParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(recordExerciseResult.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: recordTrackFeedback.name,
    description:
      '记录用户对推荐曲目的反馈（采纳、跳过、拉黑），用于对齐后续推荐。'
      + '用户明确表达喜欢或不喜欢某首歌时调用。',
    parameters: trackFeedbackParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(recordTrackFeedback.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: getMemory.name,
    description:
      '读取完整的用户记忆：档案、掌握程度、薄弱项、口味与练习统计。'
      + '系统提示词中已含摘要，只在需要完整明细（例如复盘学习进度）时调用。',
    parameters: {} as const satisfies ParameterSchemaSpec,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async () => materializeJson(getMemory.execute({})),
  }))

  ctx.tools.register(defineTool({
    name: generateExercise.name,
    description:
      '按乐理规则生成练习题，返回题干、选项、正确答案与讲解。题目由规则生成而非题库，不会重复枯竭。'
      + '出题时必须调用本工具，不得自行编题。'
      + '返回的 answer 与 explanation 供你批改使用：出题时只展示 prompt 与 options，'
      + '在用户作答后才可公布答案与讲解。',
    parameters: exerciseParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(generateExercise.execute(args)),
  }))
}
