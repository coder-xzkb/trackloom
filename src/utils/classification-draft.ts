import type { Song, Playlist, ClassifyResult, DimensionSelection } from '../types/index.ts'
import { DIMENSION_META, normalizeLanguage } from '../types/index.ts'

export interface ClassificationDraft {
  uid: number | null
  songs: Song[]
  availableSongs?: Song[]
  selectedPlaylists: Playlist[]
  results: ClassifyResult[]
  dimensionSelection: DimensionSelection
  combineDimensions: boolean
}

const draftKey = (uid: number) => `tn_classification_draft_v1_${uid}`

export async function saveClassificationDraft(draft: ClassificationDraft): Promise<void> {
  if (!draft.uid || draft.results.length === 0) return
  // 按账号保存，保留原始歌曲、人工修正与当前分类配置。
  const { uid, songs, availableSongs, selectedPlaylists, results, dimensionSelection, combineDimensions } = draft
  await chrome.storage.local.set({ [draftKey(uid)]: { uid, songs, ...(availableSongs ? { availableSongs } : {}), selectedPlaylists, results, dimensionSelection, combineDimensions } })
}

export async function loadClassificationDraft(uid: number): Promise<ClassificationDraft | null> {
  const stored = await chrome.storage.local.get(draftKey(uid))
  const draft = stored[draftKey(uid)] as ClassificationDraft | undefined
  if (!draft || draft.uid !== uid || !Array.isArray(draft.songs) || !Array.isArray(draft.results)
    || !Array.isArray(draft.selectedPlaylists) || !draft.dimensionSelection || draft.results.length === 0) return null
  const selection: DimensionSelection = {}
  for (const dimension of ['language', 'genre'] as const) {
    if (draft.dimensionSelection[dimension]?.length) {
      const categories = draft.dimensionSelection[dimension]!.map((category) => dimension === 'language' ? normalizeLanguage(category) : category)
      const valid = [...new Set(categories.filter((category): category is string => !!category && DIMENSION_META[dimension].categories.includes(category)))]
      selection[dimension] = valid.length ? valid : [...DIMENSION_META[dimension].categories]
    }
  }
  return { ...draft, results: draft.results.map((song) => song.language ? { ...song, language: normalizeLanguage(song.language) } : song), dimensionSelection: selection }
}

export async function clearClassificationDraft(uid: number): Promise<void> {
  await chrome.storage.local.remove(draftKey(uid))
}
