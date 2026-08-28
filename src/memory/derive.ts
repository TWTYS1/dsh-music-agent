/**
 * 从 episodes 派生画像。纯函数，无 I/O。
 *
 * 派生量不独立存储，因此不可能与事实脱同步：不会出现「记录说已掌握，
 * 但错题里全是它」这种矛盾。代价是每次读取都要重算，但本地单用户的
 * 数据量下这个成本可以忽略。
 */

import type { Episode, SkillLevel } from './types.js'

/** 权重半衰期。三个月前答错一次不应永久压低判定，但也不该完全无痕。 */
const HALF_LIFE_DAYS = 30

/**
 * 判定掌握或薄弱所需的最小尝试次数，防止一次侥幸就下结论。
 *
 * 这里用原始次数，不用加权次数。加权的目的是让近期表现主导「正确率」，
 * 而「样本够不够」跟年代无关 —— 练过三次就是练过三次。
 * 若这里也用加权，两次尝试的加权和永远小于 2，判定实际上永不生效。
 */
const MIN_ATTEMPTS = 2

const MASTERY_THRESHOLD = 0.8
const WEAKNESS_THRESHOLD = 0.5

export interface ConceptStat {
  readonly concept: string
  /** 加权正确率，0-1。 */
  readonly accuracy: number
  /** 加权尝试次数，近期尝试权重更高。 */
  readonly weightedAttempts: number
  readonly rawAttempts: number
}

export interface DerivedMemory {
  readonly masteredConcepts: readonly ConceptStat[]
  readonly weakPoints: readonly ConceptStat[]
  /** 接触过但尝试次数不足以判定的概念。 */
  readonly practicingConcepts: readonly ConceptStat[]
  readonly touchedConcepts: readonly string[]
  readonly acceptedTracks: readonly string[]
  readonly skippedTracks: readonly string[]
  readonly totalAttempts: number
  readonly overallAccuracy: number
  readonly levelEstimate?: SkillLevel
  readonly lastActivityAt?: string
}

/** 指数衰减：越久越轻，但永不为零。 */
function decayWeight(at: string, now: number): number {
  const elapsedMs = now - Date.parse(at)
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 1
  const days = elapsedMs / 86_400_000
  return 2 ** (-days / HALF_LIFE_DAYS)
}

interface Accumulator {
  weightedCorrect: number
  weightedAttempts: number
  rawAttempts: number
}

/** 由加权正确率与练习难度粗估水平，仅作起点，不覆盖用户自述。 */
function estimateLevel(
  accuracy: number,
  attempts: number,
  averageDifficulty: number,
): SkillLevel | undefined {
  if (attempts < 5) return undefined
  if (accuracy < 0.5) return 'beginner'
  if (averageDifficulty >= 4 && accuracy >= 0.75) return 'advanced'
  if (averageDifficulty >= 3 && accuracy >= 0.7) return 'intermediate'
  if (accuracy >= 0.7) return 'elementary'
  return 'beginner'
}

export function deriveMemory(
  episodes: readonly Episode[],
  now: number = Date.now(),
): DerivedMemory {
  const byConcept = new Map<string, Accumulator>()
  const touched = new Set<string>()
  const accepted: string[] = []
  const skipped: string[] = []

  let totalWeightedCorrect = 0
  let totalWeightedAttempts = 0
  let totalRawAttempts = 0
  let difficultySum = 0
  let lastActivityAt: string | undefined

  for (const episode of episodes) {
    if (lastActivityAt === undefined || episode.at > lastActivityAt) {
      lastActivityAt = episode.at
    }

    if (episode.kind === 'exercise-attempt') {
      const weight = decayWeight(episode.at, now)
      const entry = byConcept.get(episode.concept)
        ?? { weightedCorrect: 0, weightedAttempts: 0, rawAttempts: 0 }
      entry.weightedAttempts += weight
      entry.rawAttempts += 1
      if (episode.correct) entry.weightedCorrect += weight
      byConcept.set(episode.concept, entry)

      totalWeightedAttempts += weight
      totalRawAttempts += 1
      if (episode.correct) totalWeightedCorrect += weight
      difficultySum += episode.difficulty
      touched.add(episode.concept)
      continue
    }

    if (episode.kind === 'concept-touched') {
      touched.add(episode.concept)
      continue
    }

    if (episode.kind === 'track-feedback') {
      if (episode.verdict === 'accepted') accepted.push(episode.trackName)
      else if (episode.verdict === 'skipped') skipped.push(episode.trackName)
    }
  }

  const stats: ConceptStat[] = [...byConcept.entries()].map(([concept, entry]) => ({
    concept,
    accuracy: entry.weightedAttempts === 0 ? 0 : entry.weightedCorrect / entry.weightedAttempts,
    weightedAttempts: Math.round(entry.weightedAttempts * 100) / 100,
    rawAttempts: entry.rawAttempts,
  }))

  const settled = stats.filter(stat => stat.rawAttempts >= MIN_ATTEMPTS)
  const byAccuracyDesc = (a: ConceptStat, b: ConceptStat) => b.accuracy - a.accuracy
  const byAccuracyAsc = (a: ConceptStat, b: ConceptStat) => a.accuracy - b.accuracy

  const overallAccuracy = totalWeightedAttempts === 0
    ? 0
    : totalWeightedCorrect / totalWeightedAttempts
  const averageDifficulty = totalRawAttempts === 0 ? 0 : difficultySum / totalRawAttempts
  const level = estimateLevel(overallAccuracy, totalRawAttempts, averageDifficulty)

  return {
    masteredConcepts: settled.filter(s => s.accuracy >= MASTERY_THRESHOLD).sort(byAccuracyDesc),
    weakPoints: settled.filter(s => s.accuracy < WEAKNESS_THRESHOLD).sort(byAccuracyAsc),
    practicingConcepts: stats
      .filter(s => s.rawAttempts < MIN_ATTEMPTS)
      .sort(byAccuracyDesc),
    touchedConcepts: [...touched].sort(),
    // 去重并保留最近出现的顺序语义交给调用方；此处只做去重。
    acceptedTracks: [...new Set(accepted)],
    skippedTracks: [...new Set(skipped)],
    totalAttempts: totalRawAttempts,
    overallAccuracy: Math.round(overallAccuracy * 1000) / 1000,
    ...(level === undefined ? {} : { levelEstimate: level }),
    ...(lastActivityAt === undefined ? {} : { lastActivityAt }),
  }
}
