import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPlans, loadOrganizeState, saveOrganizeState } from '../src/utils/organize-state.ts'
import { syncPlaylist } from '../src/utils/playlist-sync.ts'
import { getPlaylistDetailDirect, addSongsToPlaylistDirect } from '../src/api/netease-direct.ts'

const originalFetch = globalThis.fetch
const storage = new Map()
const makePlaylist = (id, name, uid = 7) => ({ id, name, creator: { userId: uid, nickname: '测试用户' }, trackCount: 0, coverImgUrl: '' })
const group = (dimension, category, ids) => ({ dimension, category, songs: ids.map((songId) => ({ songId, songName: `曲目${songId}`, artists: '歌手', source: 'ai' })) })
beforeEach(() => {
  storage.clear()
  globalThis.chrome = { storage: { local: {
    async get(key) { return { [key]: structuredClone(storage.get(key)) } },
    async set(values) { for (const [key, value] of Object.entries(values)) storage.set(key, structuredClone(value)) },
  } } }
  globalThis.document = { cookie: '' }
})
after(() => { globalThis.fetch = originalFetch; delete globalThis.chrome; delete globalThis.document })

function fakeService(initial = []) {
  const playlists = new Map(initial.map((playlist) => [playlist.id, playlist]))
  const tracks = new Map(initial.map((playlist) => [playlist.id, new Set()]))
  const calls = { creates: [], adds: [] }
  const service = {
    async getPlaylists() { return [...playlists.values()] },
    async create(name) { const id = 100 + playlists.size; playlists.set(id, makePlaylist(id, name)); tracks.set(id, new Set()); calls.creates.push(id); return id },
    async getTrackIds(id) { return [...tracks.get(id)] },
    async add(id, ids) { calls.adds.push([...ids]); ids.forEach((songId) => tracks.get(id).add(songId)) },
    async delay() {},
  }
  return { service, playlists, tracks, calls }
}

test('100 首里有 20 首重复时，只追加 80 首，新歌正常写入', async () => {
  const fixture = fakeService([makePlaylist(1, '英语歌单')])
  fixture.tracks.set(1, new Set(Array.from({ length: 20 }, (_, i) => i + 1)))
  const result = await syncPlaylist(7, { key: '英语', label: '英语', name: '英语歌单', playlistId: 1, trackIds: Array.from({ length: 100 }, (_, i) => i + 1) }, fixture.service)
  assert.equal(result.added, 80)
  assert.equal(result.existing, 20)
  assert.deepEqual(fixture.calls.adds[0], Array.from({ length: 80 }, (_, i) => i + 21))
  assert.equal(fixture.tracks.get(1).size, 100)
})

test('新建后的目标保存 ID，改名后下次仍复用同一歌单', async () => {
  const fixture = fakeService()
  const groups = [group('genre', '流行', [1, 2])]
  const [first] = createSyncPlans(groups, await loadOrganizeState(7), [])
  const result = await syncPlaylist(7, first, fixture.service)
  fixture.playlists.get(result.playlistId).name = '我改过名字的流行歌单'
  const [second] = createSyncPlans([group('genre', '流行', [2, 3])], await loadOrganizeState(7), [...fixture.playlists.values()])
  assert.equal(second.playlistId, result.playlistId)
  assert.equal(second.name, '我改过名字的流行歌单')
  const added = await syncPlaylist(7, second, fixture.service)
  assert.equal(added.added, 1)
  assert.equal(added.existing, 1)
  assert.equal(fixture.calls.creates.length, 1)
})

test('全部已存在时不调用添加接口，也不重复创建歌单', async () => {
  const fixture = fakeService([makePlaylist(1, '已有歌单')])
  fixture.tracks.set(1, new Set([1, 2]))
  const result = await syncPlaylist(7, { key: 'k', label: '分类', name: '已有歌单', trackIds: [1, 1, 2] }, fixture.service)
  assert.equal(result.added, 0)
  assert.equal(result.existing, 2)
  assert.equal(fixture.calls.adds.length, 0)
  assert.equal(fixture.calls.creates.length, 0)
})

test('写入超过 100 首时自动分批，全部核验后才算完成', async () => {
  const fixture = fakeService()
  const result = await syncPlaylist(7, { key: 'k', label: '分类', name: '批量歌单', trackIds: Array.from({ length: 251 }, (_, i) => i + 1) }, fixture.service)
  assert.deepEqual(fixture.calls.adds.map((ids) => ids.length), [100, 100, 51])
  assert.equal(result.added, 251)
})

