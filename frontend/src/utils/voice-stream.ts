/**
 * 流式语音识别（WebSocket）。
 *
 * 按住说话期间：麦克风 16k PCM 实时推送后端，后端逐字回推 partial（上屏）；
 * 松开：发送 stop 拿终稿。若 WS 连不上 / 中断，则本地积累的整段 WAV
 * 由调用方走 REST /voice/transcribe 兜底识别。
 */
import { getToken } from '@/api/http'

export interface VoiceStreamSession {
  /**
   * 停止录音并取结果。
   * force = true：立即断开丢弃结果（关闭弹窗场景），text 为空。
   * 正常停止：text 为 WS 终稿；为空时 wav 供调用方 REST 兜底整段识别。
   */
  stop: (force?: boolean) => Promise<{ text: string; wav: Blob }>
}

export interface StreamOptions {
  /** 录音计时（每 200ms） */
  onStatus?: (s: { ms: number }) => void
  /** 逐字上屏：增量文本 */
  onPartial?: (text: string) => void
  /** 流中断等错误提示（录音继续，松开后走 REST 兜底） */
  onError?: (message: string) => void
  /** 最长录音毫秒，默认 15000 */
  maxMs?: number
}

const TARGET_RATE = 16000
/** 等终稿的最长时间（超过则回退整段识别） */
const FINAL_TIMEOUT_MS = 3000

export async function startStreamingVoice(opts: StreamOptions): Promise<VoiceStreamSession> {
  const token = getToken()
  if (!token) throw new Error('未登录，无法使用语音识别')

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(
    `${proto}://${location.host}/api/voice/stream?token=${encodeURIComponent(token)}`,
  )

  /** 本地积累的整段音频（WS 异常时 REST 兜底用） */
  const chunks: Float32Array[] = []
  const startedAt = Date.now()
  let statusTimer: number | undefined
  let wsReady = false
  let stoppedSent = false
  let cleanedUp = false

  let finalResolve: (text: string) => void = () => {}
  const finalPromise = new Promise<string>((resolve) => {
    finalResolve = resolve
  })

  // 事件处理器必须在任何 await 之前同步注册：
  // 本地握手可能在 getUserMedia 等待期间就完成，晚注册会错过 open / ready
  ws.onopen = () => {
    wsReady = true
  }
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return
    let msg: { type?: string; text?: string; message?: string } = {}
    try {
      msg = JSON.parse(ev.data) as typeof msg
    } catch {
      return
    }
    if (msg.type === 'ready') {
      wsReady = true
    } else if (msg.type === 'partial') {
      const text = (msg.text ?? '').trim()
      if (text) opts.onPartial?.(text)
    } else if (msg.type === 'final') {
      finalResolve(msg.text ?? '')
    } else if (msg.type === 'error') {
      opts.onError?.(msg.message || '流式识别不可用')
      wsReady = false
    }
  }
  ws.onerror = () => {
    if (!cleanedUp) opts.onError?.('流式识别连接失败，松开后将整段识别')
    wsReady = false
  }
  ws.onclose = () => {
    wsReady = false
    // 还在等终稿就直接按空文本，交由 wav 兜底
    finalResolve('')
  }

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const ctx = new AudioContext({ sampleRate: TARGET_RATE })
  // 浏览器自动播放策略下可能挂起（异步链路里创建时），显式恢复
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {})
  }
  const source = ctx.createMediaStreamSource(micStream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)

  processor.onaudioprocess = (e) => {
    if (cleanedUp) return
    const input = e.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
    if (ws.readyState === WebSocket.OPEN && wsReady) {
      ws.send(floatToInt16(input).buffer as ArrayBuffer)
    }
  }

  source.connect(processor)
  processor.connect(ctx.destination)

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    window.clearInterval(statusTimer)
    try {
      processor.disconnect()
      source.disconnect()
    } catch {
      /* 已断开 */
    }
    micStream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  const closeWs = () => {
    try {
      ws.close(1000)
    } catch {
      /* 已关闭 */
    }
  }

  const buildWav = (): Blob => {
    const merged = mergeSamples(chunks)
    if (!merged.length) return new Blob([], { type: 'audio/wav' })
    return new Blob([encodeWav(merged, TARGET_RATE)], { type: 'audio/wav' })
  }

  // ---- 停止路径：只走一次，重复调用直接复用（keyup / blur / 超时竞态安全） ----
  let normalPromise: Promise<{ text: string; wav: Blob }> | null = null
  const maxTimer = window.setTimeout(() => {
    void session?.stop()
  }, opts.maxMs ?? 15000)

  const stopNormal = (): Promise<{ text: string; wav: Blob }> => {
    normalPromise ??= (async () => {
      window.clearTimeout(maxTimer)
      cleanup()
      let text = ''
      if (ws.readyState === WebSocket.OPEN && wsReady && !stoppedSent) {
        stoppedSent = true
        try {
          ws.send(JSON.stringify({ event: 'stop' }))
          text = await Promise.race([
            finalPromise.then((t) => (t ?? '').trim()),
            new Promise<string>((r) => window.setTimeout(() => r(''), FINAL_TIMEOUT_MS)),
          ])
        } catch {
          /* 回退空文本 */
        }
      }
      closeWs()
      return { text: text.trim(), wav: buildWav() }
    })()
    return normalPromise
  }

  const session: VoiceStreamSession = {
    stop: (force = false) => {
      if (force) {
        window.clearTimeout(maxTimer)
        cleanup()
        finalResolve('')
        closeWs()
        return Promise.resolve({ text: '', wav: buildWav() })
      }
      return stopNormal()
    },
  }

  if (opts.onStatus) {
    statusTimer = window.setInterval(() => {
      if (!cleanedUp) opts.onStatus?.({ ms: Date.now() - startedAt })
    }, 200)
  }

  return session
}

function mergeSamples(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** PCM16 + WAV 头（单声道），REST 整段兜底识别用 */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const pcm = floatToInt16(samples)
  const buffer = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  new Int16Array(buffer, 44).set(pcm)
  return buffer
}
