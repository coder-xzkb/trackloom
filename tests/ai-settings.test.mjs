import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../src/types/index.ts'
import { chatEndpoint } from '../src/api/ai.ts'
import { configureAI, getSettings, toSettingsView } from '../src/utils/ai-settings.ts'

const originalFetch = globalThis.fetch
const local = {}
const permissionRequests = []
const legacy = { deepseekApiKey: 'old-key', enableAI: true, batchSize: 20, requestDelay: 600 }

beforeEach(() => {
  delete local.tn_ai_settings
  permissionRequests.length = 0
  globalThis.chrome = {
    storage: {
      local: { async get() { return local }, async set(values) { Object.assign(local, values) } },
      sync: { async get() { return { settings: legacy } } },
    },
    permissions: { async request({ origins }) { permissionRequests.push(...origins); return true } },
  }
  globalThis.fetch = async () => { throw new Error('unexpected network request') }
})

afterEach(() => {
  delete globalThis.chrome
  globalThis.fetch = originalFetch
})

test('reads the previous DeepSeek key without returning it to the settings form', async () => {
  const settings = await getSettings()
  assert.equal(settings.ai.apiKey, 'old-key')
  assert.equal(settings.ai.model, DEFAULT_SETTINGS.ai.model)
  assert.equal(settings.batchSize, 20)
  const view = toSettingsView(settings)
  assert.equal(view.hasApiKey, true)
  assert.equal(Object.hasOwn(view.ai, 'apiKey'), false)
  assert.equal((await configureAI({ ...settings, ai: { ...settings.ai, apiKey: '' }, keepApiKey: false }, false)).hasApiKey, false)
  assert.equal((await getSettings()).ai.apiKey, '')
})

test('switching endpoints never reuses a key from the former provider', async () => {
  const ai = { provider: 'custom', baseUrl: 'https://example.com/v1/', model: 'music-mini', apiKey: '' }
  const result = await configureAI({ ...DEFAULT_SETTINGS, ai, keepApiKey: true }, false)
  assert.equal(result.hasApiKey, false)
  assert.equal((await getSettings()).ai.apiKey, '')

  await configureAI({ ...DEFAULT_SETTINGS, ai: { ...ai, apiKey: 'new-key' }, keepApiKey: false }, false)
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.com/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer new-key')
    assert.equal(JSON.parse(options.body).model, 'music-mini')
    assert.equal(options.redirect, 'error')
    return Response.json({ choices: [{ message: { content: 'OK' } }] })
  }
  assert.equal(await configureAI({ ...DEFAULT_SETTINGS, ai, keepApiKey: true }, true), null)
  assert.ok(permissionRequests.every((origin) => origin === 'https://example.com/*'))
})

test('normalizes custom URLs and rejects insecure remote hosts and embedded secrets', () => {
  assert.equal(chatEndpoint('http://127.0.0.1:11434/v1').href, 'http://127.0.0.1:11434/v1/chat/completions')
  assert.equal(chatEndpoint('https://example.com/v1/chat/completions/').href, 'https://example.com/v1/chat/completions')
  assert.throws(() => chatEndpoint('http://example.com/v1'), /HTTPS/)
  assert.throws(() => chatEndpoint('https://user:secret@example.com/v1'), /HTTPS/)
})
