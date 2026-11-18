import { useState, useEffect, useRef } from 'react'
import { LoginCheck } from './pages/LoginCheck'
import { PlaylistSelect } from './pages/PlaylistSelect'
import { TrackSelect } from './pages/TrackSelect'
import { DimensionConfig } from './pages/DimensionConfig'
import { ClassifyProgress } from './pages/ClassifyProgress'
import { ResultPreview } from './pages/ResultPreview'
import { CreateConfirm } from './pages/CreateConfirm'
import { TopRecord } from './pages/TopRecord'
import { Home } from './pages/Home'
import type { Playlist, Song, DimensionSelection, ClassifyResult, ClassifyDimension, ExtensionResponse } from '@/types'
import { DIMENSION_META } from '@/types'
import { groupClassifications, getPendingSongs, saveManualClassification } from '@/classifier'
import { saveClassificationDraft, loadClassificationDraft, clearClassificationDraft } from '@/utils/classification-draft'
import type { PlaylistTargetChoice } from '@/utils/organize-state'

const CURRENT_VERSION = (() => {
  try { return chrome.runtime.getManifest().version } catch { return '0.1.0' }
})()
const GITHUB_REPO = 'coder-xzkb/trackloom'
const PRODUCT_NAME = '拾曲 Trackloom'

export type Step = 'login' | 'home' | 'select' | 'dimensions' | 'tracks' | 'progress' | 'result' | 'create' | 'top-record'

const BACK_STEPS: Partial<Record<Step, Step>> = {
  select: 'home', dimensions: 'select', tracks: 'dimensions', progress: 'tracks', result: 'tracks', create: 'result', 'top-record': 'home',
}

export interface AppState {
  uid: number | null
  selectedPlaylists: Playlist[]
  songs: Song[]
  availableSongs: Song[]
  dimensionSelection: DimensionSelection
  combineDimensions: boolean
  results: ClassifyResult[]
}

