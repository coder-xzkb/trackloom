import type { ClassifyDimension, DimensionSelection } from '@/types'
import { DIMENSION_META } from '@/types'

interface Props {
  selection: DimensionSelection
  onChange: (sel: DimensionSelection) => void
  combineDimensions: boolean
  onCombineChange: (combine: boolean) => void
  onConfirm: () => void
  onBack: () => void
}

const ALL_DIMS: ClassifyDimension[] = ['language', 'genre']

export function DimensionConfig({ selection, onChange, combineDimensions, onCombineChange, onConfirm, onBack }: Props) {
  const isDimActive = (dim: ClassifyDimension) => dim in selection

  const toggleDimension = (dim: ClassifyDimension) => {
    if (isDimActive(dim)) {
      const next = { ...selection }
      delete next[dim]
      onChange(next)
      onCombineChange(false)
    } else {
      onChange({ ...selection, [dim]: [...DIMENSION_META[dim].categories] })
    }
  }

  const toggleCategory = (dim: ClassifyDimension, cat: string) => {
    const current = selection[dim] || []
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat]
    if (next.length === 0) {
      const rest = { ...selection }
      delete rest[dim]
      onChange(rest)
      onCombineChange(false)
    } else {
      onChange({ ...selection, [dim]: next })
    }
  }

  const selectAllCats = (dim: ClassifyDimension) => {
    onChange({ ...selection, [dim]: [...DIMENSION_META[dim].categories] })
  }

  const hasAnySelected = Object.keys(selection).length > 0

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">选择分类维度和子类目：</p>

      <div className="space-y-3 max-h-[420px] overflow-y-auto">
        {ALL_DIMS.map((dim) => {
          const meta = DIMENSION_META[dim]
          const active = isDimActive(dim)
          const cats = (selection[dim] || []).filter((c) => meta.categories.includes(c))

          return (
            <div key={dim} className={`rounded-lg border transition-colors ${active ? 'border-primary/40 bg-primary-soft/50' : 'border-gray-200'}`}>
              <label className="flex items-center gap-3 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleDimension(dim)}
                  className="w-4 h-4 accent-primary flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                  {!active && (
                    <p className="text-xs text-gray-400">{meta.description || meta.categories.join('、')}</p>
                  )}
                  {active && meta.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>
                  )}
                </div>
                {active && (
                  <span className="text-xs text-primary">{Math.min(cats.length, meta.categories.length)}/{meta.categories.length}</span>
                )}
              </label>

              {active && (
                <div className="px-3 pb-3 pt-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">选择子类目：</span>
                    {cats.length < meta.categories.length && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => selectAllCats(dim)}
                      >
                        全选
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.categories.map((cat) => {
                      const selected = cats.includes(cat)
                      return (
                        <button
                          key={cat}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            selected
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => toggleCategory(dim, cat)}
                        >
                          {cat}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 p-3 rounded-lg border border-gray-200">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={combineDimensions}
            disabled={!selection.language?.length || !selection.genre?.length}
            onChange={(event) => onCombineChange(event.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          按「语种 × 歌曲类别」组合分类
        </label>
        <p className="text-xs text-gray-400 mt-2">
          {combineDimensions
            ? '创建「日语 · 摇滚」「英语 · R&B」等组合歌单；两项都确定后才会归入。'
            : '分别创建语种歌单和类别歌单。勾选两种维度后可开启组合分类。'}
        </p>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="tn-btn tn-btn-secondary flex-1" onClick={onBack}>
          上一步
        </button>
        <button
          className="tn-btn tn-btn-primary flex-1"
          disabled={!hasAnySelected}
          onClick={onConfirm}
        >
          选择要整理的曲目
        </button>
      </div>
    </div>
  )
}
