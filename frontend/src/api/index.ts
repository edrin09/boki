import { get, post, put, del, download, downloadPost, fileStamp, type ApiResult } from './http'

/** 统一导出，业务模块从这里引用 */
export * from './http'

export type { ApiResult }

// ============ 认证 / 记账公司 ============
/** 公司简要信息（下拉选择用） */
export interface CompanyBrief {
  id: string
  code: string
  name: string
  taxNo?: string | null
  status: number
  isOwner?: boolean
}

export interface AuthResult {
  accessToken: string
  expiresIn: string
  user: any
  company: CompanyBrief | null
  companies: CompanyBrief[]
}

export const authApi = {
  login: (data: { username: string; password: string }) =>
    post<AuthResult>('/auth/login', data),
  profile: () => get<any>('/auth/profile'),
  /** 可管理的公司列表 */
  companies: () => get<CompanyBrief[]>('/auth/companies'),
  /** 切换公司：返回带新 companyId 的令牌 */
  switchCompany: (companyId: string) => post<AuthResult>('/auth/switch-company', { companyId }),
  logout: () => post('/auth/logout'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    post('/auth/change-password', data),
}

// ============ 记账公司管理 ============
export const companyApi = {
  /** 内核建账入口：仅当系统还没有任何记账公司时可用（零插件也能建账套） */
  bootstrap: (data: any) => post<any>('/companies/bootstrap', data),
  /** 我可管理的公司（multi-company 插件） */
  mine: () => get<CompanyBrief[]>('/companies'),
  detail: (id: string) => get<any>(`/companies/${id}`),
  create: (data: any) => post<any>('/companies', data),
  update: (id: string, data: any) => put(`/companies/${id}`, data),
  /** 删除公司；force=true 时连同全部业务数据一并删除（不可恢复，需前端二次确认） */
  remove: (id: string, force = false) =>
    del(`/companies/${id}${force ? '?force=true' : ''}`),
  addMembers: (id: string, userIds: string[]) => post(`/companies/${id}/members`, { userIds }),
  setMembers: (id: string, data: { userIds: string[]; roleIds?: string[] }) =>
    put(`/companies/${id}/members`, data),
  removeMember: (id: string, userId: string) =>
    del(`/companies/${id}/members/${encodeURIComponent(userId)}`),
}

// ============ 工作台 / 系统 ============
export const systemApi = {
  dashboard: () => get<any>('/system/dashboard'),
  info: () => get<any>('/system/info'),
  company: () => get<any>('/system/company'),
  saveCompany: (data: {
    companyName?: string
    taxNo?: string
    taxpayerType?: string
    vatRate?: number
    taxDeclareCycle?: string
    autoPostEnabled?: number
    autoPostThreshold?: number
  }) => put('/system/company', data),
  logs: (params?: Record<string, any>) => get<any>('/system/logs', params),
  cleanLogs: (data: { keepDays?: number }) => post('/system/logs/clean', data),
  backups: () => get<any[]>('/system/backups'),
  createBackup: () => post<{ filename: string; size: number }>('/system/backups'),
  restore: (data: { filename: string; confirm: boolean }) =>
    post<{ message: string }>('/system/backups/restore', data),
  removeBackup: (filename: string) => del(`/system/backups/${encodeURIComponent(filename)}`),
  downloadBackup: (filename: string) =>
    download('/system/backups/download', { filename }, filename),
  /** 明文导出：前端须二次确认，导出的文件无需密钥即可打开 */
  downloadBackupPlain: (filename: string) =>
    download(
      '/system/backups/download',
      { filename, format: 'plain' },
      filename.replace(/\.db$/, '-plain.db'),
    ),
  // ============ AI 模型设置 ============
  aiConfig: () =>
    get<{
      provider: string
      baseURL: string
      model: string
      enabled: boolean
      temperature: number
      timeoutMs: number
      apiKeyMasked: string | null
      ready: boolean
      providers: Array<{
        id: string
        name: string
        baseURL: string
        model: string
        keyRequired: boolean
        local: boolean
        remark?: string
      }>
    }>('/ai/config'),
  saveAiConfig: (data: {
    provider?: string
    baseURL?: string
    apiKey?: string
    model?: string
    enabled?: boolean
    temperature?: number
    timeoutMs?: number
  }) => put<{ message: string }>('/ai/config', data),
  testAi: () => post<{ ok: boolean; latencyMs: number; model: string }>('/ai/test'),
  aiStatus: () => get<{ ready: boolean; provider: string; model: string }>('/ai/status'),
}

// ============ 用户 / 角色 / 权限 ============
export const userApi = {
  list: (params?: Record<string, any>) => get<any>('/users', params),
  options: () => get<any[]>('/users/options'),
  detail: (id: string) => get<any>(`/users/${id}`),
  create: (data: any) => post('/users', data),
  update: (id: string, data: any) => put(`/users/${id}`, data),
  updateStatus: (id: string, status: number) => put(`/users/${id}/status`, { status }),
  assignRoles: (id: string, roleIds: string[]) => put(`/users/${id}/roles`, { roleIds }),
  resetPassword: (id: string, password: string) =>
    post(`/users/${id}/reset-password`, { password }),
  remove: (id: string) => del(`/users/${id}`),
}

export const roleApi = {
  list: () => get<any[]>('/roles'),
  options: () => get<any[]>('/roles/options'),
  detail: (id: string) => get<any>(`/roles/${id}`),
  create: (data: any) => post('/roles', data),
  update: (id: string, data: any) => put(`/roles/${id}`, data),
  assignPermissions: (id: string, permissionIds: string[]) =>
    put(`/roles/${id}/permissions`, { permissionIds }),
  remove: (id: string) => del(`/roles/${id}`),
}

export const permissionApi = {
  list: () => get<any[]>('/permissions'),
  tree: () => get<any[]>('/permissions/tree'),
  menus: () => get<any[]>('/permissions/menus'),
  create: (data: any) => post('/permissions', data),
  update: (id: string, data: any) => put(`/permissions/${id}`, data),
  remove: (id: string) => del(`/permissions/${id}`),
}

// ============ 智能识别（证件一键录入） ============
export type ExtractTarget = 'partner' | 'employee'

export interface ExtractField {
  key: string
  label: string
  value: string | number | null
  confidence: number
  targetKey: string | null
  targetLabel: string | null
  selected: boolean
}

export interface ExtractResult {
  fileName: string
  target: ExtractTarget
  targetLabel: string
  docType: string
  docTypeName: string
  docTypeMatched: boolean
  confidence: number
  source: 'ocr' | 'pdf'
  fields: ExtractField[]
  values: Record<string, string | number>
  message?: string
}

export const ocrApi = {
  status: () => get<any>('/ocr/status'),
  /** 上传证件，抽取目标档案的字段建议 */
  extract: (file: File, target: ExtractTarget) => {
    const form = new FormData()
    form.append('file', file)
    return post<ExtractResult>(`/ocr/extract?target=${target}`, form)
  },
}

// ============ 票据智能记账（P15/P17） ============
export const receiptApi = {
  /** 票据列表 */
  list: (params?: Record<string, any>) => get<any>('/receipts', params),
  detail: (id: string) => get<any>(`/receipts/${id}`),
  /** 上传并识别票据（支持多文件 / 整个文件夹） */
  upload: (files: File[], paths?: (string | null)[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    // 文件夹上传时并行提交每个文件的相对路径，与 files 按索引对应；
    // 后端据此做目录智能判定。不传则全部按「无目录」处理。
    if (paths?.length) paths.forEach((p) => form.append('paths', p ?? ''))
    return post<any[]>('/receipts/upload', form)
  },
  remove: (id: string) => del(`/receipts/${id}`),
  /** 修正识别结果（票据类型/进销项方向），仅未入账票据 */
  update: (id: string, data: { receiptType?: string; direction?: 'input' | 'output' }) =>
    put<any>(`/receipts/${id}`, data),
  /** 待确认工作台列表 */
  pending: (params?: Record<string, any>) => get<any>('/receipts/pending', params),
  /** 生成凭证草稿 */
  generateDraft: (id: string) => post<any>(`/receipts/${id}/draft`),
  /** 修改凭证草稿（改科目/改金额） */
  updateDraft: (id: string, data: { voucherDate?: string; entries: any[] }) =>
    put<any>(`/receipts/${id}/draft`, data),
  /** 确认入账 */
  confirm: (id: string) => post<any>(`/receipts/${id}/confirm`),
  /** 批量确认入账 */
  confirmBatch: (ids: string[]) => post<any>('/receipts/confirm-batch', { ids }),
  /** 驳回票据 */
  reject: (id: string, reason?: string) => post<any>(`/receipts/${id}/reject`, { reason }),
  /** 票据原图地址（带鉴权，需 responseType=blob 拉取） */
  fileUrl: (id: string) => `/receipts/${id}/file`,
}

// ============ 归类规则（P17.5） ============
export const classifyRuleApi = {
  list: (params?: Record<string, any>) => get<any>('/receipts/rules', params),
  detail: (id: string) => get<any>(`/receipts/rules/${id}`),
  create: (data: any) => post('/receipts/rules', data),
  update: (id: string, data: any) => put(`/receipts/rules/${id}`, data),
  toggle: (id: string, enabled: number) => put(`/receipts/rules/${id}/toggle`, { enabled }),
  remove: (id: string) => del(`/receipts/rules/${id}`),
}

// ============ 基础档案 ============
export const accountApi = {
  list: (params?: Record<string, any>) => get<any[]>('/accounts', params),
  tree: (params?: Record<string, any>) => get<any[]>('/accounts/tree', params),
  options: () => get<any[]>('/accounts/options'),
  detail: (id: string) => get<any>(`/accounts/${id}`),
  create: (data: any) => post('/accounts', data),
  update: (id: string, data: any) => put(`/accounts/${id}`, data),
  updateStatus: (id: string, status: number) => put(`/accounts/${id}/status`, { status }),
  remove: (id: string) => del(`/accounts/${id}`),
}

export const partnerApi = {
  list: (params?: Record<string, any>) => get<any>('/partners', params),
  options: (type?: string) => get<any[]>('/partners/options', { type }),
  detail: (id: string) => get<any>(`/partners/${id}`),
  create: (data: any) => post('/partners', data),
  batchCreate: (items: any[]) => post<any>('/partners/batch', { items }),
  update: (id: string, data: any) => put(`/partners/${id}`, data),
  remove: (id: string) => del(`/partners/${id}`),
}

export const bankApi = {
  list: (params?: Record<string, any>) => get<any>('/banks', params),
  options: (type?: string) => get<any[]>('/banks/options', { type }),
  detail: (id: string) => get<any>(`/banks/${id}`),
  create: (data: any) => post('/banks', data),
  update: (id: string, data: any) => put(`/banks/${id}`, data),
  remove: (id: string) => del(`/banks/${id}`),
}

export const departmentApi = {
  list: (params?: Record<string, any>) => get<any[]>('/departments', params),
  tree: (params?: Record<string, any>) => get<any[]>('/departments/tree', params),
  options: () => get<any[]>('/departments/options'),
  create: (data: any) => post('/departments', data),
  update: (id: string, data: any) => put(`/departments/${id}`, data),
  remove: (id: string) => del(`/departments/${id}`),
}

export const projectApi = {
  list: (params?: Record<string, any>) => get<any>('/projects', params),
  options: () => get<any[]>('/projects/options'),
  ledger: () => get<any[]>('/projects/ledger'),
  /** 导入合同 PDF，自动识别合同编号/金额/客户 */
  parseContract: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<any>('/projects/parse-contract', form)
  },
  create: (data: any) => post('/projects', data),
  update: (id: string, data: any) => put(`/projects/${id}`, data),
  remove: (id: string) => del(`/projects/${id}`),
}

// ============ 期初余额 ============
export const initialBalanceApi = {
  list: (fiscalYear: number, accountId?: string) =>
    get<any[]>('/initial-balances', { fiscalYear, accountId }),
  check: (fiscalYear: number) => get<any>('/initial-balances/check', { fiscalYear }),
  save: (data: any) => post('/initial-balances', data),
  batch: (data: any) => post('/initial-balances/batch', data),
  remove: (id: string) => del(`/initial-balances/${id}`),
  clearYear: (fiscalYear: number) => del('/initial-balances', { params: { fiscalYear } }),
}

// ============ 凭证 ============
export const voucherApi = {
  list: (params?: Record<string, any>) => get<any>('/vouchers', params),
  detail: (id: string) => get<any>(`/vouchers/${id}`),
  nextNo: (period: number, word = '记') =>
    get<number>('/vouchers/next-no', { period, word }),
  /** 复制凭证：返回新建草稿数据 */
  copy: (id: string) => get<any>(`/vouchers/${id}/copy`),
  create: (data: any) => post('/vouchers', data),
  update: (id: string, data: any) => put(`/vouchers/${id}`, data),
  approve: (id: string) => post(`/vouchers/${id}/approve`),
  unapprove: (id: string) => post(`/vouchers/${id}/unapprove`),
  cancel: (id: string, reason?: string) => post(`/vouchers/${id}/cancel`, { reason }),
  /** 红字冲销 */
  reverse: (id: string, data?: { reversalDate?: string; reason?: string }) =>
    post<{ message: string }>(`/vouchers/${id}/reverse`, data ?? {}),
  remove: (id: string) => del(`/vouchers/${id}`),
}

// ============ 现金银行 / 往来 / 其他收支 ============
export const cashBankApi = {
  list: (params?: Record<string, any>) => get<any>('/cash-bank', params),
  detail: (id: string) => get<any>(`/cash-bank/${id}`),
  create: (data: any) => post('/cash-bank', data),
  update: (id: string, data: any) => put(`/cash-bank/${id}`, data),
  remove: (id: string) => del(`/cash-bank/${id}`),
}

// ============ 银行流水（对账单导入） ============
export const bankStmtApi = {
  /** 上传对账单 Excel/CSV，解析落库并自动匹配 */
  import: (file: File, bankAccountId: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('bankAccountId', bankAccountId)
    return post<any>('/bank-stmt/import', form)
  },
  list: (params?: Record<string, any>) => get<any>('/bank-stmt', params),
  summary: () => get<any>('/bank-stmt/summary'),
  book: (id: string, data: { bizType: string; accountId: string; summary?: string; employeeId?: string; partnerId?: string }) =>
    post<any>(`/bank-stmt/${id}/book`, data),
  batchBook: () => post<any>('/bank-stmt/batch-book', {}),
  skip: (id: string, remark?: string) => post<any>(`/bank-stmt/${id}/skip`, { remark }),
  restore: (id: string) => post<any>(`/bank-stmt/${id}/restore`),
  remove: (id: string) => del(`/bank-stmt/${id}`),
  removeBatch: (batchId: string) => del(`/bank-stmt/batch/${batchId}`),
}

export const arApApi = {
  receivable: (params?: Record<string, any>) => get<any>('/ar-ap/receivable', params),
  payable: (params?: Record<string, any>) => get<any>('/ar-ap/payable', params),
  writeOffs: (params?: Record<string, any>) => get<any>('/ar-ap/write-offs', params),
  createWriteOff: (data: any) => post('/ar-ap/write-off', data),
  removeWriteOff: (id: string) => del(`/ar-ap/write-off/${id}`),
}

export const incomeExpenseApi = {
  list: (params?: Record<string, any>) => get<any>('/income-expense', params),
  detail: (id: string) => get<any>(`/income-expense/${id}`),
  create: (data: any) => post('/income-expense', data),
  update: (id: string, data: any) => put(`/income-expense/${id}`, data),
  remove: (id: string) => del(`/income-expense/${id}`),
}

export const fixedExpenseApi = {
  list: (params?: Record<string, any>) => get<any>('/fixed-expenses', params),
  pending: (untilPeriod?: string) =>
    get<any>('/fixed-expenses/pending', untilPeriod ? { untilPeriod } : undefined),
  suggest: (name: string) => get<any>('/fixed-expenses/suggest', { name }),
  logs: (id: string) => get<any>(`/fixed-expenses/${id}/logs`),
  create: (data: any) => post('/fixed-expenses', data),
  generate: (untilPeriod?: string) =>
    post<any>('/fixed-expenses/generate', untilPeriod ? { untilPeriod } : {}),
  update: (id: string, data: any) => put(`/fixed-expenses/${id}`, data),
  toggleStatus: (id: string, status: number) => put(`/fixed-expenses/${id}/status`, { status }),
  remove: (id: string) => del(`/fixed-expenses/${id}`),
}

// ============ 账簿 ============
// ============ 员工 / 报销 / 工资 ============
export const employeeApi = {
  list: (params?: Record<string, any>) => get<any>('/employees', params),
  options: (onlyOnJob?: boolean) => get<any[]>('/employees/options', { onlyOnJob }),
  detail: (id: string) => get<any>(`/employees/${id}`),
  /** 员工欠款明细：借款单列表 + 核销流水 + 汇总 */
  debts: (id: string) => get<any>(`/employees/${id}/loans`),
  create: (data: any) => post('/employees', data),
  batchCreate: (items: any[]) => post<any>('/employees/batch', { items }),
  /** 导入员工花名册（Excel/CSV）→ 预览解析 */
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<any>('/employees/import', form)
  },
  /** 确认导入预览行 → 批量新建员工（exists 行由后端自动跳过） */
  importCommit: (data: any) => post<any>('/employees/import/commit', data),
  update: (id: string, data: any) => put(`/employees/${id}`, data),
  remove: (id: string) => del(`/employees/${id}`),
}

