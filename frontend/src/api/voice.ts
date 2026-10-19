import { get, post, download } from './http'

export interface VoiceIntentColumn {
  key: string
  label: string
  width?: number
  numeric?: boolean
}

export interface VoiceCard {
  title: string
  columns: VoiceIntentColumn[]
  rows: Array<Record<string, unknown>>
  totals?: Record<string, unknown> | null
}

export interface VoiceQueryResult {
  transcript: string
  intentId: string
  intentTitle: string
  /** 语音播报/展示用话术 */
  reply: string
  card: VoiceCard
  exportId?: string
}

/** 语音助手 API：AUDIO 整段上传（Plan B 通道：text 字段直接传文字） */
export const voiceApi = {
  status: () => get<{ ready: boolean; modelDir: string; missing: string[]; textFallbackAvailable: boolean }>(
    '/voice/status',
  ),
  queryText: (text: string) => {
    const form = new FormData()
    form.append('text', text)
    // 后端未命中关键词时会走 AI 智能体（多轮 LLM 调用，单轮上限 240s），
    // axios 全局 30s 会把还在思考的请求误杀，这里单独放宽到 5 分钟
    return post<VoiceQueryResult>('/voice/query', form, { timeout: 300000 })
  },
  /** 只转写文字，不执行查询（WS 终稿为空时的 REST 兜底） */
  transcribe: (blob: Blob, filename = 'recording.wav') => {
    const form = new FormData()
    form.append('audio', blob, filename)
    // REST 兜底识别：后端首次调用会同步加载 ASR 模型，30s 不够
    return post<{ text: string }>('/voice/transcribe', form, { timeout: 120000 })
  },
  downloadExport: (exportId: string, filename?: string) =>
    download(`/voice/export/${exportId}`, undefined, filename),
}
