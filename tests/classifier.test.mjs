import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { classifyByRules } from '../src/classifier/rule-classifier.ts'
import { classifyByAI } from '../src/classifier/ai-classifier.ts'
import { classifySongs, groupClassifications, getPendingSongs, saveManualClassification } from '../src/classifier/index.ts'
import { DIMENSION_META, DEFAULT_SETTINGS } from '../src/types/index.ts'
import { saveClassificationDraft, loadClassificationDraft, clearClassificationDraft } from '../src/utils/classification-draft.ts'

const originalFetch = globalThis.fetch
const storage = new Map()
const requests = []
const song = (id = 1, extra = {}) => ({
  id, name: '中文译名', artists: [{ id: 10, name: '外国歌手的中文译名' }],
  album: { id: 20, name: '中文专辑译名' }, duration: 200000, ...extra,
})
const settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'test-key' }, requestDelay: 0 }
const selection = {
  language: DIMENSION_META.language.categories,
  genre: DIMENSION_META.genre.categories,
}
const classification = (songId, values = {}) => ({ songId, songName: `歌曲${songId}`, artists: '歌手', source: 'ai', ...values })
function apiResponse(items, status = 200) {
  return new Response(status === 200
    ? JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(items) } }] })
    : '服务暂不可用', { status })
}
function mockAI(items) {
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body))
    return apiResponse(typeof items === 'function' ? items(requests.at(-1)) : items)
  }
}

beforeEach(() => {
  storage.clear()
  requests.length = 0
  globalThis.chrome = { storage: { local: {
    async get(key) { return key === null ? Object.fromEntries(storage) : { [key]: structuredClone(storage.get(key)) } },
    async set(values) { for (const [key, value] of Object.entries(values)) storage.set(key, structuredClone(value)) },
    async remove(key) { for (const item of Array.isArray(key) ? key : [key]) storage.delete(item) },
  } } }
  globalThis.fetch = async () => { throw new Error('不应请求 API') }
})
after(() => { globalThis.fetch = originalFetch; delete globalThis.chrome })

test('中文译名、拉丁字母、假名和韩文均不单独锁定语种或类别', () => {
  for (const item of [song(), song(2, { name: 'Rock Party', artists: [{ id: 1, name: 'English Name' }] }),
    song(3, { name: 'こんにちは' }), song(4, { name: '안녕' })]) {
    assert.equal(classifyByRules(item).language, undefined)
    assert.equal(classifyByRules(item).genre, undefined)
  }
})

test('规则识别明确的歌曲标签和版本，冲突时保留未知', () => {
  const known = classifyByRules(song(1, { tags: [' English ', 'RnB'] }))
  assert.equal(known.language, '英语')
  assert.equal(known.genre, 'R&B')
  assert.equal(classifyByRules(song(5, { name: '同名作品（粤语版）（摇滚版）' })).language, '粤语')
  assert.equal(classifyByRules(song(5, { name: '同名作品（粤语版）（摇滚版）' })).genre, '摇滚')
  assert.equal(classifyByRules(song(6, { name: '标题 (Instrumental)' })).language, '纯音乐')
  assert.equal(classifyByRules(song(7, { name: '翻唱（粤语版）', tags: ['英语'] })).language, undefined)
  const ambiguous = classifyByRules(song(1, { tags: ['英语', '日语', 'rock', 'pop'] }))
  assert.equal(ambiguous.language, undefined)
  assert.equal(ambiguous.genre, undefined)
  assert.equal(classifyByRules(song(1, { tags: ['欧美', '华语', 'rap music collection'] })).language, undefined)
  assert.equal(classifyByRules(song(1, { tags: ['rap music collection'] })).genre, undefined)
})

test('明确标签直接完成，不产生 API 请求', async () => {
  const result = await classifySongs([song(1, { tags: ['日语', 'rock'] })], DEFAULT_SETTINGS, selection)
  assert.equal(result[0].language, '日语')
  assert.equal(result[0].genre, '摇滚')
})

