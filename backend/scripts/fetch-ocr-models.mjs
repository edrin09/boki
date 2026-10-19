/**
 * 拉取离线 OCR 所需的 ONNX 模型与字典。
 *
 * 来源：ModelScope 上的 RapidAI/RapidOCR 仓库（PP-OCRv4 中文 mobile 版）。
 * 选择 ModelScope 而非 HuggingFace，是因为国内网络可直连。
 *
 * 运行：npm run models:fetch
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const targetDir = path.resolve(here, '..', 'models', 'ocr')

const REPO = 'https://www.modelscope.cn/api/v1/models'
const RAPIDOCR = `${REPO}/RapidAI/RapidOCR/repo?Revision=master&FilePath=`

const ASSETS = [
  {
    file: 'det.onnx',
    url: `${RAPIDOCR}onnx/PP-OCRv4/det/ch_PP-OCRv4_det_mobile.onnx`,
    sha256: 'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9',
  },
  {
    file: 'cls.onnx',
    url: `${RAPIDOCR}onnx/PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx`,
    sha256: 'e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c',
  },
  {
    file: 'rec.onnx',
    url: `${RAPIDOCR}onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx`,
    sha256: '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b',
  },
]

const KEYS_FILE = 'ppocrv6_dict.txt'

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function ensureAsset(asset) {
  const target = path.join(targetDir, asset.file)
  if (fs.existsSync(target)) {
    const actual = sha256(fs.readFileSync(target))
    if (actual === asset.sha256) {
      console.log(`  跳过 ${asset.file}（已存在且校验通过）`)
      return
    }
    console.log(`  重新下载 ${asset.file}（现有文件校验不一致）`)
  }
  const buf = await download(asset.url)
  const actual = sha256(buf)
  if (actual !== asset.sha256) {
    throw new Error(`${asset.file} 校验失败\n  期望 ${asset.sha256}\n  实际 ${actual}`)
  }
  fs.writeFileSync(target, buf)
  console.log(`  完成 ${asset.file}  ${(buf.length / 1024 / 1024).toFixed(1)}MB`)
}

/**
 * 识别字典不再单独下载：直接从 rec.onnx 的 ONNX 元数据（metadata_props 的
 * character 键）中抽取，保证字典与识别模型永远配套。
 * 对应 ocr-model.path.ts 中 keys: 'ppocrv6_dict.txt' 的说明。
 */
function readVarint(buf, p) {
  let value = 0n
  let shift = 0n
  for (;;) {
    const byte = buf[p++]
    value |= BigInt(byte & 0x7f) << shift
    if (!(byte & 0x80)) return [value, p]
    shift += 7n
  }
}

/** 遍历 ModelProto 顶层字段，收集 metadata_props（field 14）的所有条目。 */
function extractMetadataProps(buf) {
  const entries = new Map()
  let p = 0
  while (p < buf.length) {
    const [tag, p2] = readVarint(buf, p)
    p = p2
    const field = Number(tag >> 3n)
    const wireType = Number(tag & 7n)
    if (wireType === 2) {
      const [len, p3] = readVarint(buf, p)
      p = p3
      const size = Number(len)
      if (field === 14) parseStringStringEntries(buf.subarray(p, p + size), entries)
      p += size
    } else if (wireType === 0) {
      const [, p3] = readVarint(buf, p)
      p = p3
    } else if (wireType === 5) {
      p += 4
    } else if (wireType === 1) {
      p += 8
    } else {
      throw new Error(`不支持的 protobuf wire type ${wireType}`)
    }
  }
  return entries
}

function parseStringStringEntries(blob, entries) {
  let q = 0
  while (q < blob.length) {
    const [tag, q2] = readVarint(blob, q)
    q = q2
    const field = Number(tag >> 3n)
    if (Number(tag & 7n) !== 2) throw new Error('metadata 条目应为长度界定字段')
    const [len, q3] = readVarint(blob, q)
    q = q3
    const size = Number(len)
    if (field === 1) entries.set('_key_', blob.subarray(q, q + size).toString('utf8'))
    if (field === 2) entries.set('_value_', blob.subarray(q, q + size).toString('utf8'))
    q += size
    if (entries.has('_key_') && entries.has('_value_')) {
      entries.set(entries.get('_key_'), entries.get('_value_'))
      entries.delete('_key_')
      entries.delete('_value_')
    }
  }
}

function ensureKeys() {
  const target = path.join(targetDir, KEYS_FILE)
  const recPath = path.join(targetDir, 'rec.onnx')
  if (!fs.existsSync(recPath)) throw new Error('rec.onnx 不存在，无法抽取识别字典')
  const dict = extractMetadataProps(fs.readFileSync(recPath)).get('character')
  if (!dict || dict.length === 0) throw new Error('未能从 rec.onnx 元数据中抽取 character 字典')
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') === dict) {
      console.log(`  跳过 ${KEYS_FILE}（与 rec.onnx 元数据一致）`)
      return
    }
    console.log(`  重写 ${KEYS_FILE}（与 rec.onnx 元数据不一致）`)
  }
  fs.writeFileSync(target, dict, 'utf8')
  console.log(`  完成 ${KEYS_FILE}  ${dict.split('\n').filter(Boolean).length} 个字符`)
}

async function main() {
  fs.mkdirSync(targetDir, { recursive: true })
  console.log(`模型目录: ${targetDir}`)
  for (const asset of ASSETS) await ensureAsset(asset)
  await ensureKeys()
  console.log('全部就绪')
}

main().catch((err) => {
  console.error('拉取失败:', err.message)
  process.exit(1)
})