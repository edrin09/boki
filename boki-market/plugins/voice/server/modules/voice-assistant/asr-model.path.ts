import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 流式 Zipformer 模型（sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30）。
 *
 * 在线（流式）识别，WebSocket 逐字上屏；整段 REST 转写复用同一个在线识别器。
 * 字符级建模（cjkchar），无标点输出；数据：multi_zh-hans 14k 小时。
 *
 * 下载：npm run models:fetch-asr（scripts/fetch-asr-streaming-model.mjs）
 */
export const ASR_MODEL_SUBDIR = 'zipformer-zh-streaming-int8'

export const ASR_MODEL_FILES = {
  encoder: 'encoder.int8.onnx',
  decoder: 'decoder.onnx',
  joiner: 'joiner.int8.onnx',
  tokens: 'tokens.txt',
} as const

/**
 * 模型目录解析顺序（仿 ocr-model.path.ts 的回退策略）：
 * 环境变量 VOICE_MODEL_DIR → cwd/models/asr → __dirname 三级上溯。
 *
 * 开发期（nest start）与打包后（node dist/main）__dirname 分别落在
 * src/modules/voice-assistant 与 dist/modules/voice-assistant，
 * 向上三级都回到 backend 根目录，两种运行方式统一覆盖。
 */
function candidateDirs(): string[] {
  const fromEnv = process.env.VOICE_MODEL_DIR
  const dirs: string[] = []
  if (fromEnv) dirs.push(path.resolve(fromEnv))
  dirs.push(path.join(process.cwd(), 'models', 'asr', ASR_MODEL_SUBDIR))
  dirs.push(path.resolve(__dirname, '..', '..', '..', 'models', 'asr', ASR_MODEL_SUBDIR))
  return dirs
}

function modelDir(): string {
  for (const dir of candidateDirs()) {
    if (fs.existsSync(path.join(dir, ASR_MODEL_FILES.encoder))) return dir
  }
  return candidateDirs()[candidateDirs().length - 1]
}

export function resolveAsrModelDir(): string {
  return modelDir()
}

export function asrModelPath(name: keyof typeof ASR_MODEL_FILES): string {
  return path.join(modelDir(), ASR_MODEL_FILES[name])
}

export function asrReady(): boolean {
  return Object.values(ASR_MODEL_FILES).every((f) =>
    fs.existsSync(path.join(modelDir(), f)),
  )
}

export function missingAsrModels(): string[] {
  const dir = modelDir()
  return Object.values(ASR_MODEL_FILES).filter((f) => !fs.existsSync(path.join(dir, f)))
}