test('中文译名交给 API；确定的语种保留，只补缺少的类别', async () => {
  mockAI([{ id: 1, language: '日语', genre: '流行' }, { id: 2, genre: 'R&B', language: '英语' }])
  const result = await classifySongs([song(), song(2, { tags: ['粤语'] })], settings, selection)
  assert.equal(result[0].language, '日语')
  assert.equal(result[0].source, 'ai')
  assert.equal(result[1].language, '粤语')
  assert.equal(result[1].source, 'mixed')
  const inputs = JSON.parse(requests[0].messages[1].content)
  assert.deepEqual(inputs[1].neededDimensions, ['genre'])
  assert.deepEqual(inputs[1].known, { language: '粤语' })
})

test('仅勾选普通话也允许 API 识别为日语；排除类目不进入人工池', async () => {
  mockAI([{ id: 1, language: '日语' }])
  const subset = { language: ['普通话'] }
  const result = await classifySongs([song()], settings, subset)
  assert.equal(result[0].language, '日语')
  assert.match(requests[0].messages[0].content, /日语/)
  assert.deepEqual(getPendingSongs(result, subset), [])
  assert.deepEqual(groupClassifications(result, subset), [])
  const cached = await classifySongs([song()], settings, { language: ['日语'] })
  assert.equal(cached[0].language, '日语')
  assert.equal(requests.length, 1)
})

test('旧缓存失效，新缓存可复用；元数据变化会重新判断', async () => {
  storage.set('tn_cache_classify_1', { expiry: Date.now() + 100000, data: classification(1, { language: '普通话' }) })
  mockAI([{ id: 1, language: '日语' }])
  const onlyLanguage = { language: selection.language }
  assert.equal((await classifySongs([song()], settings, onlyLanguage))[0].language, '日语')
  await classifySongs([song()], settings, onlyLanguage)
  assert.equal(requests.length, 1)
  await classifySongs([song(1, { name: '不同版本' })], settings, onlyLanguage)
  assert.equal(requests.length, 2)
})

test('已有缓存补充新维度后会写回，避免重复请求', async () => {
  mockAI([{ id: 1, language: '日语' }])
  await classifySongs([song()], settings, { language: selection.language })
  mockAI([{ id: 1, genre: '摇滚' }])
  const result = await classifySongs([song()], settings, selection)
  assert.equal(result[0].source, 'ai')
  await classifySongs([song()], settings, selection)
  assert.equal(requests.length, 2)
})

test('API 不确定时进入人工池，补齐后才进入组合歌单', async () => {
  mockAI([{ id: 1, language: '日语', genre: null }])
  const result = await classifySongs([song()], settings, selection)
  assert.deepEqual(getPendingSongs(result, selection).map((item) => item.songId), [1])
  assert.deepEqual(groupClassifications(result, selection, true), [])
  assert.deepEqual(groupClassifications(result, selection, false), [])
  const resolved = [{ ...result[0], genre: '摇滚' }]
  assert.deepEqual(getPendingSongs(resolved, selection), [])
  assert.equal(groupClassifications(resolved, selection, true)[0].category, '日语 · 摇滚')
})

test('分别分类与组合分类正确，缺少任一维度的歌曲均先待确认', () => {
  const results = [classification(1, { language: '英语', genre: 'R&B' }), classification(2, { language: '日语', genre: '摇滚' }), classification(3, { language: '英语' })]
  const combined = groupClassifications(results, selection, true)
  assert.deepEqual(combined.map((group) => group.category).sort(), ['日语 · 摇滚', '英语 · R&B'].sort())
  assert.equal(combined.flatMap((group) => group.songs).length, 2)
  assert.equal(groupClassifications(results, selection).length, 4)
  assert.equal(groupClassifications(results, { language: selection.language }, true).find((group) => group.category === '英语').songs.length, 2)
  assert.equal(groupClassifications(results, { language: ['日语'], genre: ['R&B'] }, true).length, 0)
})

