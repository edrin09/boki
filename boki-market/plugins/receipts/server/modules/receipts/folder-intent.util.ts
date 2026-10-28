/**
 * 目录智能判定（AI 智能记账的「文件夹约定」）
 *
 * 背景：会计习惯按业务归类放票，例如
 *   采购单/张三/发票1.pdf
 *   报销/李四/打车票.pdf
 *   工资/2026-10/工资表.xlsx
 * 目录名本身就是人工给出的「业务意图」，比 OCR 文本更可靠。
 * 本模块把 folderPath 解析成结构化意图，供归类与凭证生成使用。
 *
 * 设计原则：
 * - 纯计算、不落库、不抛异常：判不准就返回 unknown，交回 OCR/规则链路。
 * - 目录层级从后往前优先匹配：越靠近文件的目录越具体（如「采购单/张三」中
 *   「张三」比「采购单」更贴近单据归属）。
 */

/** 目录名推断出的业务用途 */
export type FolderPurpose =
  | 'purchase' // 采购（含采购发票、采购付款）
  | 'expense' // 费用报销
  | 'payroll' // 工资
  | 'bank' // 银行流水/对账单
  | 'income' // 收入/销售
  | 'unknown'

export const FOLDER_PURPOSE_LABELS: Record<FolderPurpose, string> = {
  purchase: '采购',
  expense: '费用报销',
  payroll: '工资',
  bank: '银行流水',
  income: '收入',
  unknown: '未识别用途',
}

/** 用途关键词：命中任一即判定（按最长优先，避免「采购报销」这类歧义被短词抢先） */
const PURPOSE_KEYWORDS: Array<{ purpose: FolderPurpose; keywords: string[] }> = [
  {
    purpose: 'purchase',
    keywords: [
      '采购', '采购单', '采购发票', '进货', '购入', '物料', '原材料', '库存',
      'purchase', 'procurement', 'buy', 'po',
    ],
  },
  {
    purpose: 'expense',
    keywords: [
      '报销', '费用', '差旅', '交通', '办公', '招待', '福利',
      'expense', 'reimburse', 'claim',
    ],
  },
  {
    purpose: 'payroll',
    keywords: ['工资', '薪资', '薪酬', '工资表', '工资单', 'payroll', 'salary', 'wage'],
  },
  {
    purpose: 'bank',
    keywords: ['银行', '对账', '流水', '回单', 'bank', 'statement', 'bankstmt'],
  },
  {
    purpose: 'income',
    keywords: ['收入', '销售', '收款', 'income', 'sale', 'revenue'],
  },
]

/** 目录名中常见的非归属噪声词：出现这些词的目录段不当成员工/项目名 */
const NOISE_SEGMENTS = new Set([
  '扫描件', '扫描', '原件', '复印件', '图片', '照片', '票据', '发票', '单据',
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls', 'csv',
  '扫描版', '电子', '附件', 'tmp', 'temp', 'new', '新建文件夹', '未命名',
  'scan', 'scans', 'img', 'image', 'images', 'doc', 'docs',
])

export interface FolderIntent {
  /** 原始相对目录（不含文件名），以 / 结尾 */
  raw: string
  /** 逐级目录段，如 ['采购单', '张三'] */
  segments: string[]
  /** 推断用途 */
  purpose: FolderPurpose
  purposeLabel: string
  /** 命中用途的目录段（供前端展示判定依据） */
  purposeHit: string | null
  /** 疑似归属人（员工姓名）——用于员工借款/报销抵充 */
  ownerName: string | null
  /** 疑似期间（如 2026-10 / 2026年10月）*/
  periodHint: string | null
  /** 目录能否给出有效意图：至少识别出用途或归属人 */
  matched: boolean
}

/** 期间归一化：2026-10 / 2026年10月 / 202610 → 202610（与系统期间口径一致） */
function normalizePeriod(seg: string): string | null {
  const s = seg.trim()
  let m = s.match(/^(20\d{2})[-_/年.](\d{1,2})月?$/)
  if (m) return `${m[1]}${m[2].padStart(2, '0')}`
  m = s.match(/^(20\d{2})(\d{2})$/)
  if (m) {
    const month = Number(m[2])
    if (month >= 1 && month <= 12) return `${m[1]}${m[2]}`
  }
  return null
}

