export { apply, inject, name } from './dsh-plugin.js'

// 曲库
export type {
  MusicGateway,
  Track,
  TrackSearchQuery,
  TrackSearchResult,
} from './gateway/music-gateway.js'
export { MockMusicGateway } from './gateway/mock-music-gateway.js'
export { createSearchTracksTool } from './tools/search-tracks.js'
export type { MusicTool } from './tools/search-tracks.js'

// 乐理引擎
export type { Accidental, Letter, Note } from './theory/note.js'
export {
  formatNote,
  formatNoteZh,
  isEnharmonic,
  parseNote,
  pitchClass,
} from './theory/note.js'
export type { Interval, IntervalQuality } from './theory/interval.js'
export {
  formatInterval,
  formatIntervalZh,
  intervalBetween,
  makeInterval,
  noteFromInterval,
} from './theory/interval.js'
export type { Scale, ScaleDegree, ScaleMode } from './theory/scale.js'
export { buildScale, formatScale, SCALE_DEFINITIONS } from './theory/scale.js'
export type { Chord, ChordQuality, Inversion } from './theory/chord.js'
export { buildChord, CHORD_DEFINITIONS, formatChord } from './theory/chord.js'
export type { CircleOfFifthsView, KeyMode, KeySignature } from './theory/key.js'
export { getCircleOfFifths, getKeySignature } from './theory/key.js'
export type { Difficulty, Exercise, ExerciseType } from './theory/exercise.js'
export {
  EXERCISE_TYPE_LABELS_ZH,
  generateExercise,
  gradeExercise,
} from './theory/exercise.js'
export type { Mood, Scene } from './theory/vocabulary.js'
export {
  MOOD_VOCABULARY,
  resolveChordQuality,
  resolveKeyMode,
  resolveScaleMode,
  SCENE_VOCABULARY,
} from './theory/vocabulary.js'

// 乐理工具
export type { TheoryTool } from './tools/music-theory.js'
export {
  createGenerateExerciseTool,
  createGetChordTool,
  createGetCircleOfFifthsTool,
  createGetIntervalTool,
  createGetKeySignatureTool,
  createGetScaleTool,
} from './tools/music-theory.js'
