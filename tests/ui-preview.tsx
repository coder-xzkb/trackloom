// 仅供本地界面验证；此文件不是扩展构建入口，所有接口均为模拟响应。
import ReactDOM from 'react-dom/client'
import { PanelApp } from '../src/panel/App'
import { classifySongs, groupClassifications } from '../src/classifier'
import { ClassificationJobs } from '../src/utils/classification-jobs'
import '../src/styles/panel.css'

import { configureAI, getSettings, toSettingsView } from '../src/utils/ai-settings'
import type { AISettingsInput } from '../src/types'
import { OptionsApp } from '../src/options/OptionsApp'
const legacySettings = { enableAI: true, deepseekApiKey: 'mock-key', batchSize: 30, requestDelay: 0 }
const handlers = new Set<(message: unknown) => void>()
const jobs = new ClassificationJobs()
let slowUsed = false
const tracks = [
  { id: 1, name: '英语 R&B 测试曲', ar: [{ id: 1, name: '测试歌手一' }], al: { id: 1, name: '测试专辑' }, dt: 200000 },
  { id: 2, name: '日语摇滚测试曲', ar: [{ id: 2, name: '测试歌手二' }], al: { id: 2, name: '测试专辑' }, dt: 200000 },
  { id: 3, name: '类别待确认测试曲', ar: [{ id: 3, name: '测试歌手三' }], al: { id: 3, name: '测试专辑' }, dt: 200000 },
  { id: 4, name: '两项待确认测试曲', ar: [{ id: 4, name: '测试歌手四' }], al: { id: 4, name: '测试专辑' }, dt: 200000 },
  { id: 5, name: '英语 R&B 新收藏测试曲', ar: [{ id: 5, name: '测试歌手五' }], al: { id: 5, name: '新收藏专辑' }, dt: 200000 },
  { id: 6, name: '已下架灰色测试曲', ar: [{ id: 6, name: '测试歌手六' }], al: { id: 6, name: '测试专辑' }, dt: 200000 },
  { id: 7, name: 'VIP 权限测试曲', ar: [{ id: 7, name: '测试歌手七' }], al: { id: 7, name: '测试专辑' }, dt: 200000 },
]
const fixtureSize = Math.min(2000, Math.max(0, Math.floor(Number(new URLSearchParams(location.search).get('size')) || 0)))
if (fixtureSize > 0) {
  tracks.splice(0, tracks.length, ...Array.from({ length: fixtureSize }, (_, index) => ({
    id: index + 1, name: `测试曲目 ${String(index + 1).padStart(4, '0')}`,
    ar: [{ id: 1, name: '批量测试歌手' }], al: { id: 1, name: '批量测试专辑' }, dt: 200000,
  })))
}
const prefix = `tn_ui_fixture_${new URLSearchParams(location.search).get('run') || 'default'}_`
const backendKey = prefix + 'backend'
const initialBackend = {
  nextId: 200,
  playlists: [
    { id: 100, name: '我喜欢的音乐（模拟）', creator: { userId: 999, nickname: '测试账号' }, coverImgUrl: '' },
    { id: 101, name: '收藏的他人歌单（模拟）', creator: { userId: 888, nickname: '他人' }, coverImgUrl: '' },
  ],
  members: { 100: fixtureSize > 0 ? tracks.map((track) => track.id) : [1, 2, 3, 4, 6, 7], 101: [2, 4] } as Record<number, number[]>,
}
const readBackend = (): typeof initialBackend => JSON.parse(localStorage.getItem(backendKey) || JSON.stringify(initialBackend))
const saveBackend = (data: typeof initialBackend) => localStorage.setItem(backendKey, JSON.stringify(data))
const privileges = (ids: number[]) => ids.map((id) => ({ id, st: id === 6 ? -200 : 0, pl: id === 6 || id === 7 ? 0 : 320000, fee: id === 7 ? 1 : 0 }))
document.getElementById('add-mock-song')!.addEventListener('click', () => {
  const data = readBackend()
  data.members[100] = [...new Set([...data.members[100], 5])]
  saveBackend(data)
  document.getElementById('add-mock-song')!.textContent = '已添加模拟新收藏，来源歌单现在有 5 首'
})
const local = {
  async get(key: string) { return { [key]: JSON.parse(localStorage.getItem(prefix + key) || 'null') } },
  async set(values: Record<string, unknown>) { for (const [key, value] of Object.entries(values)) localStorage.setItem(prefix + key, JSON.stringify(value)) },
  async remove(key: string | string[]) { for (const item of Array.isArray(key) ? key : [key]) localStorage.removeItem(prefix + item) },
}
Object.assign(window, { chrome: {
  storage: { local, sync: { async get() { return { settings: legacySettings } } } },
  permissions: { async request() { return true } },
  runtime: {
    getManifest: () => ({ version: '0.1.0' }),
    getURL: (path: string) => path === 'src/options/index.html' ? '/tests/ui-preview.html?settings=1' : '/' + path.replace(/^public\//, ''),
    onMessage: { addListener: (handler: (message: unknown) => void) => handlers.add(handler), removeListener: (handler: (message: unknown) => void) => handlers.delete(handler) },
    async sendMessage(message: { action: string; data: any }) {
      if (message.action === 'GET_AI_SETTINGS') return { success: true, data: toSettingsView(await getSettings()) }
      if (message.action === 'SAVE_AI_SETTINGS' || message.action === 'TEST_AI_CONNECTION') {
        try {
          return { success: true, data: await configureAI(message.data as AISettingsInput, message.action === 'TEST_AI_CONNECTION') }
        } catch (error) { return { success: false, error: String(error) } }
      }
      if (message.action === 'CANCEL_CLASSIFICATION') return { success: true, data: { cancelled: jobs.cancel('preview', message.data.requestId) } }
      if (message.action !== 'CLASSIFY_SONGS') return { success: true }
      try {
        const settings = await getSettings()
        const results = await jobs.run('preview', message.data.requestId, (signal) => classifySongs(message.data.songs, settings, message.data.dimensionSelection,
          (data) => handlers.forEach((handler) => handler({ action: 'CLASSIFY_PROGRESS', data: { ...data, requestId: message.data.requestId } })), signal))
        return { success: true, data: { results, grouped: groupClassifications(results, message.data.dimensionSelection, message.data.combineDimensions) } }
      } catch (error) { return { success: false, error: String(error) } }
    },
  },
} })

window.fetch = async (input, options) => {
  const url = String(input)
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
  if (url.includes('api.github.com')) return json({ tag_name: 'v0.1.0' })
  if (url.endsWith('/chat/completions')) {
    const request = JSON.parse(options!.body as string)
    if (request.messages.length === 1) return json({ choices: [{ message: { content: 'OK' } }] })
    if (new URLSearchParams(location.search).get('slow') && !slowUsed) {
      slowUsed = true
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 10000)
        options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal!.reason) }, { once: true })
      })
    }
    const songs = JSON.parse(request.messages[1].content)
    return json({ choices: [{ message: { content: JSON.stringify(songs.map((song: { id: number }) => ({
      id: song.id,
      language: song.id === 1 || song.id === 5 ? '英语' : song.id === 4 ? null : '日语',
      genre: song.id === 1 || song.id === 5 ? 'R&B' : song.id === 2 ? '摇滚' : null,
    }))) } }] })
  }
  if (url.includes('/api/w/nuser/account/get')) return json({ data: { profile: { userId: 999, nickname: '测试账号' } } })
  const data = readBackend()
  const params = new URLSearchParams(options?.body as string || '')
  if (url.includes('/api/user/playlist')) return json({ code: 200, playlist: data.playlists.map((playlist) => ({ ...playlist, trackCount: data.members[playlist.id]?.length || 0 })) })
  if (url.includes('/api/v6/playlist/detail')) {
    const ids = data.members[Number(params.get('id'))]
    return ids ? json({ code: 200, playlist: { tracks: ids.flatMap((id) => tracks.filter((track) => track.id === id)), trackIds: ids.map((id) => ({ id })) }, privileges: privileges(ids) }) : json({ code: 404, message: '歌单不存在' })
  }
  if (url.includes('/api/v3/song/detail')) {
    const ids = JSON.parse(params.get('c')!).map((item: {id: number}) => item.id)
    return json({ code: 200, songs: ids.flatMap((id: number) => tracks.filter((track) => track.id === id)), privileges: privileges(ids) })
  }
  if (url.includes('/api/playlist/create')) {
    const id = data.nextId++
    data.playlists.push({ id, name: params.get('name')!, creator: { userId: 999, nickname: '测试账号' }, coverImgUrl: '' })
    data.members[id] = []
    saveBackend(data)
    return json({ code: 200, id })
  }
  if (url.includes('/api/playlist/manipulate/tracks')) {
    const pid = Number(params.get('pid'))
    const ids: number[] = JSON.parse(params.get('trackIds')!)
    data.members[pid] = [...new Set([...data.members[pid], ...ids])]
    saveBackend(data)
    return json({ code: 200 })
  }
  throw new Error(`测试页面禁止访问未模拟的接口：${url}`)
}

const root = document.getElementById('root')!
const embedded = new URLSearchParams(location.search).has('settings')
ReactDOM.createRoot(root).render(embedded ? <OptionsApp embedded /> : <PanelApp />)
if (embedded) {
  document.querySelector('body > p')?.remove()
  document.getElementById('add-mock-song')?.remove()
  document.body.style.background = 'white'
  new ResizeObserver(() => {
    window.parent.postMessage({ type: 'trackloom-settings-height', height: Math.ceil(root.getBoundingClientRect().height) }, location.origin)
  }).observe(root)
}
