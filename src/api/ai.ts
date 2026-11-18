import type { AIConfig } from '../types/index.ts'

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export function chatEndpoint(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    throw new Error('请输入有效的 API 地址。')
  }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error('API 地址必须使用 HTTPS（本机可用 HTTP），且不能包含账号、参数或锚点。')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!url.pathname.endsWith('/chat/completions')) url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  return url
}

export async function requestChatCompletion(
  config: AIConfig, messages: ChatMessage[], maxTokens: number, signal?: AbortSignal,
): Promise<{ content: string; finishReason?: string }> {
  const endpoint = chatEndpoint(config.baseUrl)
  const timeout = AbortSignal.timeout(25000)
  const res = await fetch(endpoint.href, {
    method: 'POST',
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    redirect: 'error',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...(endpoint.hostname === 'api.openai.com' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(endpoint.hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`AI 服务返回 HTTP ${res.status}。${res.status === 401 || res.status === 403 ? '请检查 API Key 和模型权限。' : '请检查接口地址与模型，或稍后重试。'}`)
  }
  const data = await res.json()
  const choice = data.choices?.[0]
  return { content: typeof choice?.message?.content === 'string' ? choice.message.content : '', finishReason: choice?.finish_reason }
}
