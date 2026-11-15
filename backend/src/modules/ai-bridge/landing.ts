import { AI_LANDINGS, type ActionManifest, type AiLanding } from './protocol'

/**
 * 草稿闸门（方案 §4 / W9）。
 *
 * 「开放的是意图，收紧的是落点」：动作可以无限增加，但任何写入只能落草稿。
 * 这里提供两道程序化约束，避免只靠适配器自觉：
 *
 * 1. `assertLanding()`   —— 注册期：manifest 必须声明合法 landing，否则注册失败；
 * 2. `assertDraftOnly()` —— 执行期：适配器返回结果里出现已审核 / 已发放 / 已过账
 *    状态时直接抛错（而不是静默接受），把「顺手写个直通分支」变成启动即失败。
 */

/** 结果里被视为「状态字段」的键名（只查这些，避免误伤普通业务字段） */
const STATE_KEYS = new Set([
  'status',
  'state',
  'newStatus',
  'voucherStatus',
  'payrollStatus',
  'docStatus',
  'approveStatus',
])

/** 禁止出现在 AI 执行结果里的状态值：出现即意味着绕过了人工复核 */
const FORBIDDEN_STATES = new Set([
  'approved',
  'audited',
  'paid',
  'posted',
  'issued',
  'settled',
  'confirmed',
  'completed',
])

export class DraftGateViolation extends Error {
  constructor(message: string) {
    super(`草稿闸门拦截：${message}`)
    this.name = 'DraftGateViolation'
  }
}

/** 注册期校验：landing 必须是白名单值（故意没有 direct） */
export function assertLanding(manifest: ActionManifest): AiLanding {
  const landing = manifest?.landing as AiLanding | undefined
  if (!landing || !AI_LANDINGS.includes(landing)) {
    throw new Error(
      `动作「${manifest?.id ?? '(未命名)'}」未声明合法 landing（只允许 ${AI_LANDINGS.join(' / ')}），注册已拒绝`,
    )
  }
  return landing
}

/** 运行期兜底：扫描执行结果，出现「已生效」状态直接抛错 */
export function assertDraftOnly(result: unknown, actionId = ''): void {
  const hit = scan(result, 0)
  if (hit) {
    throw new DraftGateViolation(
      `动作「${actionId || '未知'}」返回了 ${hit.key}=${hit.value}，AI 路径不允许产生已生效数据`,
    )
  }
}

function scan(value: unknown, depth: number): { key: string; value: string } | null {
  if (depth > 5 || value === null || value === undefined) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = scan(item, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (typeof value !== 'object') return null

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (STATE_KEYS.has(key) && typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase()
      if (FORBIDDEN_STATES.has(normalized)) return { key, value: raw }
    }
    // 显式打开了自动审核开关，同样视为绕过闸门
    if ((key === 'autoApprove' || key === 'autoAudit') && raw === true) {
      return { key, value: 'true' }
    }
    const hit = scan(raw, depth + 1)
    if (hit) return hit
  }
  return null
}