export const expenseClaimApi = {
  list: (params?: Record<string, any>) => get<any>('/expense-claims', params),
  detail: (id: string) => get<any>(`/expense-claims/${id}`),
  nextNo: (claimDate?: string) => get<string>('/expense-claims/next-no', { claimDate }),
  /** 导入报销单（Excel/CSV）→ 预览解析 */
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<any>('/expense-claims/import', form)
  },
  /** 确认导入预览行 → 生成报销单草稿 */
  importCommit: (data: any) => post<any>('/expense-claims/import/commit', data),
  create: (data: any) => post('/expense-claims', data),
  update: (id: string, data: any) => put(`/expense-claims/${id}`, data),
  approve: (id: string) => post(`/expense-claims/${id}/approve`),
  pay: (id: string, data: any) => post(`/expense-claims/${id}/pay`, data),
  reject: (id: string, reason: string) => post(`/expense-claims/${id}/reject`, { reason }),
  remove: (id: string) => del(`/expense-claims/${id}`),
  /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
  downloadPdfPackage: (data?: Record<string, any>) =>
    downloadPost('/expense-claims/pdf-package', data, `报销单原始凭证_${fileStamp()}.zip`),
}

// ============ 借款单 ============
export const loanApi = {
  list: (params?: Record<string, any>) => get<any>('/loans', params),
  detail: (id: string) => get<any>(`/loans/${id}`),
  nextNo: (loanDate?: string) => get<string>('/loans/next-no', { loanDate }),
  create: (data: any) => post('/loans', data),
  update: (id: string, data: any) => put(`/loans/${id}`, data),
  approve: (id: string) => post(`/loans/${id}/approve`),
  repay: (id: string, data: any) => post(`/loans/${id}/repay`, data),
  reject: (id: string, reason: string) => post(`/loans/${id}/reject`, { reason }),
  remove: (id: string) => del(`/loans/${id}`),
  /** 按员工汇总的往来余额（含未还清借款余额 balance） */
  employeeBalances: (params?: Record<string, any>) => get<any>('/loans/employee-balances', params),
  /** 导入借款单（Excel/CSV）→ 预览解析 */
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<any>('/loans/import', form)
  },
  /** 确认导入预览行 → 生成借款单草稿 */
  importCommit: (data: any) => post<any>('/loans/import/commit', data),
  /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
  downloadPdfPackage: (data?: Record<string, any>) =>
    downloadPost('/loans/pdf-package', data, `借款单原始凭证_${fileStamp()}.zip`),
}

