import { useEffect, useRef, useState } from 'react'

interface FeatureItem {
  icon: string
  title: string
  desc: string
  action: () => void
}

interface Props {
  onNavigate: (target: string) => void
  pendingCount: number
}

export function Home({ onNavigate, pendingCount }: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsHeight, setSettingsHeight] = useState(440)
  const settingsFrame = useRef<HTMLIFrameElement>(null)
  const settingsUrl = new URL(chrome.runtime.getURL('src/options/index.html'), location.href)
  const settingsOrigin = `${settingsUrl.protocol}//${settingsUrl.host}`

  useEffect(() => {
    if (!showSettings) return
    const resize = (event: MessageEvent) => {
      if (event.source !== settingsFrame.current?.contentWindow || event.origin !== settingsOrigin) return
      if (event.data?.type !== 'trackloom-settings-height' || !Number.isFinite(event.data.height)) return
      setSettingsHeight(Math.min(720, Math.max(96, event.data.height)))
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [showSettings, settingsOrigin])
  const features: FeatureItem[] = [
    {
      icon: '🎯',
      title: pendingCount > 0 ? '继续人工确认' : '智能歌单分类',
      desc: pendingCount > 0 ? `还有 ${pendingCount} 首歌曲待确认，完成后可写入歌单` : '按语种、歌曲类别整理，可追加到已有歌单',
      action: () => onNavigate(pendingCount > 0 ? 'result' : 'select'),
    },
    {
      icon: '🏆',
      title: '听歌排行 Top100',
      desc: '查看你播放最多的歌曲排行榜',
      action: () => onNavigate('top-record'),
    },
  ]

  return (
    <div>
      <div className="space-y-2">
        {features.map((f) => (
          <button
            key={f.title}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary-soft text-left transition-colors cursor-pointer group"
            onClick={f.action}
          >
            <span className="text-2xl shrink-0">{f.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">
                {f.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
            </div>
            <span className="text-gray-300 group-hover:text-primary transition-colors text-sm">›</span>
          </button>
        ))}
      </div>
      <section className="mt-5 rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left rounded-xl hover:bg-primary-soft transition-colors"
          aria-expanded={showSettings}
          aria-controls="trackloom-ai-settings"
          onClick={() => setShowSettings(!showSettings)}
        >
          <span>
            <span className="block text-sm font-semibold text-gray-800">AI 服务</span>
            <span className="block text-xs text-gray-500 mt-0.5">配置服务商、模型与 API Key</span>
          </span>
          <span className="text-primary text-sm" aria-hidden="true">{showSettings ? '−' : '+'}</span>
        </button>
        <div id="trackloom-ai-settings" hidden={!showSettings}>
          {showSettings && (
            <iframe ref={settingsFrame} src={settingsUrl.href} title="AI 服务设置"
              className="block w-full border-0" style={{ height: settingsHeight }} />
          )}
        </div>
      </section>
    </div>
  )
}
