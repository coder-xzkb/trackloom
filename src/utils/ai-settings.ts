import { AI_PROVIDERS, DEFAULT_SETTINGS } from '../types/index.ts'
import type { AISettingsInput, AISettingsView, Settings } from '../types/index.ts'
import { chatEndpoint, requestChatCompletion } from '../api/ai.ts'

const SETTINGS_KEY = 'tn_ai_settings'

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  if (stored[SETTINGS_KEY]) return stored[SETTINGS_KEY] as Settings
  const { settings } = await chrome.storage.sync.get('settings')
  return {
    ai: { ...DEFAULT_SETTINGS.ai, apiKey: typeof settings?.deepseekApiKey === 'string' ? settings.deepseekApiKey.trim() : '' },
    enableAI: settings?.enableAI ?? DEFAULT_SETTINGS.enableAI,
    batchSize: settings?.batchSize ?? DEFAULT_SETTINGS.batchSize,
    requestDelay: settings?.requestDelay ?? DEFAULT_SETTINGS.requestDelay,
  }
}

export function toSettingsView(settings: Settings): AISettingsView {
  const { apiKey, ...ai } = settings.ai
  return { ...settings, ai, hasApiKey: Boolean(apiKey) }
}

export async function configureAI(input: AISettingsInput, test: boolean): Promise<AISettingsView | null> {
  const { provider, baseUrl, model, apiKey } = input.ai
  if (!Object.prototype.hasOwnProperty.call(AI_PROVIDERS, provider)) throw new Error('请选择有效的 AI 服务商。')
  const url = chatEndpoint(provider === 'custom' ? baseUrl : AI_PROVIDERS[provider].baseUrl)
  const modelName = model.trim()
  if (!modelName) throw new Error('请输入模型名称。')

  // request() must run in the message listener's active user gesture, before awaiting storage.
  if ((test || (input.enableAI && (apiKey.trim() || input.keepApiKey))) && url.hostname !== 'api.deepseek.com') {
    const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] })
    if (!granted) throw new Error('浏览器未授权访问这个 AI 服务。')
  }

  const previous = await getSettings()
  const sameEndpoint = previous.ai.provider === provider && chatEndpoint(previous.ai.baseUrl).href === url.href
  const key = apiKey.trim() || (input.keepApiKey && sameEndpoint ? previous.ai.apiKey : '')
  const settings: Settings = {
    ai: { provider, baseUrl: provider === 'custom' ? baseUrl.trim() : AI_PROVIDERS[provider].baseUrl, model: modelName, apiKey: key },
    enableAI: input.enableAI,
    batchSize: Math.min(50, Math.max(1, Math.trunc(input.batchSize || DEFAULT_SETTINGS.batchSize))),
    requestDelay: Math.min(3000, Math.max(0, Math.trunc(input.requestDelay || 0))),
  }
  if (test) {
    if (!key) throw new Error('请填写 API Key 后再测试。')
    const completion = await requestChatCompletion(settings.ai, [{ role: 'user', content: 'Reply with OK.' }], 128)
    if (!completion.content.trim()) throw new Error('AI 服务返回了空内容，请检查模型是否支持聊天补全。')
    return null
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
  return toSettingsView(settings)
}
