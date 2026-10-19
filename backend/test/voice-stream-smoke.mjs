/**
 * 流式语音识别 WebSocket 冒烟测试：
 * 用模型自带 test_wavs 之一当麦克风输入，按 128ms 帧推送 Int16 PCM，
 * 校验能收到 partial 递增与 final 非空。
 *
 * 前置：后端已启动（默认 http://127.0.0.1:3000），模型已下载。
 * 运行：node test/voice-stream-smoke.mjs [baseUrlHost]  默认 127.0.0.1:3000
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')

const here = path.dirname(fileURLToPath(import.meta.url))
const host = process.argv[2] || '127.0.0.1:3000'

let passed = 0
let failed = 0
function check(name, ok, extra = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`)
  }
}

async function login() {
  const res = await fetch(`http://${host}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  })
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}`)
  const json = await res.json()
  return json.data?.accessToken ?? json.accessToken
}

function readWavSamples(file) {
  const buf = fs.readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('非 WAV')
  let off = 12
  let rate = 16000
  let bits = 16
  let fmt = 1
  let dataOff = -1
  let len = -1
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = buf.readUInt16LE(off + 8)
      /* ch = */ buf.readUInt16LE(off + 10)
      rate = buf.readUInt32LE(off + 12)
      bits = buf.readUInt16LE(off + 22)
    } else if (id === 'data') {
      dataOff = off + 8
      len = Math.min(size, buf.length - (off + 8))
      break
    }
    off += 8 + size + (size % 2)
  }
  if (dataOff < 0) throw new Error('无 data 块')
  if (!(fmt === 1 && bits === 16)) throw new Error(`不支持 ${fmt}/${bits}`)
  return { pcm: buf.subarray(dataOff, dataOff + len), rate }
}

function resampleTo16k(int16, rate) {
  if (rate === 16000) return int16
  const ratio = rate / 16000
  const n = Math.floor(int16.length / ratio)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) out[i] = int16[Math.floor(i * ratio)]
  return out
}

async function main() {
  console.log(`流式识别冒烟：ws://${host}/api/voice/stream`)
  const token = await login()
  check('登录拿 token', Boolean(token))

  const modelDir = path.resolve(here, '..', 'models', 'asr', 'zipformer-zh-streaming-int8')
  const wavDir = path.join(modelDir, 'test_wavs')
  const wavFile = fs.readdirSync(wavDir).find((f) => f.endsWith('.wav') && f.startsWith('0'))
  if (!wavFile) {
    check('模型 test_wavs 存在', false)
    printStats()
    return
  }
  const { pcm, rate } = readWavSamples(path.join(wavDir, wavFile))
  const int16 = resampleTo16k(new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2)), rate)

  const ws = new WebSocket(`ws://${host}/api/voice/stream?token=${encodeURIComponent(token)}`)
  const partials = []
  let ready = false
  let finalText = null
  let errors = []
  let gotError = false

  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    const msg = JSON.parse(data.toString('utf8'))
    if (msg.type === 'ready') {
      ready = true
    } else if (msg.type === 'partial') {
      partials.push(msg.text)
    } else if (msg.type === 'final') {
      finalText = msg.text
    } else if (msg.type === 'error') {
      errors.push(msg.message)
      gotError = true
    }
  })
  ws.on('error', (err) => errors.push(err.message))

  await new Promise((r) => ws.on('open', r))
  check('WS 握手建立', Boolean(ws.readyState === 1))

  // 等 ready（首回含模型加载，2-3 分钟兜底）
  for (let i = 0; !ready && i < 600; i++) await sleep(500)
  if (gotError) {
    check('模型就绪', false, errors.join(' | '))
    ws.close()
    printStats()
    return
  }
  check('模型就绪', ready)

  // 128ms 一帧（2048 样本），与前端 ScriptProcessor 节奏一致
  const frame = 2048
  for (let off = 0; off < int16.length; off += frame) {
    const seg = int16.subarray(off, Math.min(off + frame, int16.length))
    const buf = Buffer.alloc(seg.length * 2)
    seg.forEach((v, i) => buf.writeInt16LE(v, i * 2))
    ws.send(buf)
    await sleep(96)
  }
  ws.send(JSON.stringify({ event: 'stop' }))
  for (let i = 0; finalText === null && i < 100; i++) await sleep(100)
  ws.close()

  check('收到 partial 增量', partials.length > 0, `共 ${partials.length} 次`)
  check('收到 final 终稿', Boolean(finalText && finalText.trim()), `final="${finalText}"`)
  check('音频时长 >3s（动态识别）', int16.length / 16000 > 3)
  printStats()
}

function sleep(ms) {
  return new Promise((r) => globalThis.setTimeout(r, ms))
}

function printStats() {
  console.log(`\n冒烟完成：${passed} 通过 / ${failed} 失败`)
  process.exitCode = failed ? 1 : 0
}

main().catch((err) => {
  console.error('异常退出:', err.message)
  process.exit(1)
})
