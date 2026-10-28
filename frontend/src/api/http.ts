import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'

/** 统一响应结构 */
export interface ApiResult<T = any> {
  code: number
  message: string
  data: T
  timestamp: number
}

const TOKEN_KEY = 'financial_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** 业务异常（携带 HTTP 状态码） */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

/** 请求拦截：注入 Token */
service.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/** 401 回调（由路由层注册，避免循环依赖） */
let unauthorizedHandler: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler
}

/** 响应拦截：拆包 + 统一错误提示 */
service.interceptors.response.use(
  ((response: AxiosResponse) => {
    const res = response.data as ApiResult
    // 文件下载等非标准响应直接返回
    if (res === undefined || res === null || typeof res.code === 'undefined') {
      return response
    }
    if (res.code !== 0) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new ApiError(res.message, response.status, res.code))
    }
    // 统一拆包：仅返回 data
    return res as unknown as AxiosResponse
  }) as (response: AxiosResponse) => AxiosResponse,
  async (error) => {
    const status = error?.response?.status
    let body = error?.response?.data

    if (status === 401) {
      // 下载等 blob 响应的错误体也是 Blob，需要异步解出 JSON 才能拿到业务码
      if (body && typeof body.text === 'function') {
        try {
          body = JSON.parse(await body.text())
        } catch {
          /* 非 JSON 错误体，按会话过期处理 */
        }
      }
      clearToken()
      unauthorizedHandler?.()
      const message = body?.message || '登录已过期，请重新登录'
      ElMessage.error(message)
      return Promise.reject(new ApiError(message, 401, body?.code))
    }

    // 超时/断网等无响应错误：给出可读的中文提示，避免暴露 axios 原始英文
    if (!status && /timeout/i.test(error?.message ?? '')) {
      const message = '请求超时，请稍后重试'
      ElMessage.error(message)
      return Promise.reject(new ApiError(message, 0))
    }

    const message =
      body?.message ??
      (status ? `请求失败（HTTP ${status}）` : error?.message || '网络异常，请检查后端服务')
    ElMessage.error(message)

    return Promise.reject(new ApiError(message, status ?? 0, body?.code))
  },
)

/** GET 请求 */
export async function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  const res = (await service.get(url, { params })) as unknown as ApiResult<T>
  return res.data
}

/** POST 请求 */
export async function post<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = (await service.post(url, data, config)) as unknown as ApiResult<T>
  return res.data
}

/** PUT 请求 */
export async function put<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = (await service.put(url, data, config)) as unknown as ApiResult<T>
  return res.data
}

/** DELETE 请求 */
export async function del<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = (await service.delete(url, config)) as unknown as ApiResult<T>
  return res.data
}

/** 下载文件（带 Token） */
export async function download(
  url: string,
  params?: Record<string, any>,
  filename?: string,
) {
  const res = await service.get(url, { params, responseType: 'blob' })
  const blob = new Blob([res.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename ?? 'download'
  link.click()
  URL.revokeObjectURL(link.href)
}

/** POST 下载文件（带 Token，用于批量导出等需要传 body 的下载接口） */
export async function downloadPost(url: string, data?: any, filename?: string) {
  const res = await service.post(url, data, { responseType: 'blob' })
  const blob = new Blob([res.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename ?? 'download'
  link.click()
  URL.revokeObjectURL(link.href)
}

/** 当前时间戳（文件名用） */
export function fileStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export default service