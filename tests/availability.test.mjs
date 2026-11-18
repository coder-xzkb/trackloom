import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mapNeteaseSong, mapNeteaseSongs, completePlaylistSongs } from '../src/api/song-metadata.ts'
import { classifySongs } from '../src/classifier/index.ts'
import { DEFAULT_SETTINGS, DIMENSION_META } from '../src/types/index.ts'

const originalFetch = globalThis.fetch
const raw = (id) => ({ id, name: `歌曲${id}`, ar: [{ id: 1, name: '歌手' }], al: { id: 1, name: '专辑' }, dt: 200000 })
beforeEach(() => {
  const values = new Map()
  globalThis.chrome = { storage: { local: {
    async get(key) { return { [key]: values.get(key) } },
    async set(data) { for (const [key, value] of Object.entries(data)) values.set(key, structuredClone(value)) },
  } } }
})
after(() => { globalThis.fetch = originalFetch; delete globalThis.chrome })

test('只根据明确下架权限标记跳过，不把会员、试听、未知状态当成下架', () => {
  assert.equal(mapNeteaseSong(raw(1), { id: 1, st: -200, pl: 0 }).availability, 'delisted')
  for (const privilege of [{ id: 1, st: 0, pl: 0, fee: 1 }, { id: 1, st: 0, pl: 0, fee: 4 }, { id: 1, pl: 0 }, { id: 1, st: -1 }, undefined]) {
    assert.equal(mapNeteaseSong(raw(1), privilege).availability, undefined)
  }
  assert.equal(mapNeteaseSong({ ...raw(1), st: -200 }).availability, undefined)
})

test('歌曲和权限按 ID 关联，权限顺序不同也不会误跳过其他歌曲', () => {
  const songs = mapNeteaseSongs({ songs: [raw(1), raw(2)], privileges: [{ id: 2, st: -200 }, { id: 1, st: 0 }] })
  assert.equal(songs[0].availability, undefined)
  assert.equal(songs[1].availability, 'delisted')
})

test('歌单缺少权限时批量补查详情，已有完整权限的不重复查询', async () => {
  const calls = []
  const songs = await completePlaylistSongs({ playlist: { tracks: [raw(1), raw(2)], trackIds: [{ id: 1 }, { id: 2 }] }, privileges: [{ id: 1, st: 0 }] }, async (ids) => {
    calls.push(ids)
    return [mapNeteaseSong(raw(2), { id: 2, st: -200 })]
  })
  assert.deepEqual(calls, [[2]])
  assert.equal(songs[1].availability, 'delisted')
})

test('下架曲目详情为空时仍保留可核对的跳过记录，不使整批读取失败', async () => {
  const songs = await completePlaylistSongs({ playlist: { tracks: [], trackIds: [{ id: 8 }] }, privileges: [{ id: 8, st: -200 }] }, async () => [])
  assert.equal(songs[0].id, 8)
  assert.equal(songs[0].availability, 'delisted')
  assert.match(songs[0].name, /8/)
})

test('分类入口也排除下架歌曲，只有正常或权限未定的歌曲会发送给 AI', async () => {
  const requests = []
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content)
    requests.push(input.map((song) => song.id))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(input.map((song) => ({ id: song.id, language: '英语' }))) } }] }))
  }
  const result = await classifySongs([
    mapNeteaseSong(raw(1), { id: 1, st: -200 }),
    mapNeteaseSong(raw(2), { id: 2, st: 0, fee: 1, pl: 0 }),
  ], { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'mock-key' } }, { language: DIMENSION_META.language.categories })
  assert.deepEqual(requests, [[2]])
  assert.deepEqual(result.map((song) => song.songId), [2])
})

test('全部下架时不请求 AI，也不要求配置 API Key', async () => {
  globalThis.fetch = async () => { throw new Error('不应请求 API') }
  assert.deepEqual(await classifySongs([mapNeteaseSong(raw(1), { id: 1, st: -200 })], DEFAULT_SETTINGS, { genre: DIMENSION_META.genre.categories }), [])
})
