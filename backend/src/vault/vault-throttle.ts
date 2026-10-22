/**
 * 解锁限流（共享给两处，T3）：
 *
 * 1. 启动引导壳 `vault-bootstrap.ts`（锁定态裸 http 解锁接口）
 * 2. 内核 `vault.service.unlock()`（进程已启动、Nest 托管时手动锁定后的解锁接口）
 *
 * 策略（方案 §16.2 的 42910）：
 * - 同一「来源标识」60 秒窗口内失败 ≥ 5 次 → 直接 429（附剩余秒数）
 * - 连续失败 ≥ 20 次 → 锁定 5 分钟内全部 429
 */
export interface AttemptState {
  /** 窗口内累计失败次数 */
  failures: number
  /** 窗口开始时间 */
  windowStart: number
  /** 锁定截止时间（毫秒时间戳，0 = 未锁定） */
  lockedUntil: number
}

/** 同一来源在窗口内允许的失败次数（第 6 次 429，对应 T3） */
export const UNLOCK_MAX_FAILURES_PER_WINDOW = 5
/** 失败计数窗口（毫秒） */
export const UNLOCK_WINDOW_MS = 60_000
/** 连续失败达到该次数后长时间锁定 */
export const UNLOCK_LOCK_AFTER_FAILURES = 20
/** 长时间锁定时长（毫秒） */
export const UNLOCK_LOCK_MS = 5 * 60_000

const attempts = new Map<string, AttemptState>()

function newState(now: number): AttemptState {
  return { failures: 0, windowStart: now, lockedUntil: 0 }
}

/** 清理过期尝试记录（窗口已滚过且无锁定），避免内存无限增长 */
export function pruneUnlockAttempts(now: number = Date.now()): void {
  for (const [ip, state] of attempts) {
    if (state.lockedUntil <= now && now - state.windowStart > UNLOCK_WINDOW_MS) {
      attempts.delete(ip)
    }
  }
}

/**
 * 解锁前的门禁检查。
 *
 * @returns null = 放行；否则返回应返回的 429 信息。
 */
export function findUnlockThrottle(
  ip: string,
  now: number = Date.now(),
): { retryAfter: number } | null {
  const state = attempts.get(ip)
  if (!state) return null
  if (state.lockedUntil > now) {
    return { retryAfter: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)) }
  }
  if (state.failures >= UNLOCK_MAX_FAILURES_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((UNLOCK_WINDOW_MS - (now - state.windowStart)) / 1000))
    return { retryAfter }
  }
  return null
}

/**
 * 记录一次解锁失败。
 *
 * @returns `{ locked: true, retryAfter }` 表示触发了长时间锁定（调用方应直接回 429）；
 *          否则返回 `{ locked: false, remaining }`（调用方回 401，附剩余次数）。
 */
export function recordUnlockFailure(
  ip: string,
  now: number = Date.now(),
): { locked: true; retryAfter: number } | { locked: false; remaining: number } {
  const state = attempts.get(ip) ?? { ...newState(now) }
  // 窗口滚动：窗口外的新失败重新起窗
  if (now - state.windowStart > UNLOCK_WINDOW_MS) {
    state.windowStart = now
    state.failures = 0
  }
  state.failures += 1
  attempts.set(ip, state)

  if (state.failures >= UNLOCK_LOCK_AFTER_FAILURES) {
    state.lockedUntil = now + UNLOCK_LOCK_MS
    attempts.set(ip, state)
    return { locked: true, retryAfter: Math.ceil(UNLOCK_LOCK_MS / 1000) }
  }
  return {
    locked: false,
    remaining: Math.max(0, UNLOCK_MAX_FAILURES_PER_WINDOW - state.failures),
  }
}

/** 解锁成功后清空该来源的失败记录 */
export function resetUnlockFailures(ip: string): void {
  attempts.delete(ip)
}
