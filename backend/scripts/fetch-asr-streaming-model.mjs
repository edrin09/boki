/**
 * 拉取流式语音识别（ASR）模型：
 * sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30（int8，约 160MB）。
 *
 * 下载源（依次回退）：
 *  1. ModelScope manyeyes 镜像（国内直连最快，文件与官方一致）
 *  2. hf-mirror.com（HF 国内反代）
 *  3. huggingface.co csukuangfj 官方仓库
 *
 * 目录结构：backend/models/asr/zipformer-zh-streaming-int8/
 *
 * 运行：npm run models:fetch-asr
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const targetDir = path.resolve(here, '..', 'models', 'asr', 'zipformer-zh-streaming-int8')

const MS_REPO = 'manyeyes/k2transducer-zipformer-large-zh-onnx-online-yuekai-20250630'
const HF_REPO = 'csukuangfj/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'

const FILES = [
  'encoder.int8.onnx',
  'decoder.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
]

function sources(file) {
  return [
    `https://www.modelscope.cn/models/${MS_REPO}/resolve/master/${file}`,
    `https://hf-mirror.com/${HF_REPO}/resolve/main/${file}`,
    `https://huggingface.co/${HF_REPO}/resolve/main/${file}`,
  ]
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function downloadOne(file) {
  let lastErr
  for (const url of sources(file)) {
    try {
      console.log(`  下载 ${file}  <- ${new URL(url).host} ...`)
      const buf = await fetchBuffer(url)
      if (buf.length < 1024) throw new Error(`文件过小(${buf.length}B)，疑似错误页`)
      fs.writeFileSync(path.join(targetDir, file), buf)
      console.log(`  完成 ${file}（${(buf.length / 1024 / 1024).toFixed(1)} MB）`)
      return
    } catch (err) {
      console.log(`  失败：${err.message}`)
      lastErr = err
    }
  }
  throw lastErr
}

async function main() {
  fs.mkdirSync(targetDir, { recursive: true })
  const missing = FILES.filter(
    (f) =>
      !fs.existsSync(path.join(targetDir, f)) ||
      fs.statSync(path.join(targetDir, f)).size === 0,
  )
  if (missing.length === 0) {
    console.log('流式 ASR 模型已就绪，无需下载。')
    return
  }
  console.log(`目标目录：${targetDir}`)

  for (const file of missing) {
    await downloadOne(file)
  }

  const ok = FILES.every(
    (f) => fs.existsSync(path.join(targetDir, f)) && fs.statSync(path.join(targetDir, f)).size > 0,
  )
  if (!ok) throw new Error('模型文件不全，请检查网络后重试')
  console.log('✔ 流式 ASR 模型下载完成')
}

main().catch((err) => {
  console.error(`✘ ${err.message}`)
  process.exit(1)
})
