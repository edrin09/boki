import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as http from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { VoiceAsrService, AsrStream } from './voice-asr.service'

/**
 * 流式语音识别 WebSocket 通道。
 *
 * 路径：/{prefix}/voice/stream（默认 /api/voice/stream），与现有 HTTP 同端口。
 * 鉴权：握手 ?token=<jwt>，无效即拒绝（1008）。语音助手为只读查询，
 * 登录用户即可使用；细粒度 voice:use 权限仍由 REST 提问接口把关。
 *
 * 协议：
 *  - 服务端 → 客户端
 *    { "type": "ready" }                        连接建立、模型就绪
 *    { "type": "partial", "text": "…" }         逐字上屏的中间结果
 *    { "type": "final", "text": "…" }           松开后的终稿文本
 *    { "type": "error", "message": "…" }        异常（模型缺失等）
 *  - 客户端 → 服务端
 *    二进制帧：Int16 单声道 16kHz PCM（每包约为 AudioContext 缓冲大小）
 *    { "event": "stop" }（JSON 文本）            停止并请求终稿
 */
const WS_PATH = '/voice/stream'

interface VoiceSession {
  stream?: AsrStream
  /** 模型尚未就绪时积压的音频帧 */
  backlog: Float32Array[]
  ready: boolean
  lastSent: string
  /** token 鉴权得到的用户标识 */
  userId: string
}

export function createVoiceStreamServer(
  httpServer: http.Server,
  asr: VoiceAsrService,
  jwtService: JwtService,
  globalPrefix: string,
  onSessionError?: (err: Error) => void,
): WebSocketServer {
  const logger = new Logger('VoiceWs')
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = (req.url ?? '').split('?')[0]
    const expected = `/${globalPrefix.replace(/^\/+/, '')}${WS_PATH}`
    if (url !== expected) return // 其余升级请求不受影响（Express 已接管）

    // JWT 握手鉴权
    let userId = ''
    try {
      const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
      const payload = jwtService.verify(token)
      userId = String(payload?.sub ?? '')
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, userId)
    })
  })

  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, userId: string) => {
    const session: VoiceSession = { backlog: [], ready: asr.isReady(), lastSent: '', userId }
    send(ws, { type: session.ready ? 'ready' : 'loading' })

    // 模型懒加载：就绪后立刻通知，并消化积压帧
    void asr.openStream().then(
      (stream) => {
        session.stream = stream
        session.ready = true
        send(ws, { type: 'ready' })
        for (const samples of session.backlog) stream.accept(samples)
        session.backlog.length = 0
        pushPartial(ws, session, stream)
      },
      (err: Error) => {
        send(ws, { type: 'error', message: err.message ? `模型未就绪：${err.message}` : '模型未就绪' })
        onSessionError?.(err)
      },
    )

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // 二进制：Int16 单声道 16k PCM → Float32
        try {
          if (session.stream) {
            session.stream.accept(int16ToFloat32(data))
            pushPartial(ws, session, session.stream)
          } else {
            session.backlog.push(int16ToFloat32(data))
          }
        } catch (err) {
          send(ws, { type: 'error', message: (err as Error).message })
        }
        return
      }

      // 文本：JSON 控制指令
      let msg: { event?: string } = {}
      try {
        msg = JSON.parse(data.toString('utf8'))
      } catch {
        return
      }
      if (msg.event === 'stop') {
        if (session.stream) {
          const text = session.stream.finish().trim()
          send(ws, { type: 'final', text })
        } else {
          send(ws, { type: 'final', text: '' })
        }
      }
    })

    ws.on('close', () => {
      session.stream?.destroy()
      session.stream = undefined
    })

    ws.on('error', (err) => {
      session.stream?.destroy()
      session.stream = undefined
      onSessionError?.(err)
    })
  })

  logger.log(`流式识别 WebSocket 就绪：/${globalPrefix.replace(/^\/+/, '')}${WS_PATH}`)
  return wss
}

function int16ToFloat32(data: Buffer): Float32Array {
  const n = Math.floor(data.length / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2) / 32768
  return out
}

function send(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

/** 部分结果有增量才推送，避免刷屏 */
function pushPartial(ws: WebSocket, session: VoiceSession, stream: AsrStream): void {
  const text = stream.partial().trim()
  if (text && text !== session.lastSent) {
    session.lastSent = text
    send(ws, { type: 'partial', text })
  }
}
