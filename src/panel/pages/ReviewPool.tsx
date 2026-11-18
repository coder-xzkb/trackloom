import { useState } from 'react'
import type { ClassifyDimension, ClassifyResult, DimensionSelection } from '@/types'
import { DIMENSION_META } from '@/types'

interface Props {
  songs: ClassifyResult[]
  selection: DimensionSelection
  onResolve: (songId: number, values: Partial<Record<ClassifyDimension, string>>) => void
  onExclude: (songId: number, excluded: boolean) => void
}

export function ReviewPool({ songs, selection, onResolve, onExclude }: Props) {
  const [edits, setEdits] = useState<Record<number, Partial<Record<ClassifyDimension, string>>>>({})
  const dimensions = (Object.keys(selection) as ClassifyDimension[]).filter((dimension) => selection[dimension]?.length)
  if (songs.length === 0) return null

  return (
    <div className="mb-5 border border-amber-200 rounded-xl bg-amber-50 p-3">
      <h3 className="text-sm font-bold text-amber-900">待人工确认 · {songs.length} 首</h3>
      <p className="text-xs text-amber-800 mt-1 mb-3 leading-relaxed">
        AI 无法确定的歌曲暂存在这里。补齐语种或歌曲类别并确认后，歌曲会进入下方预览。
        全部确认或移出后才能写入歌单；进度保存在本机。
      </p>
      <div className="space-y-3 max-h-[420px] overflow-y-auto">
        {songs.map((song) => {
          const rawValues = { language: song.language, genre: song.genre, ...edits[song.songId] }
          const values: Partial<Record<ClassifyDimension, string>> = {}
          for (const dimension of dimensions) {
            if (rawValues[dimension] && DIMENSION_META[dimension].categories.includes(rawValues[dimension]!)) values[dimension] = rawValues[dimension]
          }
          const complete = dimensions.every((dimension) => values[dimension] && DIMENSION_META[dimension].categories.includes(values[dimension]!))
          return (
            <div key={song.songId} className="rounded-lg bg-white border border-amber-100 p-3">
              <p className="text-sm font-medium text-gray-800">{song.songName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{song.artists}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {dimensions.map((dimension) => (
                  <label key={dimension} className="flex-1 min-w-[120px] text-xs text-gray-600">
                    {DIMENSION_META[dimension].label}{(!song[dimension] || !DIMENSION_META[dimension].categories.includes(song[dimension]!)) && <span className="text-amber-700"> · 待确认</span>}
                    <select
                      aria-label={`${song.songName}的${DIMENSION_META[dimension].label}`}
                      value={values[dimension] || ''}
                      className="block w-full mt-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                      onChange={(event) => setEdits((previous) => ({
                        ...previous,
                        [song.songId]: { ...previous[song.songId], [dimension]: event.target.value },
                      }))}
                    >
                      <option value="">请选择</option>
                      {DIMENSION_META[dimension].categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="tn-btn tn-btn-primary w-full mt-3 disabled:opacity-50"
                disabled={!complete}
                onClick={() => onResolve(song.songId, Object.fromEntries(dimensions.map((dimension) => [dimension, values[dimension]!])))}
              >
                确认分类
              </button>
              <button className="text-xs text-gray-500 mt-2 w-full" onClick={() => onExclude(song.songId, true)}>暂不整理，移出本次分类</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
