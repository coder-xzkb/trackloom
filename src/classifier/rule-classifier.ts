import type { Song, ClassifyResult, ClassifyDimension } from '../types/index.ts'

// 只接受明确的歌曲级标签和录音版本说明。
const TAG_VALUES: Record<ClassifyDimension, Record<string, string[]>> = {
  language: {
    '普通话': ['普通话', '国语', 'mandarin'],
    '粤语': ['粤语', '广东话', 'cantonese'],
    '英语': ['英语', '英文', 'english'],
    '日语': ['日语', '日文', 'japanese'],
    '韩语': ['韩语', '韩文', 'korean'],
    '其他': ['法语', 'french', '西班牙语', 'spanish', '德语', 'german', '俄语', 'russian', '其他语种', '多语种', 'multilingual'],
    '纯音乐': ['纯音乐', '无人声', 'instrumental'],
  },
  genre: {
    '流行': ['流行', 'pop'],
    '摇滚': ['摇滚', 'rock'],
    'R&B': ['r&b', 'rnb'],
    '说唱': ['说唱', '嘻哈', 'hip-hop', 'hiphop', 'rap'],
    '电子': ['电子', 'electronic', 'edm'],
  },
}

function classifyTag(tags: string[], dimension: ClassifyDimension): string | undefined {
  const normalized = new Set(tags.map((tag) => tag.trim().toLowerCase()))
  const matches = Object.entries(TAG_VALUES[dimension])
    .filter(([, aliases]) => aliases.some((alias) => normalized.has(alias.toLowerCase())))
    .map(([category]) => category)
  // 冲突、多语种、多风格标签交给 AI，不能取第一个匹配项。
  return matches.length === 1 ? matches[0] : undefined
}

export function classifyByRules(song: Song): ClassifyResult {
  // 版本描述必须独立出现在括号里，避免把标题文字或艺人名当成语种。
  const editions = [...song.name.matchAll(/[（(]([^()（）]+)[）)]/g)]
    .map((match) => match[1].trim())
    .filter((edition) => /(?:版|\s+version)$|^(纯音乐|无人声|instrumental)$/i.test(edition))
    .map((edition) => edition.replace(/(?:版|\s+version)$/i, ''))
  const tags = [...(song.tags || []), ...editions]
  return {
    songId: song.id,
    songName: song.name,
    artists: song.artists.map((artist) => artist.name).join(' / '),
    language: classifyTag(tags, 'language'),
    genre: classifyTag(tags, 'genre'),
    source: 'rule',
  }
}
