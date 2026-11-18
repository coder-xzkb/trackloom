import { useEffect, useState } from 'react'
import type { CategoryGroup, Playlist } from '@/types'
import { getUserPlaylistsDirect } from '@/api/netease-direct'
import { createSyncPlans, loadOrganizeState } from '@/utils/organize-state'
import type { PlaylistSyncPlan, PlaylistTargetChoice } from '@/utils/organize-state'
import { syncPlaylist } from '@/utils/playlist-sync'

interface Props {
  uid: number
  grouped: CategoryGroup[]
  initialChoices: Record<string, PlaylistTargetChoice>
  onChoicesChange: (choices: Record<string, PlaylistTargetChoice>) => void
  onRunningChange: (running: boolean) => void
  onBack: () => void
  onDone: () => void
}

interface Task extends PlaylistSyncPlan {
  status: 'pending' | 'running' | 'done' | 'error'
  added?: number
  existing?: number
  error?: string
}

export function CreateConfirm({ uid, grouped, initialChoices, onChoicesChange, onRunningChange, onBack, onDone }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [checking, setChecking] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const load = async () => {
    setChecking(true)
    setLoadError(null)
    try {
      const [state, list] = await Promise.all([loadOrganizeState(uid), getUserPlaylistsDirect(uid)])
      const owned = list.filter((playlist) => playlist.creator.userId === uid)
      setPlaylists(owned)
      setTasks(createSyncPlans(grouped, state, owned).map((plan) => {
        const choice = initialChoices[plan.key]
        const valid = choice && (!choice.playlistId || owned.some((playlist) => playlist.id === choice.playlistId))
        return { ...plan, ...(valid ? choice : {}), status: 'pending' }
      }))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法读取目标歌单，请重试')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => () => onRunningChange(false), [onRunningChange])

  const saveChoices = (updated: Task[]) => onChoicesChange(Object.fromEntries(updated.map((task) => [task.key, { name: task.name, playlistId: task.playlistId }])))
  const updateTask = (index: number, values: Partial<Task>) => {
    const updated = tasks.map((task, i) => i === index ? { ...task, ...values } : task)
    setTasks(updated)
    saveChoices(updated)
  }

  const run = async () => {
    if (running) return
    setRunning(true)
    onRunningChange(true)
    const updated = tasks.map((task) => ({ ...task }))
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'done') continue
      updated[i].status = 'running'
      updated[i].error = undefined
      setTasks(updated.map((task) => ({ ...task })))
      try {
        const result = await syncPlaylist(uid, updated[i])
        Object.assign(updated[i], result, { status: 'done' })
        saveChoices(updated)
        setPlaylists((previous) => previous.some((playlist) => playlist.id === result.playlistId) ? previous : [...previous, {
          id: result.playlistId, name: result.name, trackCount: updated[i].trackIds.length,
          coverImgUrl: '', creator: { userId: uid, nickname: '' },
        }])
      } catch (error) {
        updated[i].status = 'error'
        updated[i].error = error instanceof Error ? error.message : '未知错误'
      }
      setTasks(updated.map((task) => ({ ...task })))
      if (i + 1 < updated.length) await new Promise((resolve) => setTimeout(resolve, 800))
    }
    setRunning(false)
    onRunningChange(false)
  }

  if (checking) return <div className="py-12 text-center"><p className="text-sm text-gray-500">读取已有歌单和分类关联...</p><button className="tn-btn tn-btn-secondary mt-4" onClick={onBack}>上一步</button></div>
  if (loadError) return <div className="text-sm text-center py-10"><p className="text-red-600 mb-3">{loadError}</p><button className="tn-btn tn-btn-secondary mr-2" onClick={onBack}>上一步</button><button className="tn-btn tn-btn-primary" onClick={load}>重新读取</button></div>
  const done = tasks.filter((task) => task.status === 'done').length
  const allDone = tasks.length > 0 && done === tasks.length

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 mb-2">确认目标歌单</h3>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        已关联的分类会继续追加到原歌单。你也可以选择自己创建的其他歌单；仅添加缺少的歌曲，已有曲目保留。
        新建时如果发现唯一同名歌单，会直接复用。
      </p>
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div key={task.key} className={`rounded-xl border p-3 ${task.status === 'error' ? 'border-red-200 bg-red-50' : task.status === 'done' ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
            <p className="text-sm font-semibold text-gray-800">{task.status === 'done' ? '✓ ' : ''}{task.label} · {task.trackIds.length} 首</p>
            <label className="block text-xs text-gray-500 mt-2">
              目标歌单
              <select
                aria-label={`${task.label}的目标歌单`}
                className="block mt-1 w-full border border-gray-200 bg-white rounded-lg px-2 py-2 text-sm"
                value={task.playlistId || ''}
                disabled={running || task.status === 'done'}
                onChange={(event) => {
                  const playlistId = Number(event.target.value) || undefined
                  const target = playlists.find((playlist) => playlist.id === playlistId)
                  updateTask(index, { playlistId, ...(target ? { name: target.name } : {}), status: 'pending', error: undefined })
                }}
              >
                <option value="">新建歌单</option>
                {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </label>
            {!task.playlistId && <input aria-label={`${task.label}的新歌单名`} value={task.name} disabled={running} onChange={(event) => updateTask(index, { name: event.target.value })} className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-2 py-2" />}
            {task.status === 'running' && <p className="text-xs text-primary mt-2">正在核对并追加歌曲...</p>}
            {task.status === 'done' && <p className="text-xs text-green-700 mt-2">新增 {task.added} 首 · 已存在 {task.existing} 首已跳过</p>}
            {task.error && <p className="text-xs text-red-600 mt-2">{task.error}</p>}
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 bg-white py-3 mt-3">
        <button className="tn-btn tn-btn-secondary w-full mb-3" disabled={running} onClick={onBack}>上一步</button>
        {running && <p className="text-xs text-gray-400 text-center mb-2">正在写入歌单，结束后可返回。</p>}
        {!running && done > 0 && <p className="text-xs text-gray-400 text-center mb-2">返回不会撤销已经写入的歌曲。</p>}
        {running ? <p className="text-sm text-gray-500 text-center">正在整理目标歌单（{done}/{tasks.length}）</p> : allDone ? (
          <div className="text-center"><p className="text-sm text-green-700 mb-3">全部写入完成！</p><button className="tn-btn tn-btn-primary w-full" onClick={onDone}>完成</button></div>
        ) : <button className="tn-btn tn-btn-primary w-full" disabled={tasks.length === 0 || tasks.some((task) => !task.name.trim())} onClick={run}>{tasks.some((task) => task.status === 'error') ? '重试未完成的歌单' : `开始整理（${tasks.length} 个目标歌单）`}</button>}
      </div>
    </div>
  )
}
