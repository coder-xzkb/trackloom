import type { Song } from '../types/index.ts'

export interface NeteasePrivilege {
  id: number
  st?: number
  pl?: number
  fee?: number
}

export interface NeteaseSong {
  id: number
  name?: string | null
  ar?: Array<{ id: number; name: string }> | null
  al?: { id: number; name: string; publishTime?: number } | null
  dt?: number
}

export interface NeteasePlaylistResponse {
  playlist?: { tracks?: NeteaseSong[]; trackIds?: Array<{ id: number }> }
  privileges?: NeteasePrivilege[]
}

export interface NeteaseSongResponse {
  songs?: NeteaseSong[]
  privileges?: NeteasePrivilege[]
}

export function mapNeteaseSong(song: NeteaseSong, privilege?: NeteasePrivilege): Song {
  return {
    id: song.id,
    name: song.name || `未知曲目（${song.id}）`,
    artists: song.ar || [],
    album: { id: song.al?.id || 0, name: song.al?.name || '未知专辑', publishTime: song.al?.publishTime },
    duration: song.dt || 0,
    // 仅使用权限对象中明确的下架状态。fee、pl=0、原始歌曲 st 都不能单独证明下架。
    availability: privilege?.st === -200 ? 'delisted' : undefined,
  }
}

export function mapNeteaseSongs(response: NeteaseSongResponse): Song[] {
  const privileges = new Map((response.privileges || []).map((item) => [item.id, item]))
  return (response.songs || []).map((song) => mapNeteaseSong(song, privileges.get(song.id)))
}

export async function completePlaylistSongs(
  response: NeteasePlaylistResponse,
  fetchDetails: (ids: number[]) => Promise<Song[]>,
): Promise<Song[]> {
  if (!response.playlist) throw new Error('未能读取歌单详情')
  const privileges = new Map((response.privileges || []).map((item) => [item.id, item]))
  const mapped = (response.playlist.tracks || []).map((song) => mapNeteaseSong(song, privileges.get(song.id)))
  const byId = new Map(mapped.map((song) => [song.id, song]))
  const orderedIds = response.playlist.trackIds?.map((track) => track.id) || mapped.map((song) => song.id)
  // 补齐大歌单的缺失详情，以及缺少的权限状态；不会逐首请求音频链接。
  const missing = orderedIds.filter((id) => !byId.has(id) || !privileges.has(id))
  for (let i = 0; i < missing.length; i += 1000) {
    for (const song of await fetchDetails(missing.slice(i, i + 1000))) byId.set(song.id, song)
    if (i + 1000 < missing.length) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  for (const id of orderedIds) {
    if (!byId.has(id) && privileges.get(id)?.st === -200) byId.set(id, mapNeteaseSong({ id }, privileges.get(id)))
  }
  return orderedIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])
}