/**
 * 从相对路径推断目录意图。
 * 相对路径来自浏览器 webkitRelativePath，形如 `采购单/张三/发票.pdf`，
 * 也可能带顶层选中目录名（浏览器行为差异），因此从后往前匹配更稳。
 */
export function parseFolderIntent(relativePath: string | null | undefined): FolderIntent {
  const raw = (relativePath ?? '').replace(/\\/g, '/')
  // 去掉末尾文件名，保留目录部分
  const dirPart = raw.includes('/') ? raw.slice(0, raw.lastIndexOf('/') + 1) : ''
  const segments = dirPart
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)

  const base: FolderIntent = {
    raw: dirPart,
    segments,
    purpose: 'unknown',
    purposeLabel: FOLDER_PURPOSE_LABELS.unknown,
    purposeHit: null,
    ownerName: null,
    periodHint: null,
    matched: false,
  }
  if (!segments.length) return base

  // 用途：从后往前找，命中关键词最长的目录段优先
  let best: { seg: string; purpose: FolderPurpose; len: number } | null = null
  for (const seg of segments) {
    const lower = seg.toLowerCase()
    for (const { purpose, keywords } of PURPOSE_KEYWORDS) {
      for (const kw of keywords) {
        if (lower.includes(kw) && (!best || kw.length > best.len)) {
          best = { seg, purpose, len: kw.length }
        }
      }
    }
  }
  if (best) {
    base.purpose = best.purpose
    base.purposeLabel = FOLDER_PURPOSE_LABELS[best.purpose]
    base.purposeHit = best.seg
  }

  // 期间：任一段能解析成期间即取（取最后一个，通常最接近单据）
  for (const seg of segments) {
    const p = normalizePeriod(seg)
    if (p) base.periodHint = p
  }

  // 归属人：优先取「紧邻用途目录之后」的那一段（采购单/张三 → 张三），
  // 因为会计惯例是「用途/人/...」；找不到再退化为从后往前扫第一个候选段。
  const ownerCandidate = (seg: string): boolean => {
    if (NOISE_SEGMENTS.has(seg.toLowerCase())) return false
    if (normalizePeriod(seg)) return false
    if (seg === base.purposeHit) return false
    // 用途目录本身（含关键词）不当归属人
    const lower = seg.toLowerCase()
    if (PURPOSE_KEYWORDS.some((g) => g.keywords.some((k) => lower.includes(k)))) return false
    // 排除纯数字/纯符号目录（多为编号目录，不是人名）
    if (!/[\u4e00-\u9fa5a-zA-Z]/.test(seg)) return false
    // 目录名过长基本不是人名
    if (seg.length > 20) return false
    return true
  }

  const hitIdx = base.purposeHit ? segments.indexOf(base.purposeHit) : -1
  if (hitIdx >= 0) {
    for (let i = hitIdx + 1; i < segments.length; i++) {
      if (ownerCandidate(segments[i])) {
        base.ownerName = segments[i]
        break
      }
    }
  }
  if (!base.ownerName) {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (ownerCandidate(segments[i])) {
        base.ownerName = segments[i]
        break
      }
    }
  }

  base.matched = base.purpose !== 'unknown' || !!base.ownerName
  return base
}

/**
 * 按 folderPath 前缀聚合：把同一目录下的文件归为一组，
 * 供前端展示「本次上传按目录识别为：采购 → 张三（N 个文件）」。
 */
export function groupByFolder(
  items: Array<{ folderPath?: string | null; fileName: string }>,
): Array<{ folderPath: string; intent: FolderIntent; count: number; files: string[] }> {
  const map = new Map<string, { folderPath: string; intent: FolderIntent; files: string[] }>()
  for (const it of items) {
    const key = it.folderPath ?? ''
    const hit = map.get(key)
    if (hit) hit.files.push(it.fileName)
    else map.set(key, { folderPath: key, intent: parseFolderIntent(it.folderPath), files: [it.fileName] })
  }
  return [...map.values()].map((v) => ({ ...v, count: v.files.length }))
}
