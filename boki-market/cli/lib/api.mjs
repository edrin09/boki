/**
 * 市场管理接口客户端（fetch，零依赖）。
 *
 * 约定：
 *   - 令牌只放 Authorization 头，不写日志、不进 URL；
 *   - 服务端错误保留 code/message/problems，便于定位「哪个插件缺主分类」；
 *   - 市场地址允许带路径前缀（例如 https://example.com/market）。
 */
import { CliError, formatApiError } from './errors.mjs'

function buildUrl(marketUrl, pathname, query) {
  const base = marketUrl.endsWith('/') ? marketUrl : `${marketUrl}/`
  const url = new URL(String(pathname).replace(/^\/+/, ''), base)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  }
  return url
}

export function createApi(config) {
  async function request(
    pathname,
    {
      method = 'GET',
      query,
      body,
      contentType = 'application/json',
      auth = true,
      timeoutMs = config.timeoutMs,
      extraHeaders = {},
    } = {},
  ) {
    if (!config.marketUrl) throw new CliError('缺少市场地址（MARKET_URL 或 --url）')
    const headers = { accept: 'application/json', 'user-agent': 'boki-marketctl', ...extraHeaders }
    if (auth) {
      if (!config.adminToken) {
        throw new CliError('缺少管理令牌（MARKET_ADMIN_TOKEN 或 --token）')
      }
      headers.authorization = `Bearer ${config.adminToken}`
    }
    if (body !== undefined) headers['content-type'] = contentType

    let payload
    if (body !== undefined) {
      payload = Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body)
      if (payload === undefined) throw new CliError('请求体序列化失败')
    }

    let response
    try {
      response = await fetch(buildUrl(config.marketUrl, pathname, query), {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new CliError(`请求超时（${Math.round(timeoutMs / 1000)}s）：${method} ${pathname}`)
      }
      throw new CliError(`无法连接市场服务 ${config.marketUrl}：${error.cause?.message || error.message}`)
    }

    const text = await response.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }

    if (!response.ok) {
      let hint = ''
      if (response.status === 401) hint = '\n  提示：检查 MARKET_ADMIN_TOKEN 是否为服务端当前令牌'
      else if (response.status === 503) hint = '\n  提示：服务端未配置 MARKET_ADMIN_TOKEN，管理接口未启用'
      throw new CliError(`${formatApiError(response.status, json, text)}${hint}`)
    }

    if (json !== null) return json
    return text
  }

  return {
    request,
    health: () => request('/v1/health', { auth: false }),
    candidate: () => request('/v1/admin/index/candidate'),
    activate: (body) => request('/v1/admin/index/activate', { method: 'POST', body }),
    release: ({ zip, pluginId, version, apiVersion, engines, publishedAt, signature, sha256 }) =>
      request('/v1/admin/releases', {
        method: 'POST',
        query: { pluginId, version, apiVersion, engines, publishedAt, signature },
        body: zip,
        contentType: 'application/zip',
        timeoutMs: Math.max(config.timeoutMs, 120_000),
        // sha256 作为自检头：让服务端在入库前拒绝内容不一致
        extraHeaders: sha256 ? { 'x-plugin-sha256': sha256 } : {},
      }),
    setStatus: (pluginId, status) =>
      request(`/v1/admin/plugins/${encodeURIComponent(pluginId)}/status`, {
        method: 'PUT',
        body: { status },
      }),
    issueLicense: (body) => request('/v1/admin/licenses', { method: 'POST', body }),
    revokeLicense: (id) =>
      request(`/v1/admin/licenses/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
    verifyLicense: (body) => request('/v1/license/verify', { method: 'POST', body, auth: false }),
    audit: ({ action, limit = 20, offset = 0 } = {}) =>
      request('/v1/admin/audit', { query: { action, limit, offset } }),
  }
}