test('人工修正可长期保存，重新分类不再请求 API', async () => {
  const item = song()
  await saveManualClassification(item, classification(1, { language: '日语', genre: '摇滚' }))
  const result = await classifySongs([item], DEFAULT_SETTINGS, selection)
  assert.equal(result[0].language, '日语')
  assert.equal(result[0].genre, '摇滚')
})

test('移出曲目从所有待建歌单中排除，可恢复并调整到另一组合类别', () => {
  const initial = classification(1, { language: '英语', genre: 'R&B' })
  assert.equal(groupClassifications([initial], selection, true)[0].category, '英语 · R&B')
  const removed = { ...initial, excluded: true }
  assert.deepEqual(groupClassifications([removed], selection, true), [])
  assert.deepEqual(groupClassifications([removed], selection, false), [])
  assert.deepEqual(getPendingSongs([{ ...removed, genre: undefined }], selection), [])
  const restored = { ...removed, excluded: false, language: '日语', genre: '摇滚' }
  assert.equal(groupClassifications([restored], selection, true)[0].category, '日语 · 摇滚')
  assert.deepEqual(groupClassifications([initial], selection, true)[0].songs.map((item) => item.songId), [1])
})

test('待确认池与人工修正可恢复，账号隔离，完成后可清除', async () => {
  const draft = { uid: 100, songs: [song()], selectedPlaylists: [], results: [classification(1, { language: '日语' })], dimensionSelection: selection, combineDimensions: true }
  await saveClassificationDraft(draft)
  assert.deepEqual(await loadClassificationDraft(100), draft)
  assert.equal(await loadClassificationDraft(200), null)
  const saved = await loadClassificationDraft(100)
  saved.results[0].genre = '摇滚'
  saved.results[0].excluded = true
  await saveClassificationDraft(saved)
  assert.equal(getPendingSongs((await loadClassificationDraft(100)).results, selection).length, 0)
  assert.equal((await loadClassificationDraft(100)).results[0].excluded, true)
  await clearClassificationDraft(100)
  assert.equal(await loadClassificationDraft(100), null)
})

test('API 失败不能显示成功；已成功的批次在重试时不再请求', async () => {
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    requests.push(request)
    const id = JSON.parse(request.messages[1].content)[0].id
    return id === 1 ? apiResponse([{ id: 1, language: '日语', genre: '摇滚' }]) : apiResponse(null, 503)
  }
  const progress = []
  await assert.rejects(classifySongs([song(), song(2)], { ...settings, batchSize: 1 }, selection, (item) => progress.push(item)), /AI 分类失败/)
  assert.ok(progress.every((item) => item.phase !== 'done'))
  requests.length = 0
  mockAI([{ id: 2, language: '英语', genre: 'R&B' }])
  const result = await classifySongs([song(), song(2)], settings, selection)
  assert.equal(result.length, 2)
  assert.deepEqual(JSON.parse(requests[0].messages[1].content).map((item) => item.id), [2])
})

test('API 返回未知 ID、重复 ID、遗漏歌曲或非法类目时拒绝结果', async () => {
  const inputs = [{ id: 1, name: '歌曲', artists: '歌手', album: '专辑' }]
  for (const response of [[{ id: 99, language: '英语' }], [{ id: 1, language: '英语' }, { id: 1, language: '英语' }], [], [{ id: 1, language: '火星语' }], [{ id: 1 }]]) {
    mockAI(response)
    await assert.rejects(classifyByAI(inputs, settings.ai, { language: selection.language }))
  }
})

test('没有 API 或关闭 AI 时依然分类，并将未知的歌曲交给人工确认', async () => {
  const songs = [song(1, { name: '录音（粤语版）（摇滚版）' }), song(2)]
  for (const config of [DEFAULT_SETTINGS, { ...settings, enableAI: false }]) {
    const result = await classifySongs(songs, config, selection)
    assert.equal(result[0].language, '粤语')
    assert.equal(result[0].genre, '摇滚')
    assert.deepEqual(getPendingSongs(result, selection).map((item) => item.songId), [2])
    assert.deepEqual(groupClassifications(result, selection).flatMap((group) => group.songs.map((item) => item.songId)), [1, 1])
  }
  mockAI([{ id: 2, language: '英语', genre: '流行' }])
  const result = await classifySongs(songs, settings, selection)
  assert.equal(result[1].language, '英语')
  assert.deepEqual(JSON.parse(requests[0].messages[1].content).map((item) => item.id), [2])
})

