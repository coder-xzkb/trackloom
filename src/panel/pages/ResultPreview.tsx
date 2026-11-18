import { useState, useCallback } from 'react'
import type { CategoryGroup, ClassifyDimension, ClassifyResult, DimensionSelection, GroupDimension } from '@/types'
import { DIMENSION_META } from '@/types'
import { getPendingSongs } from '@/classifier'
import { ReviewPool } from './ReviewPool'

const PREVIEW_COUNT = 5

interface Props {
  grouped: CategoryGroup[]
  selection: DimensionSelection
  results: ClassifyResult[]
  onResolve: (songId: number, values: Partial<Record<ClassifyDimension, string>>) => void
  onExclude: (songId: number, excluded: boolean) => void
  onConfirm: () => void
  onBack: () => void
  onReassign?: (songId: number, dimension: ClassifyDimension, newCategory: string) => void
}

const DIMENSION_LABELS: Record<string, string> = {
  language: '语种',
  genre: '歌曲类别',
  combination: '语种 × 歌曲类别',
}

export function ResultPreview({ grouped, selection, results, onResolve, onExclude, onConfirm, onBack, onReassign }: Props) {
  const pending = getPendingSongs(results, selection)
  const includedIds = new Set(grouped.flatMap((group) => group.songs.map((song) => song.songId)))
  const removed = results.filter((song) => song.excluded)
  const excludedCount = results.length - removed.length - pending.length - includedIds.size
  const dimensions = [...new Set(grouped.map((g) => g.dimension))]
  const [editing, setEditing] = useState<{ songId: number; dim: GroupDimension } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const handleReassign = (songId: number, dim: ClassifyDimension, newCat: string) => {
    onReassign?.(songId, dim, newCat)
    setEditing(null)
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        共 {results.length} 首 · 已归类 {includedIds.size} 首 · 待确认 {pending.length} 首
        {removed.length > 0 && <span> · 已移出 {removed.length} 首</span>}
        {onReassign && <span className="text-gray-400 ml-1">（可调整类别或移出曲目）</span>}
      </p>
      <ReviewPool songs={pending} selection={selection} onResolve={onResolve} onExclude={onExclude} />
      {excludedCount > 0 && <p className="text-xs text-gray-500 mb-4">{excludedCount} 首已确定分类，但不属于勾选的类目，不会加入本次歌单。</p>}

      {dimensions.map((dim) => (
        <div key={dim} className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2 border-b border-gray-100 pb-1">
            按{DIMENSION_LABELS[dim] || dim}
          </h3>
          {grouped
            .filter((g) => g.dimension === dim)
            .map((group) => (
              <div key={`${dim}-${group.category}`} className="tn-category-card">
                <h4>
                  {group.category}
                  <span className="ml-2 text-xs text-gray-400">
                    ({group.songs.length} 首)
                  </span>
                </h4>
                {(() => {
                  const key = `${dim}-${group.category}`
                  const isExpanded = expanded.has(key)
                  const songs = isExpanded ? group.songs : group.songs.slice(0, PREVIEW_COUNT)
                  const hasMore = group.songs.length > PREVIEW_COUNT
                  return (
                    <div className={isExpanded ? 'max-h-60 overflow-y-auto' : ''}>
                      {songs.map((s) => (
                        <div key={s.songId} className="tn-song-item relative group/song">
                          {editing?.songId === s.songId && editing?.dim === dim ? (
                            <div className="flex flex-wrap items-center gap-1 py-0.5">
                              <span className="text-xs text-gray-500 truncate max-w-[100px]">{s.songName}</span>
                              <span className="text-xs text-gray-400">→</span>
                              {(dim === 'combination' ? ['language', 'genre'] as const : [dim]).map((field) => (
                                <select
                                  key={field}
                                  aria-label={`修改${DIMENSION_META[field].label}`}
                                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                  value={s[field] || ''}
                                  onChange={(event) => handleReassign(s.songId, field, event.target.value)}
                                >
                                  <option value="" disabled>选择{DIMENSION_META[field].label}</option>
                                  {(selection[field] || []).map((category) => (
                                    <option key={category} value={category}>{category}</option>
                                  ))}
                                </select>
                              ))}
                              <button className="text-xs text-gray-400" onClick={() => setEditing(null)}>收起</button>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-gray-800">{s.songName} - {s.artists}</p>
                              <div className="flex gap-3 mt-1">
                                {onReassign && <button className="text-xs text-primary hover:underline" onClick={() => setEditing({ songId: s.songId, dim })}>调整类别</button>}
                                <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => onExclude(s.songId, true)}>移出本次分类</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {hasMore && (
                        <button
                          className="text-xs text-primary hover:underline mt-1 pb-1"
                          onClick={() => toggleExpand(key)}
                        >
                          {isExpanded ? '收起' : `展开全部 ${group.songs.length} 首`}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
        </div>
      ))}

      {removed.length > 0 && (
        <details className="text-xs text-gray-500 border border-gray-200 rounded-lg p-3 mb-4">
          <summary className="cursor-pointer">已移出 {removed.length} 首，可恢复</summary>
          <p className="mt-2">移出只影响本次分类，原歌单里的歌曲保留。</p>
          <div className="space-y-2 mt-3 max-h-48 overflow-y-auto">
            {removed.map((song) => (
              <div key={song.songId} className="flex items-start justify-between gap-2">
                <span>{song.songName} - {song.artists}</span>
                <button className="text-primary flex-shrink-0" onClick={() => onExclude(song.songId, false)}>恢复</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex gap-3 mt-4 sticky bottom-0 bg-white py-3">
        <button className="tn-btn tn-btn-secondary flex-1" onClick={onBack}>
          上一步
        </button>
        <button className="tn-btn tn-btn-primary flex-1" onClick={onConfirm} disabled={pending.length > 0 || grouped.length === 0}>
          {pending.length > 0 ? `还有 ${pending.length} 首待确认` : '选择目标歌单'}
        </button>
      </div>
    </div>
  )
}
