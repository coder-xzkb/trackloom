import { useEffect, useMemo, useState } from 'react'
import type { Song } from '@/types'

interface Props {
  songs: Song[]
  initialIds?: number[]
  onSelectionChange: (songs: Song[]) => void
  onConfirm: (songs: Song[]) => void
  onBack: () => void
}

export function TrackSelect({ songs, initialIds, onSelectionChange, onConfirm, onBack }: Props) {
  const delisted = useMemo(() => songs.filter((song) => song.availability === 'delisted'), [songs])
  const eligible = useMemo(() => songs.filter((song) => song.availability !== 'delisted'), [songs])
  const [selected, setSelected] = useState<Set<number>>(() => {
    const eligibleIds = new Set(eligible.map((song) => song.id))
    return new Set(initialIds !== undefined ? initialIds.filter((id) => eligibleIds.has(id)) : eligible.slice(0, 100).map((song) => song.id))
  })
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(initialIds === undefined ? '100' : '')
  const [selectionMode, setSelectionMode] = useState<'count' | 'all' | 'manual'>(initialIds === undefined ? 'count' : 'manual')
  const [page, setPage] = useState(0)

  useEffect(() => {
    onSelectionChange(eligible.filter((song) => selected.has(song.id)))
  }, [])

  const filtered = useMemo(() => eligible.filter((song) => {
    const text = `${song.name} ${song.artists.map((artist) => artist.name).join(' ')} ${song.album.name}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }), [eligible, query])
  const shown = filtered.slice(page * 50, (page + 1) * 50)

  const setSelection = (ids: Iterable<number>) => {
    const next = new Set(ids)
    setSelected(next)
    onSelectionChange(eligible.filter((song) => next.has(song.id)))
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelection(next)
    setCount('')
    setSelectionMode('manual')
  }

  const selectCount = (value: string) => {
    setCount(value)
    setSelectionMode('count')
    const amount = Number(value)
    const valid = value.trim() !== '' && Number.isSafeInteger(amount) && amount > 0
    setSelection((valid ? filtered.slice(0, amount) : []).map((song) => song.id))
    setPage(0)
  }
  const validCount = count.trim() !== '' && Number.isSafeInteger(Number(count)) && Number(count) > 0

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 mb-2">选择本次整理的曲目</h3>
      <p className="text-xs text-gray-500 mb-3">已读取 {songs.length} 首 · 可选择 {eligible.length} 首</p>
      {delisted.length > 0 && <details className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
        <summary className="cursor-pointer">已自动跳过 {delisted.length} 首灰色下架曲目</summary>
        <p className="mt-2">这些歌曲不会发送给 AI，也不会加入目标歌单。</p>
        <div className="mt-2 max-h-36 overflow-y-auto space-y-1">{delisted.map((song) => <p key={song.id}>{song.name}{song.artists.length > 0 ? ` - ${song.artists.map((artist) => artist.name).join(' / ')}` : ''}</p>)}</div>
      </details>}
      <input aria-label="搜索曲目" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" placeholder="搜索歌名、歌手、专辑" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); setCount(''); setSelectionMode('manual') }} />
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          选择前
          <input
            aria-label="本次批量选曲数量"
            aria-describedby="tn-selection-count-hint"
            aria-invalid={selectionMode === 'count' && !validCount}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="输入数量"
            value={count}
            onChange={(event) => selectCount(event.target.value)}
            className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          首
        </label>
        <button className="text-xs text-gray-500 ml-auto" onClick={() => { setSelection([]); setCount(''); setSelectionMode('manual') }}>清空勾选</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <span className="text-gray-400">快捷选择</span>
        {[50, 100, 200].map((amount) => <button key={amount} className="text-primary border border-gray-200 rounded px-2 py-1" onClick={() => selectCount(String(amount))}>{amount} 首</button>)}
        <button className="text-primary border border-gray-200 rounded px-2 py-1" onClick={() => { setCount(''); setSelectionMode('all'); setSelection(filtered.map((song) => song.id)); setPage(0) }}>全部</button>
      </div>
      <p id="tn-selection-count-hint" className={`text-xs mb-2 ${selectionMode === 'count' && !validCount ? 'text-red-600' : 'text-gray-400'}`}>
        {selectionMode === 'count' && !validCount
          ? '请输入大于 0 的整数。'
          : selectionMode === 'count' && Number(count) > filtered.length
          ? `当前筛选结果只有 ${filtered.length} 首，已全部选中。`
          : selectionMode === 'all'
          ? '已选择当前筛选结果的全部歌曲。'
          : selectionMode === 'manual'
          ? '可手动勾选，或输入数量重新选择当前筛选结果的前几首。'
          : '输入数量会立即更新勾选，不包含已下架曲目，也可手动增减。'}
      </p>
      <p className="text-xs text-gray-400 mb-2">筛选结果 {filtered.length} 首 · 已勾选 {selected.size} 首（含其他页及当前筛选之外的勾选）</p>
      <div className="max-h-[360px] overflow-y-auto space-y-1 border-y border-gray-100 py-1">
        {shown.map((song) => (
          <label key={song.id} className="tn-checkbox-item items-start">
            <input type="checkbox" checked={selected.has(song.id)} onChange={() => toggle(song.id)} className="accent-primary mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 break-words">{song.name}</p>
              <p className="text-xs text-gray-500 break-words">{song.artists.map((artist) => artist.name).join(' / ')} · {song.album.name}</p>
              <p className="text-xs text-gray-400">{Math.floor(song.duration / 60000)}:{String(Math.floor(song.duration / 1000) % 60).padStart(2, '0')}</p>
            </div>
          </label>
        ))}
        {filtered.length === 0 && <p className="text-xs text-gray-500 py-6 text-center">当前没有符合条件的歌曲，可调整搜索条件。</p>}
      </div>
      {filtered.length > 50 && <div className="flex justify-between text-xs text-gray-500 mt-2"><button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(filtered.length / 50)}</span><button disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>下一页</button></div>}
      <p className="text-xs text-gray-400 mt-3">支持一次选中全部歌曲。后台按小批次连续处理，成功批次会保存，不必手动分批。</p>
      <div className="flex gap-3 sticky bottom-0 bg-white py-3 mt-3">
        <button className="tn-btn tn-btn-secondary flex-1" onClick={onBack}>上一步</button>
        <button className="tn-btn tn-btn-primary flex-1" disabled={selected.size === 0 || (selectionMode === 'count' && !validCount)} onClick={() => onConfirm(eligible.filter((song) => selected.has(song.id)))}>整理所选 {selected.size} 首</button>
      </div>
    </div>
  )
}
