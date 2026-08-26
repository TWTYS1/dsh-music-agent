import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
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
export const inject = ['tools']

export function apply(ctx: Context): void {
  const searchTracks = createSearchTracksTool(new MockMusicGateway())
  const getScale = createGetScaleTool()
  const getChord = createGetChordTool()
  const getInterval = createGetIntervalTool()
  const getKeySignature = createGetKeySignatureTool()
  const getCircleOfFifths = createGetCircleOfFifthsTool()
  const generateExercise = createGenerateExerciseTool()
  const playNotes = createPlayNotesTool()

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
    execute: async args => materializeJson(getScale.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: getChord.name,
    description:
      '构造和弦：返回音名、音程结构、和弦符号与转位低音。'
      + '讲解和弦构成或转位时必须调用本工具，不得自行推算音名。',
    parameters: chordParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(getChord.execute(args)),
  }))

  ctx.tools.register(defineTool({
    name: getInterval.name,
    description:
      '计算两音之间的音程：返回度数、性质与半音数。'
      + '注意增四度与减五度半音数相同但功能不同，必须调用本工具区分，不得凭半音数判断。',
    parameters: intervalParameters,
    output: { schema: { type: 'json' }, render: renderJson },
    execute: async args => materializeJson(getInterval.execute(args)),
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
    execute: async args => materializeJson(playNotes.execute(args)),
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
