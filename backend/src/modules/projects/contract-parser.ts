import { BadRequestException } from '@nestjs/common'
import { parsePdf } from '../ocr/pdf.util'
import type { OcrEngine } from '../ocr/ocr.engine'

export interface ContractParseResult {
  /** 合同标题（可作项目名称建议） */
  projectName: string | null
  contractNo: string | null
  partyA: string | null
  partyB: string | null
  /** 最佳猜测的合同金额 */
  amount: number | null
  /** 全部金额候选（去重，供人工挑选） */
  amountCandidates: number[]
  /** 识别依据片段（展示给用户核对） */
  evidence: { field: string; text: string }[]
}

/** 常见合同金额关键词（按优先级排列，带「总」的合同额优先） */
const AMOUNT_KEYWORDS = [
  '合同总金额',
  '合同总价',
  '合同总费用',
  '合同总额',
  '开发总费用',
  '项目总费用',
  '总费用',
  '合同金额',
  '合同价款',
  '总价款',
  '含税总价',
  '总金额',
  '开发费用',
  '服务费用',
  '项目金额',
  '开发费',
]

function cleanParty(raw: string): string {
  let s = raw.replace(/\s+/g, '') // OCR 行内公司名可能被空格拆断
  s = s.replace(/[，,。;；].*$/, '') // 截掉逗号之后的说明（如：xxx，以下简称乙方）
  s = s.replace(/（[^）]*）$/, '').replace(/\([^)]*\)$/, '') // 去行尾括号注释，保留主体内的括号（如：光影空间（广州）…）
  return s.trim()
}

function parseAmount(text: string): number | null {
  const m = text.replace(/[,，\s￥¥]/g, '').match(/\d+(?:\.\d{1,2})?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 在关键词之后找「带货币特征」的金额：
 * 1) ￥/¥ 前缀（任意大小）；2) N元 后缀且 N≥100（排除条款号 4.4、比例 50% 等）。
 * 无货币特征一律不认，宁可漏识别交给用户手填。
 */
function findAmountAfter(text: string, kw: string): number | null {
  const idx = text.indexOf(kw)
  if (idx < 0) return null
  const win = text.slice(idx, Math.min(text.length, idx + 60)).replace(/\n/g, ' ')
  let m = win.match(/[￥¥]\s*([\d,，]+(?:\.\d{1,2})?)\s*元?/)
  if (m) return parseAmount(m[1])
  m = win.match(/([\d,，]+(?:\.\d{1,2})?)\s*元/)
  if (m) {
    const n = parseAmount(m[1])
    if (n != null && n >= 100) return n
  }
  return null
}

/** 从合同全文中抽取关键字段（正则规则，可解释、可核对） */
export function parseContractText(fullText: string): ContractParseResult {
  const text = fullText.replace(/\r/g, '')
  const evidence: { field: string; text: string }[] = []

  // 1. 合同标题：首屏出现「xx合同/协议」的行
  let projectName: string | null = null
  const titleLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length >= 6 && /(?:开发|建设|实施|技术服务|软件|系统|定制)[^\n]{0,20}(?:合同|协议)/.test(l)) ?? null
  if (titleLine) {
    projectName = titleLine.replace(/^(?:\d+[.、)\]]\s*)/, '').replace(/[！!。．，,；;：:\s]+$/, '').trim()
    evidence.push({ field: '项目名称', text: projectName })
  }

  // 2. 合同编号
  let contractNo: string | null = null
  const noMatch =
    text.match(/合同\s*(?:编号|No\.?)\s*[:：]?\s*([A-Za-z0-9\-_—／/.()（）]{3,30})/) ??
    text.match(/(?:编号|合同号)\s*[:：]\s*([A-Za-z0-9\-_—／/.()（）]{3,30})/)
  if (noMatch) {
    contractNo = noMatch[1].replace(/[.，,]$/, '').trim()
    evidence.push({ field: '合同编号', text: noMatch[0] })
  }

  // 3. 甲乙方（取首个出现的「甲方：xxx」「乙方：xxx」行）
  let partyA: string | null = null
  let partyB: string | null = null
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!partyA && /^甲\s*方/.test(t)) {
      const m = t.match(/[:：]\s*(.+)$/)
      const v = m ? cleanParty(m[1]) : ''
      if (v.length >= 4) {
        partyA = v
        evidence.push({ field: '甲方', text: t })
      }
    }
    if (!partyB && /^乙\s*方/.test(t)) {
      const m = t.match(/[:：]\s*(.+)$/)
      const v = m ? cleanParty(m[1]) : ''
      if (v.length >= 4) {
        partyB = v
        evidence.push({ field: '乙方', text: t })
      }
    }
    if (partyA && partyB) break
  }

  // 4. 合同金额：按关键词优先级找「带货币特征」的金额，另收集全文 ￥ 候选供人工挑选
  const amountCandidates: number[] = []
  const seen = new Set<string>()
  const push = (n: number | null, ev?: string) => {
    if (n == null) return
    const key = String(n)
    if (seen.has(key)) return
    seen.add(key)
    amountCandidates.push(n)
    if (amountCandidates.length <= 2 && ev) evidence.push({ field: '金额', text: ev })
  }
  for (const kw of AMOUNT_KEYWORDS) {
    if (!text.includes(kw)) continue
    const idx = text.indexOf(kw)
    const around = text.slice(idx, Math.min(text.length, idx + 60)).replace(/\n/g, ' ')
    push(findAmountAfter(text, kw), around.slice(0, 50))
  }
  // 兜底：全文 ￥N元 候选（含分期款 3000/1800/1200 等，供用户在金额栏手动纠正时参考）
  const yen = text.match(/[￥¥]\s*([\d,，]+(?:\.\d{1,2})?)\s*元?/g) ?? []
  for (const m of yen) push(parseAmount(m))
  const amount = amountCandidates.length ? amountCandidates[0] : null

  return { projectName, contractNo, partyA, partyB, amount, amountCandidates, evidence }
}

/** 解析合同 PDF：优先文本层；扫描页自动走 OCR */
export async function parseContractPdf(
  buffer: Buffer,
  engine?: OcrEngine | null,
): Promise<ContractParseResult> {
  const pdf = await parsePdf(buffer, { renderScale: 2 })

  let fullText = pdf.fullText
  // 扫描页（无文本层）：渲染出的页面图走 OCR，按页序拼接
  const ocrPages = pdf.pages.filter((p) => p.image)
  if (ocrPages.length > 0) {
    if (!engine || !engine.isReady()) {
      throw new BadRequestException(
        '该合同 PDF 为扫描件且 OCR 模型未就绪，请先在 OCR 设置中初始化模型，或手动录入关键字段',
      )
    }
    const ocrParts: string[] = []
    for (const page of ocrPages) {
      const ocr = await engine.recognize(page.image!, {})
      ocrParts.push(ocr.lines.map((l) => l.text).join('\n'))
    }
    fullText = [fullText, ...ocrParts].filter(Boolean).join('\n\n')
  }

  if (!fullText.trim()) {
    throw new BadRequestException('未能从合同中提取到文字，请确认文件清晰，或手动录入关键字段')
  }
  return parseContractText(fullText)
}
