import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AI_PROVIDERS } from '@/types'
import type { AIProvider, AISettingsInput, AISettingsView, ExtensionResponse } from '@/types'

const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800'

async function settingsMessage<T>(action: 'GET_AI_SETTINGS' | 'SAVE_AI_SETTINGS' | 'TEST_AI_CONNECTION', data?: AISettingsInput): Promise<T> {
  const response: ExtensionResponse<T> = await chrome.runtime.sendMessage({ action, data })
  if (!response?.success) throw new Error(response?.error || '无法连接到扩展后台，请刷新页面后重试。')
  return response.data as T
}

export function OptionsApp({ embedded = false }: { embedded?: boolean }) {
  const [draft, setDraft] = useState<AISettingsView | null>(null)
  const [initial, setInitial] = useState<AISettingsView | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [removeSavedKey, setRemoveSavedKey] = useState(false)
  const [pending, setPending] = useState<'save' | 'test' | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    settingsMessage<AISettingsView>('GET_AI_SETTINGS').then((view) => {
      setInitial(view)
      setDraft(view)
    }).catch((error: Error) => setFeedback({ ok: false, text: error.message }))
  }, [])

  const hasSavedKey = Boolean(initial?.hasApiKey && initial.ai.provider === draft?.ai.provider
    && initial.ai.baseUrl === draft.ai.baseUrl && !removeSavedKey)

  const update = (next: AISettingsView) => {
    setFeedback(null)
    setDraft(next)
  }

  const submit = async (kind: 'save' | 'test') => {
    if (!draft) return
    setPending(kind)
    setFeedback(null)
    const data: AISettingsInput = { ...draft, ai: { ...draft.ai, apiKey }, keepApiKey: hasSavedKey }
    try {
      if (kind === 'test') {
        await settingsMessage('TEST_AI_CONNECTION', data)
        setFeedback({ ok: true, text: '连接成功。' })
      } else {
        const saved = await settingsMessage<AISettingsView>('SAVE_AI_SETTINGS', data)
        setInitial(saved)
        setDraft(saved)
        setApiKey('')
        setRemoveSavedKey(false)
        setFeedback({ ok: true, text: '设置已保存。' })
      }
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : '操作失败，请重试。' })
    } finally {
      setPending(null)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit('save')
  }

  return (
    <div className={embedded ? 'border-t border-gray-200 px-4 py-4' : 'max-w-lg mx-auto my-10 px-6'}>
      {!embedded && <h1 className="text-2xl font-bold text-gray-800 mb-5">拾曲 Trackloom 设置</h1>}
      {draft ? (
        <form onSubmit={onSubmit} autoComplete="off">
          <fieldset className="space-y-4 disabled:opacity-70" disabled={pending !== null}>
            <p className="text-xs text-gray-600 leading-relaxed">未配置 API Key 时按本地规则分类，无法确定的歌曲进入人工确认池。</p>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={draft.enableAI} onChange={(e) => update({ ...draft, enableAI: e.target.checked })} />
              使用 AI 辅助分类
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">服务商</span>
              <select className={fieldClass} value={draft.ai.provider} onChange={(e) => {
                const provider = e.target.value as AIProvider
                const { baseUrl, model } = AI_PROVIDERS[provider]
                setApiKey('')
                setRemoveSavedKey(false)
                update({ ...draft, ai: { provider, model, baseUrl } })
              }}>
                {Object.entries(AI_PROVIDERS).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
              </select>
            </label>
            {draft.ai.provider === 'custom' && (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">API 地址</span>
                <input className={fieldClass} required type="url" placeholder="https://example.com/v1" value={draft.ai.baseUrl}
                  onChange={(e) => update({ ...draft, ai: { ...draft.ai, baseUrl: e.target.value } })} />
                <span className="block mt-1 text-xs text-gray-500">填写 Base URL 或完整的 /chat/completions 地址。</span>
              </label>
            )}
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">模型</span>
              <input className={fieldClass} required value={draft.ai.model} onChange={(e) => update({ ...draft, ai: { ...draft.ai, model: e.target.value } })} />
            </label>
            <div>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">API Key</span>
                <input className={fieldClass} type="password" value={apiKey} autoComplete="off"
                  placeholder={hasSavedKey ? '已保存，留空将继续使用' : '可留空，仅用本地规则'}
                  onChange={(e) => { setApiKey(e.target.value); setFeedback(null) }} />
              </label>
              {initial?.hasApiKey && initial.ai.provider === draft.ai.provider && initial.ai.baseUrl === draft.ai.baseUrl && !apiKey && (
                <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => {
                  setRemoveSavedKey(!removeSavedKey)
                  setFeedback(null)
                }}>
                  {removeSavedKey ? '撤销清除' : '清除已保存的 API Key'}
                </button>
              )}
            </div>
            {!embedded && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">每批歌曲数</span>
                  <input className={fieldClass} type="number" min={1} max={50} value={draft.batchSize}
                    onChange={(e) => update({ ...draft, batchSize: Number(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">请求间隔（毫秒）</span>
                  <input className={fieldClass} type="number" min={0} max={3000} value={draft.requestDelay}
                    onChange={(e) => update({ ...draft, requestDelay: Number(e.target.value) })} />
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="tn-btn tn-btn-primary">{pending === 'save' ? '正在保存…' : '保存设置'}</button>
              <button type="button" className="tn-btn tn-btn-secondary" disabled={!apiKey.trim() && !hasSavedKey}
                onClick={() => void submit('test')}>{pending === 'test' ? '正在测试…' : '测试连接'}</button>
            </div>
          </fieldset>
        </form>
      ) : !feedback && <p className="text-sm text-gray-600" role="status">正在读取设置…</p>}
      {feedback && <p role="status" className={`text-xs mt-3 ${feedback.ok ? 'text-green-700' : 'text-red-700'}`}>{feedback.text}</p>}
    </div>
  )
}