test('API 表面成功但未实际写入时明确失败', async () => {
  const fixture = fakeService()
  fixture.service.add = async () => {}
  await assert.rejects(syncPlaylist(7, { key: 'k', label: '分类', name: '失败测试', trackIds: [1] }, fixture.service), /未能确认写入/)
  const state = await loadOrganizeState(7)
  assert.ok(state.targets.k.playlistId)
  assert.equal(Object.hasOwn(state, 'completed'), false)
})

test('添加中途失败后重试，只补写尚未成功的歌曲', async () => {
  const fixture = fakeService()
  let fail = true
  const normalAdd = fixture.service.add
  fixture.service.add = async (id, ids) => {
    if (fail) { fixture.tracks.get(id).add(ids[0]); fail = false; throw new Error('连接中断') }
    await normalAdd(id, ids)
  }
  const plan = { key: 'k', label: '分类', name: '断点测试', trackIds: [1, 2, 3] }
  await assert.rejects(syncPlaylist(7, plan, fixture.service), /连接中断/)
  const result = await syncPlaylist(7, plan, fixture.service)
  assert.equal(result.added, 2)
  assert.equal(result.existing, 1)
  assert.equal(fixture.calls.creates.length, 1)
})

test('已有旧版风格/华语/嘻哈歌单可识别并复用', () => {
  const groups = [group('language', '普通话', [1]), group('genre', '说唱', [1])]
  const plans = createSyncPlans(groups, { targets: {} }, [makePlaylist(1, '[TuneNest] 华语-语种歌单'), makePlaylist(2, '[TuneNest] 嘻哈-风格歌单')])
  assert.deepEqual(plans.map((plan) => plan.playlistId), [1, 2])
})

test('新建默认名不带 TuneNest，仍能识别并复用旧版带前缀的歌单', () => {
  const groups = [group('language', '英语', [1]), group('genre', '说唱', [1]), group('combination', '英语 · R&B', [1])]
  const fresh = createSyncPlans(groups, { targets: {} }, [])
  assert.deepEqual(fresh.map((plan) => plan.name), ['英语', '说唱', '英语 · R&B'])
  const legacy = createSyncPlans([groups[2]], { targets: {} }, [makePlaylist(20, '[TuneNest] 英语 · R&B-组合歌单')])
  assert.equal(legacy[0].playlistId, 20)
})

test('不任意选多个同名歌单，必须由用户明确目标', async () => {
  const fixture = fakeService([makePlaylist(1, '同名'), makePlaylist(2, '同名')])
  await assert.rejects(syncPlaylist(7, { key: 'k', label: '分类', name: '同名', trackIds: [1] }, fixture.service), /手动选择/)
  assert.equal(fixture.calls.creates.length, 0)
})

test('旧的已整理标记不再读取或保存，目标歌单关联仍保留并按账号隔离', async () => {
  const targets = { english: { playlistId: 1, name: '英语' } }
  storage.set('tn_organize_state_v1_7', { targets, completed: { old: [1, 2] } })
  const state = await loadOrganizeState(7)
  assert.deepEqual(state, { targets })
  assert.deepEqual(await loadOrganizeState(8), { targets: {} })
  await saveOrganizeState(7, state)
  assert.equal(Object.hasOwn(storage.get('tn_organize_state_v1_7'), 'completed'), false)
})

test('大歌单部分 tracks 已返回时，会补齐剩余 trackIds 并保持顺序', async () => {
  const raw = (id) => ({ id, name: `曲目${id}`, ar: [{ id: 1, name: '歌手' }], al: { id: 1, name: '专辑' }, dt: 200000 })
  const calls = []
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/playlist/detail')) return new Response(JSON.stringify({ code: 200, playlist: { tracks: [raw(3)], trackIds: [{ id: 3 }, { id: 1 }, { id: 2 }] }, privileges: [{ id: 3, st: 0 }] }))
    const ids = JSON.parse(new URLSearchParams(options.body).get('c')).map((item) => item.id)
    calls.push(ids)
    return new Response(JSON.stringify({ code: 200, songs: ids.map(raw) }))
  }
  assert.deepEqual((await getPlaylistDetailDirect(100)).map((song) => song.id), [3, 1, 2])
  assert.deepEqual(calls, [[1, 2]])
})

test('网易云 HTTP 200 但业务码失败时不能视为添加成功', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 401, message: '需要登录' }))
  await assert.rejects(addSongsToPlaylistDirect(1, [2]), /需要登录/)
})
