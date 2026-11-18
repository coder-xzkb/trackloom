// ===== 歌曲相关 =====

export interface Song {
  id: number
  name: string
  artists: Artist[]
  album: Album
  duration: number
  tags?: string[]
  availability?: 'delisted'
}

export interface Artist {
  id: number
  name: string
}

export interface Album {
  id: number
  name: string
  publishTime?: number
}

// ===== 歌单相关 =====

export interface Playlist {
  id: number
  name: string
  trackCount: number
  coverImgUrl: string
  creator: { userId: number; nickname: string }
}

// ===== 分类相关 =====

export type ClassifyDimension = 'language' | 'genre'

export type GroupDimension = ClassifyDimension | 'combination'

export type DimensionSelection = Partial<Record<ClassifyDimension, string[]>>

export const DIMENSION_META: Record<ClassifyDimension, { label: string; categories: string[]; description?: string }> = {
  language: { label: '语种', categories: ['普通话', '粤语', '英语', '日语', '韩语', '纯音乐', '其他'], description: '按实际演唱语种判断，不按歌名使用的文字判断' },
  genre: { label: '歌曲类别', categories: ['流行', '摇滚', 'R&B', '说唱', '电子'] },
}

export function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (DIMENSION_META.language.categories.includes(value)) return value
  return ['法语', '西班牙语', '德语', '俄语', '其他语种', '多语种'].includes(value) ? '其他' : undefined
}

export interface ClassifyResult {
  songId: number
  songName: string
  artists: string
  language?: string
  genre?: string
  excluded?: boolean
  reviewedDimensions?: ClassifyDimension[]
  source: 'rule' | 'ai' | 'mixed'
}

export interface CategoryGroup {
  dimension: GroupDimension
  category: string
  songs: ClassifyResult[]
}

// ===== 消息通信 =====

export type MessageAction =
  | 'OPEN_OPTIONS'
  | 'GET_AI_SETTINGS'
  | 'SAVE_AI_SETTINGS'
  | 'TEST_AI_CONNECTION'
  | 'GET_USER_PLAYLISTS'
  | 'GET_PLAYLIST_DETAIL'
  | 'GET_SONG_DETAIL'
  | 'CREATE_PLAYLIST'
  | 'ADD_SONGS_TO_PLAYLIST'
  | 'CLASSIFY_SONGS'
  | 'CANCEL_CLASSIFICATION'
  | 'GET_CSRF_TOKEN'
  | 'GET_LOGIN_STATUS'

export interface ExtensionMessage {
  action: MessageAction
  data?: unknown
}

export interface ExtensionResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ===== 设置 =====

export type AIProvider = 'deepseek' | 'openai' | 'custom'

export interface AIConfig {
  provider: AIProvider
  baseUrl: string
  model: string
  apiKey: string
}

export const AI_PROVIDERS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
} satisfies Record<AIProvider, { label: string; baseUrl: string; model: string }>

export interface Settings {
  ai: AIConfig
  enableAI: boolean
  batchSize: number
  requestDelay: number
}

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'deepseek', baseUrl: AI_PROVIDERS.deepseek.baseUrl, model: AI_PROVIDERS.deepseek.model, apiKey: '' },
  enableAI: true,
  batchSize: 30,
  requestDelay: 500,
}

export type AISettingsView = Omit<Settings, 'ai'> & { ai: Omit<AIConfig, 'apiKey'>; hasApiKey: boolean }

export type AISettingsInput = Settings & { keepApiKey: boolean }