test('支持一次整理 1037 首，后台按 30 首分批并即时保存批次', async () => {
  mockAI((request) => JSON.parse(request.messages[1].content).map((item) => ({ id: item.id, language: '英语', genre: '流行' })))
  const songs = Array.from({ length: 1037 }, (_, index) => song(index + 1))
  let firstBatchSaved = false
  const result = await classifySongs(songs, settings, selection, (progress) => {
    if (progress.phase === 'ai' && progress.current === 30) firstBatchSaved = storage.has('tn_cache_classify_v3_1')
  })
  assert.equal(result.length, 1037)
  assert.equal(requests.length, 35)
  assert.ok(requests.every((request) => JSON.parse(request.messages[1].content).length <= 30))
  assert.equal(firstBatchSaved, true)
})

test('AI 已确认无法判断的维度不反复付费重试，仍在人工池中', async () => {
  mockAI([{ id: 1, language: null }])
  await classifySongs([song()], settings, { language: selection.language })
  mockAI([{ id: 1, genre: '流行' }])
  const result = await classifySongs([song()], settings, selection)
  assert.deepEqual(JSON.parse(requests[1].messages[1].content)[0].neededDimensions, ['genre'])
  await classifySongs([song()], settings, selection)
  assert.equal(requests.length, 2)
  assert.equal(getPendingSongs(result, selection).length, 1)
})

test('风格仅保留五类，旧版人工分类不锁定已移除的类别', async () => {
  assert.deepEqual(DIMENSION_META.genre.categories, ['流行', '摇滚', 'R&B', '说唱', '电子'])
  const item = song()
  await saveManualClassification(item, classification(1, { language: '英语', genre: '古典' }))
  mockAI([{ id: 1, genre: null }])
  const result = await classifySongs([item], settings, selection)
  assert.equal(result[0].genre, undefined)
  assert.equal(getPendingSongs(result, selection).length, 1)
})

test('停止分类时保留已完成批次，重新开始只请求剩余歌曲', async () => {
  const controller = new AbortController()
  mockAI([{ id: 1, language: '英语', genre: '流行' }])
  await assert.rejects(classifySongs([song(), song(2)], { ...settings, batchSize: 1 }, selection, (progress) => {
    if (progress.phase === 'ai') controller.abort()
  }, controller.signal), { name: 'AbortError' })
  assert.equal(requests.length, 1)
  assert.ok(storage.has('tn_cache_classify_v3_1'))
  requests.length = 0
  mockAI([{ id: 2, language: '日语', genre: '摇滚' }])
  assert.equal((await classifySongs([song(), song(2)], settings, selection)).length, 2)
  assert.deepEqual(JSON.parse(requests[0].messages[1].content).map((item) => item.id), [2])
})

test('停止操作会传到正在等待的 API 请求，返回后不再继续分类', async () => {
  const controller = new AbortController()
  let started
  const ready = new Promise((resolve) => { started = resolve })
  globalThis.fetch = async (_url, options) => {
    started()
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
  }
  const running = classifySongs([song()], settings, selection, undefined, controller.signal)
  const stopped = assert.rejects(running, { name: 'AbortError' })
  await ready
  controller.abort()
  await stopped
})

test('语种只保留七类，旧版具体外语标签和人工记录归到其他', async () => {
  assert.deepEqual(DIMENSION_META.language.categories, ['普通话', '粤语', '英语', '日语', '韩语', '纯音乐', '其他'])
  assert.equal(classifyByRules(song(1, { tags: ['法语'] })).language, '其他')
  await saveManualClassification(song(), classification(1, { language: '西班牙语', genre: '流行' }))
  const result = await classifySongs([song()], DEFAULT_SETTINGS, selection)
  assert.equal(result[0].language, '其他')
  assert.equal(result[0].genre, '流行')
})