export const payrollApi = {
  list: (params?: Record<string, any>) => get<any>('/payrolls', params),
  detail: (id: string) => get<any>(`/payrolls/${id}`),
  generate: (data: any) => post('/payrolls/generate', data),
  /** 导入工资表（Excel/CSV/图片/PDF）→ 预览解析 */
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<any>('/payrolls/import', form)
  },
  /** 确认导入预览行 → 生成工资单草稿 */
  importCommit: (data: { period: number; payDate: string; rows: any[]; remark?: string }) =>
    post('/payrolls/import/commit', data),
  create: (data: any) => post('/payrolls', data),
  update: (id: string, data: any) => put(`/payrolls/${id}`, data),
  approve: (id: string) => post(`/payrolls/${id}/approve`),
  pay: (id: string, data: any) => post(`/payrolls/${id}/pay`, data),
  remove: (id: string) => del(`/payrolls/${id}`),
  /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
  downloadPdfPackage: (data?: Record<string, any>) =>
    downloadPost('/payrolls/pdf-package', data, `工资表原始凭证_${fileStamp()}.zip`),
}

export const booksApi = {
  ledger: (params?: Record<string, any>) => get<any>('/books/ledger', params),
  subLedger: (params?: Record<string, any>) => get<any>('/books/sub-ledger', params),
  balance: (params?: Record<string, any>) => get<any>('/books/balance', params),
  trialBalance: (params?: Record<string, any>) => get<any>('/books/trial-balance', params),
}

