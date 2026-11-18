import { useEffect, useState, useRef } from 'react'
import type { Song, DimensionSelection, ClassifyResult, CategoryGroup, ExtensionResponse } from '@/types'

interface Props {
  requestId: string
  onBack: () => void
  cancelling: boolean
  songs: Song[]
  dimensionSelection: DimensionSelection
  combineDimensions: boolean
  onComplete: (results: ClassifyResult[], grouped: CategoryGroup[]) => void
}

export function ClassifyProgress({ requestId, onBack, cancelling, songs, dimensionSelection, combineDimensions, onComplete }: Props) {
  const [phase, setPhase] = useState<'rule' | 'ai' | 'done'>('rule')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(songs.length)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const handler = (msg: any) => {
      if (msg?.action === 'CLASSIFY_PROGRESS' && msg.data?.requestId === requestId) {
        setPhase(msg.data.phase)
        setProgress(msg.data.current)
        setTotal(msg.data.total)
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    runClassification()
    return () => { mounted.current = false; chrome.runtime.onMessage.removeListener(handler) }
  }, [])

  const runClassification = async () => {
    setError(null)
    setPhase('rule')
    setProgress(0)
    setTotal(songs.length)
    try {
      const res: ExtensionResponse = await chrome.runtime.sendMessage({
        action: 'CLASSIFY_SONGS',
        data: { songs, dimensionSelection, combineDimensions, requestId },
      })
      if (!mounted.current) return

      if (res.success && res.data) {
        const { results, grouped } = res.data as {
          results: ClassifyResult[]
          grouped: CategoryGroup[]
        }
        setPhase('done')
        setProgress(total)
        onComplete(results, grouped)
      } else {
        setError(res.error || '分类失败')
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : '分类过程出错，请重试')
    }
  }

  const phaseLabel = {
    rule: '规则分类中',
    ai: 'AI 分类中',
    done: '完成',
  }

  const percent = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="flex flex-col items-center py-12">
      {!error && <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />}

      <p className="text-base font-medium text-gray-800 mb-2">{error ? '分类未完成' : phaseLabel[phase]}</p>
      <p className="text-sm text-gray-500 mb-6">
        共 {songs.length} 首歌曲
      </p>

      <div className="w-full max-w-xs">
        <div className="tn-progress-bar">
          <div
            className="tn-progress-bar-fill"
            style={{ width: `${phase === 'done' ? 100 : Math.max(percent, 10)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          {error ? '请处理错误后重试' : phase === 'done' ? '分类完成' : '处理中，请稍候...'}
        </p>
      </div>

      {error && (
        <div className="mt-4 text-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button className="tn-btn tn-btn-secondary mt-3" onClick={() => chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' })}>打开扩展设置</button>
          <button className="tn-btn tn-btn-primary mt-3 ml-2" disabled={cancelling} onClick={runClassification}>重试分类</button>
        </div>
      )}
      <button className="tn-btn tn-btn-secondary mt-6" disabled={cancelling} onClick={onBack}>
        {cancelling ? '正在停止...' : error ? '上一步' : '停止分类并返回上一步'}
      </button>
      <p className="text-xs text-gray-400 mt-2">已完成的批次会保留，下次继续时会复用。</p>
    </div>
  )
}
