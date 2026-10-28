/**
 * 最小 SemVer 实现（够市场发布使用，不引第三方依赖）
 * 支持 1.2.3 / 1.2.3-beta.1 / 1.2.3+build；build 不参与比较。
 */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function isSemver(value) {
  return typeof value === 'string' && SEMVER_RE.test(value)
}

function parse(value) {
  const match = SEMVER_RE.exec(String(value ?? ''))
  if (!match) throw new Error(`不是合法版本号：${value}`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function comparePrerelease(a, b) {
  if (!a.length && !b.length) return 0
  if (!a.length) return 1 // 正式版 > 预发布版
  if (!b.length) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    const numericA = /^\d+$/.test(a[i])
    const numericB = /^\d+$/.test(b[i])
    if (numericA && numericB) {
      const diff = Number(a[i]) - Number(b[i])
      if (diff !== 0) return diff > 0 ? 1 : -1
    } else if (numericA !== numericB) {
      return numericA ? -1 : 1 // 数字标识 < 字母标识
    } else if (a[i] !== b[i]) {
      return a[i] > b[i] ? 1 : -1
    }
  }
  return 0
}

/** a > b 返回 1，a < b 返回 -1，相等返回 0 */
export function compareSemver(a, b) {
  const left = parse(a)
  const right = parse(b)
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}