// ============ 报表 ============
export const reportApi = {
  balanceSheet: (params?: Record<string, any>) => get<any>('/reports/balance-sheet', params),
  profitLoss: (params?: Record<string, any>) => get<any>('/reports/profit-loss', params),
  ledger: (params?: Record<string, any>) => get<any>('/reports/ledger', params),
  cashFlow: (params?: Record<string, any>) => get<any>('/reports/cash-flow', params),
  expenseAnalysis: (params?: Record<string, any>) => get<any>('/reports/expense-analysis', params),
  monthlyClose: (params?: Record<string, any>) => get<any>('/reports/monthly-close', params),
  overview: (params?: Record<string, any>) => get<any>('/reports/overview', params),
}

// ============ 插件市场 ============
export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: string
  description?: string
  icon?: string
  author?: string
  license?: string
  trust?: string
  scopeMode?: string
  kind?: string
  dependencies?: Record<string, string>
  /** 软依赖：仅共享数据/接口，停用后相关功能降级，不拦截、不隐藏 */
  optionalDependencies?: Record<string, string>
  permissions?: string[]
  contributes?: Record<string, any>
}

export interface MarketPlugin {
  manifest: PluginManifest
  installed: boolean
  enabled: boolean
  installedVersion?: string
  hasUpdate: boolean
}

