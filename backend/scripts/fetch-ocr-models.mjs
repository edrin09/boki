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
const PADDLE_REC_CONFIG = `${REPO}/PaddlePaddle/PP-OCRv4_mobile_rec/repo?Revision=master&FilePath=config.json`

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

const KEYS_FILE = 'ppocr_keys_v1.txt'
const KEYS_SHA256 = 'a1c84d9bdb9ab29043c58896224d32941783eb821629618416dcb08f12886492'

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
 * 识别字典不在模型仓库里，取自 PaddleOCR 识别模型的配置，
 * 其 PostProcess.character_dict 即 ppocr_keys_v1.txt 的内容。
 */
async function ensureKeys() {
  const target = path.join(targetDir, KEYS_FILE)
  if (fs.existsSync(target)) {
    const actual = sha256(fs.readFileSync(target))
    if (actual === KEYS_SHA256) {
      console.log(`  跳过 ${KEYS_FILE}（已存在且校验通过）`)
      return
    }
  }
  const config = JSON.parse((await download(PADDLE_REC_CONFIG)).toString('utf8'))
  const dict = config?.PostProcess?.character_dict
  if (!Array.isArray(dict) || dict.length === 0) {
    throw new Error('未能从配置中解析 character_dict')
  }
  fs.writeFileSync(target, `${dict.join('\n')}\n`, 'utf8')
  const actual = sha256(fs.readFileSync(target))
  if (actual !== KEYS_SHA256) {
    throw new Error(`${KEYS_FILE} 校验失败\n  期望 ${KEYS_SHA256}\n  实际 ${actual}`)
  }
  console.log(`  完成 ${KEYS_FILE}  ${dict.length} 个字符`)
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