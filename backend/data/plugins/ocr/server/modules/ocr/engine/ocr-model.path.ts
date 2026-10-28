import * as fs from 'node:fs'
import * as path from 'node:path'

export const MODEL_FILES = {
  det: 'det.onnx',
  cls: 'cls.onnx',
  rec: 'rec.onnx',
  /** PP-OCRv6 rec 配套大字典（从 rec.onnx 的 character 元数据抽取） */
  keys: 'ppocrv6_dict.txt',
} as const

/**
 * 模型目录解析顺序：环境变量优先，其次按可执行文件位置回退。
 *
 * 开发期（nest start）与打包后（node dist/main）本文件的 __dirname 分别落在
 * src/modules/ocr 与 dist/modules/ocr，向上三级都回到 backend 根目录，
 * 因此统一用三级回退即可覆盖两种运行方式。
 */
function candidateDirs(): string[] {
  const fromEnv = process.env.OCR_MODEL_DIR
  const dirs: string[] = []
  if (fromEnv) dirs.push(path.resolve(fromEnv))
  dirs.push(path.join(process.cwd(), 'models', 'ocr'))
  dirs.push(path.resolve(__dirname, '..', '..', '..', 'models', 'ocr'))
  return dirs
}

export function resolveModelDir(): string {
  for (const dir of candidateDirs()) {
    if (fs.existsSync(path.join(dir, MODEL_FILES.det))) return dir
  }
  return candidateDirs()[candidateDirs().length - 1]
}

export function modelPath(name: keyof typeof MODEL_FILES): string {
  return path.join(resolveModelDir(), MODEL_FILES[name])
}

export function modelsReady(): boolean {
  return Object.values(MODEL_FILES).every((f) => fs.existsSync(path.join(resolveModelDir(), f)))
}

export function missingModels(): string[] {
  const dir = resolveModelDir()
  return Object.values(MODEL_FILES).filter((f) => !fs.existsSync(path.join(dir, f)))
}