import type { Song, ClassifyResult, ClassifyDimension, DimensionSelection, CategoryGroup, Settings } from '../types/index.ts'
import { DIMENSION_META, normalizeLanguage } from '../types/index.ts'
import { classifyByRules } from './rule-classifier.ts'
import { classifyByAI } from './ai-classifier.ts'
import { getCache, setCache } from '../utils/cache.ts'

const ALL_DIMENSIONS: ClassifyDimension[] = ['language', 'genre']
const CACHE_VERSION = 'v3'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

interface CachedClassification {
  signature: string
  result: ClassifyResult
}

function songSignature(song: Song): string {
  return JSON.stringify([song.name, song.artists, song.album, [...(song.tags || [])].sort()])
}

export async function saveManualClassification(song: Song, result: ClassifyResult): Promise<void> {
  await chrome.storage.local.set({
    [`tn_manual_classification_v1_${song.id}`]: {
      signature: songSignature(song),
      values: Object.fromEntries(ALL_DIMENSIONS.filter((dimension) => result[dimension])
        .map((dimension) => [dimension, result[dimension]])),
    },
  })
}

export interface ClassifyProgress {
  phase: 'rule' | 'ai' | 'done'
  current: number
  total: number
}

export async function classifySongs(
  songs: Song[],
  settings: Settings,
  dimensionSelection: DimensionSelection,
  onProgress?: (progress: ClassifyProgress) => void,
  signal?: AbortSignal,
): Promise<ClassifyResult[]> {
  signal?.throwIfAborted()
  songs = songs.filter((song) => song.availability !== 'delisted')
  const selectedDimensions = ALL_DIMENSIONS.filter((dimension) => dimensionSelection[dimension]?.length)
  const selection: DimensionSelection = Object.fromEntries(selectedDimensions.map((dimension) => [dimension, dimensionSelection[dimension]]))
  const results = new Map<number, ClassifyResult>()
  const cacheKey = (song: Song) => `classify_${CACHE_VERSION}_${song.id}`
  const saveResults = async (subset = songs) => {
    for (const song of subset) {
      const result = results.get(song.id)
      if (result) await setCache(cacheKey(song), { signature: songSignature(song), result }, CACHE_TTL)
    }
  }

  for (let i = 0; i < songs.length; i++) {
    signal?.throwIfAborted()
    const song = songs[i]
    const cached = await getCache<CachedClassification>(cacheKey(song))
    const ruleResult = classifyByRules(song)
    results.set(song.id, cached?.signature === songSignature(song)
      ? { ...cached.result, language: ruleResult.language ?? cached.result.language, genre: ruleResult.genre ?? cached.result.genre }
      : ruleResult)
    results.get(song.id)!.language = normalizeLanguage(results.get(song.id)!.language)
    const manualKey = `tn_manual_classification_v1_${song.id}`
    const stored = await chrome.storage.local.get(manualKey)
    const manual = stored[manualKey]
    if (manual?.signature === songSignature(song)) {
      for (const dimension of ALL_DIMENSIONS) {
        const value = dimension === 'language' ? normalizeLanguage(manual.values?.[dimension]) : manual.values?.[dimension]
        if (typeof value === 'string' && DIMENSION_META[dimension].categories.includes(value)) results.get(song.id)![dimension] = value
      }
    }
    onProgress?.({ phase: 'rule', current: i + 1, total: songs.length })
  }

  const apiKey = settings.ai.apiKey.trim()
  const needsAI = settings.enableAI && apiKey ? songs.filter((song) => selectedDimensions.some((dimension) => {
    const result = results.get(song.id)!
    return !result[dimension] && !result.reviewedDimensions?.includes(dimension)
  })) : []

  const batchSize = Number.isFinite(settings.batchSize) ? Math.min(50, Math.max(1, Math.floor(settings.batchSize))) : 30
  for (let i = 0; i < needsAI.length; i += batchSize) {
    signal?.throwIfAborted()
    const batch = needsAI.slice(i, i + batchSize)
    const inputs = batch.map((song) => ({
      id: song.id, name: song.name,
      artists: song.artists.map((artist) => artist.name).join(' / '),
      album: song.album.name, tags: song.tags,
    }))
    try {
      const aiResults = await classifyByAI(inputs, { ...settings.ai, apiKey }, selection, results, signal)
      for (const [songId, aiResult] of aiResults) {
        const existing = results.get(songId)!
        const reviewed = selectedDimensions.filter((dimension) => !existing[dimension])
        const hadRules = existing.source !== 'ai' && ALL_DIMENSIONS.some((dimension) => existing[dimension])
        let supplemented = false
        for (const dimension of selectedDimensions) {
          if (!existing[dimension] && aiResult[dimension]) {
            existing[dimension] = aiResult[dimension]
            supplemented = true
          }
        }
        if (supplemented) existing.source = hadRules ? 'mixed' : 'ai'
        existing.reviewedDimensions = [...new Set([...(existing.reviewedDimensions || []), ...reviewed])]
      }
      await saveResults(batch)
    } catch (error) {
      // 保留已成功的批次，重试时不用重复请求。
      await saveResults()
      signal?.throwIfAborted()
      throw new Error(`AI 分类失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
    signal?.throwIfAborted()
    onProgress?.({ phase: 'ai', current: Math.min(i + batchSize, needsAI.length), total: needsAI.length })
    if (i + batchSize < needsAI.length) {
      const delay = Number.isFinite(settings.requestDelay) ? Math.max(0, settings.requestDelay) : 500
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // 保存完整分类，勾选的子类目仅影响当前输出，不能污染缓存。
  await saveResults()
  signal?.throwIfAborted()
  onProgress?.({ phase: 'done', current: songs.length, total: songs.length })
  return songs.map((song) => ({ ...results.get(song.id)! }))
}

export function getPendingSongs(results: ClassifyResult[], selection: DimensionSelection): ClassifyResult[] {
  const dimensions = ALL_DIMENSIONS.filter((dimension) => selection[dimension]?.length)
  return results.filter((result) => !result.excluded && dimensions.some((dimension) => !result[dimension] || !DIMENSION_META[dimension].categories.includes(result[dimension]!)))
}

export function groupByDimension(results: ClassifyResult[], dimension: ClassifyDimension): CategoryGroup[] {
  const groups = new Map<string, ClassifyResult[]>()
  for (const result of results) {
    const category = result[dimension] || '未分类'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push(result)
  }
  return Array.from(groups, ([category, songs]) => ({ dimension, category, songs }))
    .sort((a, b) => b.songs.length - a.songs.length)
}

export function groupClassifications(
  results: ClassifyResult[], selection: DimensionSelection, combineDimensions = false,
): CategoryGroup[] {
  // 待确认歌曲先进入人工池，不提前进入任何待创建歌单。
  const pendingIds = new Set(getPendingSongs(results, selection).map((song) => song.songId))
  const ready = results.filter((song) => !song.excluded && !pendingIds.has(song.songId))
  if (!combineDimensions || !selection.language?.length || !selection.genre?.length) {
    return ALL_DIMENSIONS.filter((dimension) => selection[dimension]?.length)
      .flatMap((dimension) => groupByDimension(ready, dimension)
        .filter((group) => selection[dimension]!.includes(group.category)))
  }
  const groups = new Map<string, ClassifyResult[]>()
  for (const result of ready) {
    const language = result.language && selection.language.includes(result.language) ? result.language : undefined
    const genre = result.genre && selection.genre.includes(result.genre) ? result.genre : undefined
    if (!language || !genre) continue
    const category = `${language} · ${genre}`
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push(result)
  }
  return Array.from(groups, ([category, songs]): CategoryGroup => ({ dimension: 'combination', category, songs }))
    .sort((a, b) => b.songs.length - a.songs.length)
}
