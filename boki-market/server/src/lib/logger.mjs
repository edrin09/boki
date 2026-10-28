/**
 * 结构化日志：每行一条 JSON，交给 journald / 采集器处理。
 * 不打印查询串（其中可能带 license 授权码）。
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

export function createLogger({ level = 'info', out = process.stdout, err = process.stderr } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info

  function emit(levelName, message, fields) {
    if ((LEVELS[levelName] ?? 100) < threshold) return
    const line = { ts: new Date().toISOString(), level: levelName, msg: message, ...fields }
    ;(levelName === 'error' || levelName === 'warn' ? err : out).write(`${JSON.stringify(line)}\n`)
  }

  return {
    level,
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  }
}