export interface InstalledPlugin {
  manifest: PluginManifest
  enabled: boolean
  installedAt: string
  dir: string
  /** 是否有更新：前端用远程市场目录比对（内核不持有目录版本） */
  hasUpdate?: boolean
  /** 硬依赖中缺失（未安装/未启用）的项；此时插件会从菜单隐藏 */
  missingDependencies?: string[]
}

export interface PluginActionResult {
  id: string
  restartRequired: boolean
  installed?: string[]
  enabled?: boolean
  keepData?: boolean
}

// ============ 远程插件市场（boki-market 独立服务端）============

export interface RemoteMarketCategory {
  id: string
  name: string
  parentId?: string | null
  sort?: number
  icon?: string
}

export interface RemoteMarketPlugin extends MarketPlugin {
  kind?: string
  category?: string
  categories?: string[]
  price?: number
  currency?: string
  download?: string
  sha256?: string
  size?: number
}

export interface RemoteMarketCatalog {
  market?: string
  publishedAt?: string
  version?: number
  categories?: RemoteMarketCategory[]
  plugins: RemoteMarketPlugin[]
}

export interface RemoteMarketStatus {
  enabled: boolean
  url?: string
  market?: string
  snapshotVersion?: number
  publishedAt?: string
  snapshotStale?: boolean
  publicKeysConfigured: boolean
  /** 不可用原因（未配置地址 / 健康检查失败），原样展示给管理员 */
  error?: string
}

export const pluginApi = {
  installed: () => get<InstalledPlugin[]>('/plugins'),
  manifests: () => get<PluginManifest[]>('/plugins/manifests'),
  detail: (id: string) => get<{ manifest: PluginManifest; installed: boolean; enabled: boolean }>(`/plugins/${id}`),
  remoteStatus: () => get<RemoteMarketStatus>('/market/remote/status'),
  remoteCatalog: () => get<RemoteMarketCatalog>('/market/remote/catalog'),
  remoteInstall: (id: string, licenseKey?: string) =>
    post<PluginActionResult>(`/market/remote/plugins/${id}/install`, licenseKey ? { licenseKey } : {}),
  enable: (id: string) => post<PluginActionResult>(`/plugins/${id}/enable`),
  disable: (id: string) => post<PluginActionResult>(`/plugins/${id}/disable`),
  uninstall: (id: string, keepData = true) =>
    del<PluginActionResult>(`/plugins/${id}?keepData=${keepData}`),
}