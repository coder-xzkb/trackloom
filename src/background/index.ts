import type { AISettingsInput, ExtensionMessage, ExtensionResponse } from '@/types'
import {
  getLoginStatus,
  getUserPlaylists,
  getPlaylistDetail,
  getSongDetails,
  createPlaylist,
  addSongsToPlaylist,
} from '@/api/netease'
import { classifySongs, groupClassifications } from '@/classifier'
import { ClassificationJobs } from '@/utils/classification-jobs'
import { configureAI, getSettings, toSettingsView } from '@/utils/ai-settings'

const classificationJobs = new ClassificationJobs()
const ownerKey = (sender?: chrome.runtime.MessageSender) => `${sender?.tab?.id ?? 'extension'}:${sender?.frameId ?? 0}`

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse: (r: ExtensionResponse) => void) => {
    handleMessage(message, sender)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true // keep port open for async response
  }
)

async function handleMessage(message: ExtensionMessage, sender?: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.action) {
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage()
      return null

    case 'GET_AI_SETTINGS':
      return toSettingsView(await getSettings())

    case 'SAVE_AI_SETTINGS':
    case 'TEST_AI_CONNECTION':
      if (!sender?.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('请在插件的 AI 服务设置中操作。')
      return configureAI(message.data as AISettingsInput, message.action === 'TEST_AI_CONNECTION')

    case 'GET_LOGIN_STATUS':
      return getLoginStatus()

    case 'GET_USER_PLAYLISTS': {
      const { uid } = message.data as { uid: number }
      return getUserPlaylists(uid)
    }

    case 'GET_PLAYLIST_DETAIL': {
      const { id } = message.data as { id: number }
      return getPlaylistDetail(id)
    }

    case 'GET_SONG_DETAIL': {
      const { ids } = message.data as { ids: number[] }
      return getSongDetails(ids)
    }

    case 'CREATE_PLAYLIST': {
      const { name } = message.data as { name: string }
      return createPlaylist(name)
    }

    case 'ADD_SONGS_TO_PLAYLIST': {
      const { pid, trackIds } = message.data as { pid: number; trackIds: number[] }
      await addSongsToPlaylist(pid, trackIds)
      return { success: true }
    }

    case 'CLASSIFY_SONGS': {
      const { songs, dimensionSelection, combineDimensions, requestId = crypto.randomUUID() } = message.data as {
        songs: Parameters<typeof classifySongs>[0]
        dimensionSelection: Parameters<typeof classifySongs>[2]
        combineDimensions?: boolean
        requestId?: string
      }
      const tabId = sender?.tab?.id
      const sendProgress = (p: import('@/classifier').ClassifyProgress) => {
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: 'CLASSIFY_PROGRESS', data: { ...p, requestId } }).catch(() => {})
        }
      }
      const results = await classificationJobs.run(ownerKey(sender), requestId, async (signal) => {
        const settings = await getSettings()
        return classifySongs(songs, settings, dimensionSelection, sendProgress, signal)
      })
      const grouped = groupClassifications(results, dimensionSelection, combineDimensions)
      return { results, grouped }
    }

    case 'CANCEL_CLASSIFICATION': {
      const { requestId } = message.data as { requestId: string }
      return { cancelled: classificationJobs.cancel(ownerKey(sender), requestId) }
    }

    default:
      throw new Error(`Unknown action: ${message.action}`)
  }
}
