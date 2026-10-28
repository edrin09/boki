/**
 * 进程内固定窗口限流（按来源 IP）。
 * 生产环境的第一道限流在 nginx（limit_req），这里是兜底，防止源码直跑时被打满。
 */
export function createRateLimiter({ limit, windowMs = 60_000, now = Date.now } = {}) {
  const enabled = Number.isFinite(limit) && limit > 0
  const buckets = new Map()

  function prune(at) {
    if (buckets.size < 10_000) return
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= at) buckets.delete(key)
    }
  }

  return {
    enabled,
    check(key) {
      if (!enabled) return { allowed: true, remaining: limit, retryAfterSec: 0 }
      const at = now()
      let bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= at) {
        bucket = { count: 0, resetAt: at + windowMs }
        buckets.set(key, bucket)
      }
      bucket.count += 1
      prune(at)
      const allowed = bucket.count <= limit
      return {
        allowed,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - at) / 1000)),
      }
    },
    reset() {
      buckets.clear()
    },
    get size() {
      return buckets.size
    },
  }
}
