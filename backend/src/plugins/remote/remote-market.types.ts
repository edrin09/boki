/** 远程插件市场：索引 v2 与目录行类型（契约见 docs/远程插件市场接入说明.md 第 5.3 节） */

export interface RemoteIndexCategory {
  id: string
  name: string
  parentId?: string | null
  sort?: number
  icon?: string
}

/** 索引条目（/v1/index 里 plugins[] 的字段；未列出的字段一律向下兼容） */
export interface RemoteIndexPlugin {
  id: string
  version: string
  apiVersion: string
  engines?: { boki?: string }
  name: string
  description?: string
  trust?: string
  license?: string
  price?: number
  currency?: string
  licenseUrl?: string | null
  /** 主分类 slug（index v2 增量可选字段；旧索引没有） */
  category?: string
  /** 全部归属（含主分类） */
  categories?: string[]
  download: string
  sha256?: string
  size?: number
  publishedAt?: string
  /** 包内 manifest 并不随索引下发；解压后才有。索引条目只承诺元数据展示 */
  permissions?: never[]
}

/** /v1/index 响应（原始字节即验签对象） */
export interface RemoteIndex {
  version: number
  market: string
  publishedAt: string
  categories?: RemoteIndexCategory[]
  plugins: RemoteIndexPlugin[]
}

/** 目录行：与前端 RemoteMarketPlugin 同形，manifest 为索引元数据的投影 */
export interface RemoteCatalogRow {
  manifest: {
    id: string
    name: string
    version: string
    apiVersion: string
    engines?: { boki?: string }
    trust?: string
    license?: string
    description?: string
    kind?: string
    scopeMode?: 'scoped' | 'global'
    permissions?: string[]
    contributes?: Record<string, unknown>
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    [key: string]: unknown
  }
  installed: boolean
  enabled: boolean
  installedVersion?: string
  hasUpdate: boolean
  /** 远程专属展示字段 */
  category?: string
  categories?: string[]
  price?: number
  currency?: string
  download: string
  sha256?: string
  size?: number
}

export interface RemoteCatalogResponse {
  market?: string
  publishedAt?: string
  version?: number
  categories?: RemoteIndexCategory[]
  plugins: RemoteCatalogRow[]
}