export function PanelApp() {
  const [open, setOpen] = useState(false)
  const [showLoginHint, setShowLoginHint] = useState(true)
  const [step, setStep] = useState<Step>('login')
  const [prevStep, setPrevStep] = useState<Step>('login')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState('')
  const activeRequest = useRef<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [writing, setWriting] = useState(false)
  const [trackSelectionInitialized, setTrackSelectionInitialized] = useState(false)
  const [targetChoices, setTargetChoices] = useState<Record<string, PlaylistTargetChoice>>({})
  const [state, setState] = useState<AppState>({
    uid: null,
    selectedPlaylists: [],
    songs: [],
    availableSongs: [],
    dimensionSelection: {
      language: [...DIMENSION_META.language.categories],
      genre: [...DIMENSION_META.genre.categories],
    },
    combineDimensions: false,
    results: [],
  })
  const grouped = groupClassifications(state.results, state.dimensionSelection, state.combineDimensions)

  useEffect(() => {
    checkUpdate()
  }, [])

  useEffect(() => {
    if (!state.uid || state.results.length === 0) return
    saveClassificationDraft(state)
      .then(() => setDraftError(null))
      .catch(() => setDraftError('本机暂存失败，请保留当前页面，完成确认后创建歌单。'))
  }, [state])

  const updateClassification = (songId: number, values: Partial<Record<ClassifyDimension, string>>) => {
    const song = state.songs.find((item) => item.id === songId)
    const result = state.results.find((item) => item.songId === songId)
    if (song && result) {
      saveManualClassification(song, { ...result, ...values })
        .catch(() => setDraftError('人工分类未能写入长期记录，当前暂存和预览仍可继续使用。'))
    }
    setState((previous) => {
      const results = previous.results.map((song) => song.songId === songId ? { ...song, ...values } : song)
      return { ...previous, results }
    })
  }

  const checkUpdate = async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      if (!res.ok) return
      const data = await res.json()
      const tag = (data.tag_name || '').replace(/^v/, '')
      if (tag && tag !== CURRENT_VERSION) {
        setLatestVersion(tag)
      }
    } catch { /* ignore */ }
  }

  const updateState = (partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }

  const goBack = async () => {
    if (writing || cancelling) return
    const previous = BACK_STEPS[step]
    if (!previous) return
    if (step === 'progress' && activeRequest.current) {
      const runningId = activeRequest.current
      activeRequest.current = null // 忽略返回途中已经完成的旧任务，防止跳回结果页。
      setCancelling(true)
      try {
        const response: ExtensionResponse = await chrome.runtime.sendMessage({ action: 'CANCEL_CLASSIFICATION', data: { requestId: runningId } })
        if (!response.success) throw new Error(response.error || '未能停止分类')
      } catch (error) {
        activeRequest.current = runningId
        setDraftError(error instanceof Error ? error.message : '未能停止分类，请重试')
        return
      } finally {
        setCancelling(false)
      }
    }
    setStep(previous)
  }

  const classifySelected = (songs: Song[]) => {
    updateState({ songs })
    const previous = new Map(state.results.map((song) => [song.songId, song]))
    const dimensions = Object.keys(state.dimensionSelection) as ClassifyDimension[]
    if (songs.length > 0 && songs.every((song) => {
      const result = previous.get(song.id)
      return result && dimensions.every((dimension) => result[dimension] || result.reviewedDimensions?.includes(dimension))
    })) {
      updateState({ results: songs.map((song) => previous.get(song.id)!) })
      setStep('result')
      return
    }
    const id = crypto.randomUUID()
    activeRequest.current = id
    setRequestId(id)
    setStep('progress')
  }

  const renderStep = () => {
    switch (step) {
      case 'login':
        return (
          <LoginCheck
            onSuccess={async (uid) => {
              try {
                const draft = await loadClassificationDraft(uid)
                if (draft) {
                  setState({ ...draft, availableSongs: draft.availableSongs || draft.songs })
                  setTrackSelectionInitialized(true)
                  setStep('result')
                  return
                }
              } catch {
                setDraftError('无法读取本机暂存，请保留尚未完成确认的原页面。')
              }
              updateState({ uid })
              setStep('home')
            }}
          />
        )
      case 'home':
        return (
          <Home
            pendingCount={getPendingSongs(state.results, state.dimensionSelection).length}
            onNavigate={(target) => {
              setPrevStep('home')
              setStep(target as Step)
            }}
          />
        )
      case 'select':
        return (
          <PlaylistSelect
            uid={state.uid!}
            initialIds={state.selectedPlaylists.map((playlist) => playlist.id)}
            onSelectionChange={(selectedPlaylists) => updateState({ selectedPlaylists })}
            onBack={goBack}
            onConfirm={(playlists, songs) => {
              const byId = new Map(songs.filter((song) => song.availability !== 'delisted').map((song) => [song.id, song]))
              updateState({
                selectedPlaylists: playlists, availableSongs: songs,
                songs: state.songs.flatMap((song) => byId.has(song.id) ? [byId.get(song.id)!] : []),
                results: state.results.filter((song) => byId.has(song.songId)),
              })
              setStep('dimensions')
            }}
          />
        )
      case 'dimensions':
        return (
          <DimensionConfig
            selection={state.dimensionSelection}
            onChange={(sel) => updateState({ dimensionSelection: sel })}
            combineDimensions={state.combineDimensions}
            onCombineChange={(combineDimensions) => updateState({ combineDimensions })}
            onConfirm={() => setStep('tracks')}
            onBack={() => setStep('select')}
          />
        )
      case 'progress':
        return (
          <ClassifyProgress
            requestId={requestId}
            onBack={goBack}
            cancelling={cancelling}
            songs={state.songs}
            dimensionSelection={state.dimensionSelection}
            combineDimensions={state.combineDimensions}
            onComplete={(results) => {
              if (activeRequest.current !== requestId) return
              activeRequest.current = null
              const previous = new Map(state.results.map((song) => [song.songId, song]))
              const merged = results.map((song) => {
                const saved = previous.get(song.songId)
                const result = { ...song, excluded: saved?.excluded }
                for (const dimension of ['language', 'genre'] as const) {
                  const value = saved?.[dimension]
                  if (value && DIMENSION_META[dimension].categories.includes(value)) result[dimension] = value
                }
                return result
              })
              updateState({ results: merged })
              setStep('result')
            }}
          />
        )
      case 'tracks':
        return (
          <TrackSelect
            songs={state.availableSongs}
            initialIds={trackSelectionInitialized ? state.songs.map((song) => song.id) : undefined}
            onSelectionChange={(songs) => { setTrackSelectionInitialized(true); updateState({ songs }) }}
            onBack={() => setStep('dimensions')}
            onConfirm={classifySelected}
          />
        )
      case 'result':
        return (
          <ResultPreview
            grouped={grouped}
            selection={state.dimensionSelection}
            results={state.results}
            onResolve={updateClassification}
            onExclude={(songId, excluded) => {
              setState((previous) => {
                const results = previous.results.map((song) => song.songId === songId ? { ...song, excluded } : song)
                return { ...previous, results }
              })
            }}
            onConfirm={() => {
              if (getPendingSongs(state.results, state.dimensionSelection).length === 0) setStep('create')
            }}
            onBack={goBack}
            onReassign={(songId, dimension, newCategory) => {
              updateClassification(songId, { [dimension]: newCategory })
            }}
          />
        )
      case 'create':
        return (
          <CreateConfirm
            uid={state.uid!}
            grouped={grouped}
            initialChoices={targetChoices}
            onChoicesChange={setTargetChoices}
            onRunningChange={setWriting}
            onBack={goBack}
            onDone={async () => {
              updateState({ results: [] })
              setTargetChoices({})
              setTrackSelectionInitialized(false)
              try {
                await clearClassificationDraft(state.uid!)
              } catch {
                setDraftError('歌单已创建，但本机暂存未能清除。')
              }
              setStep('login')
              setOpen(false)
            }}
          />
        )
      case 'top-record':
        return (
          <TopRecord
            uid={state.uid!}
            onBack={() => setStep(prevStep)}
          />
        )
    }
  }

  return (
    <>
      {/* 悬浮按钮 */}
      <div className="tn-fab-wrap">
        {showLoginHint && step === 'login' && !open && (
          <div className="tn-login-hint">
            未登录？点击这里开始检测
          </div>
        )}
        <button
          className="tn-fab"
          onClick={() => {
            setOpen(!open)
            setShowLoginHint(false)
          }}
          title={PRODUCT_NAME}
          aria-label={PRODUCT_NAME}
        >
          <img src={chrome.runtime.getURL('public/icons/icon128.png')} alt="" className="w-10 h-10" />
        </button>
      </div>

      {/* 侧边面板 */}
      <div className={`tn-panel ${open ? 'open' : 'closed'}`}>
        <div className="tn-panel-header">
          <div className="flex items-center gap-2">
            <h2>{PRODUCT_NAME}</h2>
            <span className="text-[11px] text-gray-600 tabular-nums">v{CURRENT_VERSION}</span>
          </div>
          <div className="flex items-center gap-2">
            {state.uid && step !== 'home' && step !== 'login' && (
              <button
                className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer transition-colors"
                onClick={() => setStep('home')}
                disabled={writing || cancelling || step === 'progress'}
                title="返回主页"
              >
                ⊞
              </button>
            )}
            <button
              className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer"
              onClick={() => setOpen(false)}
              aria-label="关闭面板"
            >
              ✕
            </button>
          </div>
        </div>
        {latestVersion && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs">
            <span className="text-amber-700">🎉 新版本 v{latestVersion} 可用</span>
            <a
              href={`https://github.com/${GITHUB_REPO}/releases/latest`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-semibold hover:underline"
            >
              前往更新
            </a>
          </div>
        )}
        <div className="tn-panel-body">
          {draftError && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg mb-3">{draftError}</p>}
          {renderStep()}
        </div>
      </div>
    </>
  )
}
