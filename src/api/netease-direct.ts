import type { Playlist, Song, Artist, Album } from '@/types'
import type { NeteasePlaylistResponse, NeteaseSongResponse } from './song-metadata.ts'
import { completePlaylistSongs, mapNeteaseSongs } from './song-metadata.ts'

const BASE_URL = 'https://music.163.com'

function getCsrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/)
  return match?.[1] || ''
}

async function req<T>(
  path: string,
  params: Record<string, string | number> = {},
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const csrf = getCsrf()
  if (csrf) params['csrf_token'] = csrf

  const url = new URL(`${BASE_URL}${path}`)
  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }

  if (method === 'POST') {
    opts.body = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString()
  } else {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }

  const res = await fetch(url.toString(), opts)
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  if (typeof data?.code === 'number' && data.code !== 200) {
    throw new Error(data.message || data.msg || `网易云接口返回错误：${data.code}`)
  }
  return data
}

export async function getLoginStatusDirect(): Promise<{ userId: number; nickname: string } | null> {
  try {
    const res = await req<Record<string, unknown>>('/api/w/nuser/account/get')
    // 尝试多种响应格式
    const profile = (res as any)?.data?.profile || (res as any)?.profile || null
    return profile
  } catch (err) {
    console.error('[Trackloom] login check error:', err)
    return null
  }
}

export async function getUserPlaylistsDirect(uid: number): Promise<Playlist[]> {
  const res = await req<{ playlist?: Playlist[] }>(
    '/api/user/playlist',
    { uid, limit: 1000, offset: 0 }
  )
  return res.playlist || []
}

export async function getPlaylistDetailDirect(id: number): Promise<Song[]> {
  const res = await req<NeteasePlaylistResponse>('/api/v6/playlist/detail', { id, n: 100000 })
  return completePlaylistSongs(res, getSongDetailsDirect)
}

export async function getSongDetailsDirect(ids: number[]): Promise<Song[]> {
  const c = JSON.stringify(ids.map((id) => ({ id })))
  const res = await req<NeteaseSongResponse>('/api/v3/song/detail', { c })
  return mapNeteaseSongs(res)
}

export async function createPlaylistDirect(name: string): Promise<number> {
  const res = await req<Record<string, any>>(
    '/api/playlist/create',
    { name, privacy: 0, type: 'NORMAL' }
  )
  const pid = res.id || res.playlist?.id
  if (!pid) {
    throw new Error(`创建歌单失败: ${res.code || res.message || JSON.stringify(res).substring(0, 100)}`)
  }
  return pid
}

export async function findPlaylistByName(
  uid: number,
  name: string
): Promise<{ id: number; trackCount: number } | null> {
  const playlists = await getUserPlaylistsDirect(uid)
  const found = playlists.find((p) => p.name === name && p.creator.userId === uid)
  return found ? { id: found.id, trackCount: found.trackCount } : null
}

export async function clearPlaylistTracks(pid: number, trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) return
  for (let i = 0; i < trackIds.length; i += 100) {
    await req('/api/playlist/manipulate/tracks', {
      op: 'del',
      pid,
      trackIds: JSON.stringify(trackIds.slice(i, i + 100)),
      imme: 'true',
    })
    if (i + 100 < trackIds.length) await new Promise((r) => setTimeout(r, 500))
  }
}

export async function getPlaylistTrackIds(pid: number): Promise<number[]> {
  const res = await req<{
    playlist?: { trackIds?: Array<{ id: number }> }
  }>('/api/v6/playlist/detail', { id: pid, n: 0 })
  if (!res.playlist?.trackIds) throw new Error('无法读取目标歌单的歌曲列表，已停止写入')
  return res.playlist.trackIds.map((track) => track.id)
}

export async function addSongsToPlaylistDirect(pid: number, trackIds: number[]): Promise<void> {
  await req('/api/playlist/manipulate/tracks', {
    op: 'add',
    pid,
    trackIds: JSON.stringify(trackIds),
    imme: 'true',
  })
}

export interface PlayRecordItem {
  playCount: number
  score: number
  song: Song
}

export async function getPlayRecordDirect(
  uid: number,
  type: 0 | 1 = 0
): Promise<PlayRecordItem[]> {
  const res = await req<Record<string, any>>(
    '/api/v1/play/record',
    { uid, type }
  )

  const rawList: Array<{ playCount: number; score: number; song: any }> =
    type === 0 ? res.allData || [] : res.weekData || []

  return rawList.map((item) => ({
    playCount: item.playCount,
    score: item.score,
    song: {
      id: item.song.id,
      name: item.song.name,
      artists: (item.song.ar || []).map((a: any): Artist => ({ id: a.id, name: a.name })),
      album: {
        id: item.song.al?.id,
        name: item.song.al?.name,
        publishTime: item.song.al?.publishTime,
      } as Album,
      duration: item.song.dt,
    },
  }))
}
