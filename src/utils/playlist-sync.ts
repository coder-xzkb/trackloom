import type { Playlist } from '../types/index.ts'
import type { PlaylistSyncPlan } from './organize-state.ts'
import { loadOrganizeState, saveOrganizeState } from './organize-state.ts'
import { getUserPlaylistsDirect, createPlaylistDirect, getPlaylistTrackIds, addSongsToPlaylistDirect } from '../api/netease-direct.ts'

interface PlaylistService {
  getPlaylists(uid: number): Promise<Playlist[]>
  create(name: string): Promise<number>
  getTrackIds(pid: number): Promise<number[]>
  add(pid: number, ids: number[]): Promise<void>
  delay(ms: number): Promise<void>
}

const defaultService: PlaylistService = {
  getPlaylists: getUserPlaylistsDirect, create: createPlaylistDirect,
  getTrackIds: getPlaylistTrackIds, add: addSongsToPlaylistDirect,
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export async function syncPlaylist(
  uid: number, plan: PlaylistSyncPlan, service: PlaylistService = defaultService,
): Promise<{ playlistId: number; name: string; added: number; existing: number }> {
  let playlistId = plan.playlistId
  let name = plan.name.trim()
  if (!name) throw new Error('歌单名不能为空')
  if (!playlistId) {
    // 创建响应丢失或重试时先重新查询，避免重复创建同名歌单。
    const matching = (await service.getPlaylists(uid)).filter((playlist) => playlist.creator.userId === uid && playlist.name === name)
    if (matching.length > 1) throw new Error('存在多个同名歌单，请手动选择目标歌单')
    playlistId = matching[0]?.id || await service.create(name)
  } else {
    const owned = (await service.getPlaylists(uid)).find((playlist) => playlist.id === playlistId && playlist.creator.userId === uid)
    if (!owned) throw new Error('目标歌单不存在或不是你创建的，请重新选择')
    name = owned.name
  }

  const state = await loadOrganizeState(uid)
  state.targets[plan.key] = { playlistId, name }
  await saveOrganizeState(uid, state)

  const existing = new Set(await service.getTrackIds(playlistId))
  const wanted = [...new Set(plan.trackIds)]
  const missing = wanted.filter((id) => !existing.has(id))
  for (let i = 0; i < missing.length; i += 100) {
    await service.add(playlistId, missing.slice(i, i + 100))
    if (i + 100 < missing.length) await service.delay(800)
  }
  const verified = missing.length > 0 ? new Set(await service.getTrackIds(playlistId)) : existing
  const absent = wanted.filter((id) => !verified.has(id))
  if (absent.length > 0) throw new Error(`${absent.length} 首歌曲未能确认写入，可重试；已存在的歌曲会跳过`)
  return { playlistId, name, added: missing.length, existing: wanted.length - missing.length }
}
