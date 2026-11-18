import type { CategoryGroup, Playlist } from '../types/index.ts'

export interface OrganizeState {
  targets: Record<string, { playlistId: number; name: string }>
}

export interface PlaylistSyncPlan {
  key: string
  label: string
  name: string
  trackIds: number[]
  playlistId?: number
}

export type PlaylistTargetChoice = Pick<PlaylistSyncPlan, 'name' | 'playlistId'>

const stateKey = (uid: number) => `tn_organize_state_v1_${uid}`

export async function loadOrganizeState(uid: number): Promise<OrganizeState> {
  const stored = await chrome.storage.local.get(stateKey(uid))
  const value = stored[stateKey(uid)] as OrganizeState | undefined
  return { targets: value?.targets || {} }
}

export async function saveOrganizeState(uid: number, state: OrganizeState): Promise<void> {
  await chrome.storage.local.set({ [stateKey(uid)]: state })
}

export function createSyncPlans(groups: CategoryGroup[], state: OrganizeState, playlists: Playlist[]): PlaylistSyncPlan[] {
  const labels = { language: '语种', genre: '歌曲类别', combination: '组合' }
  return groups.filter((group) => group.category !== '未分类' && group.songs.length > 0).map((group) => {
    const key = JSON.stringify([group.dimension, group.category])
    const name = group.category
    const previousName = `[TuneNest] ${group.category}-${labels[group.dimension]}歌单`
    const saved = state.targets[key]
    const linked = saved && playlists.find((playlist) => playlist.id === saved.playlistId)
    const categoryNames = group.category === '普通话' ? ['普通话', '华语'] : group.category === '说唱' ? ['说唱', '嘻哈'] : [group.category]
    const legacyNames = group.dimension === 'genre' ? categoryNames.map((category) => `[TuneNest] ${category}-风格歌单`)
      : group.dimension === 'language' ? categoryNames.map((category) => `[TuneNest] ${category}-语种歌单`) : []
    const matching = playlists.filter((playlist) => [name, previousName, `${group.category}-${labels[group.dimension]}歌单`, ...legacyNames].includes(playlist.name))
    const target = linked || (matching.length === 1 ? matching[0] : undefined)
    return {
      key, label: group.category, name: target?.name || name,
      trackIds: [...new Set(group.songs.map((song) => song.songId))],
      playlistId: target?.id,
    }
  })
}
