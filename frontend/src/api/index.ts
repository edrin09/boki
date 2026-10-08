import { get, post, put, del, download, type ApiResult } from './http'

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
  /** 我可管理的公司 */
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
  /** 上传并识别票据（多文件） */
  upload: (files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return post<any[]>('/receipts/upload', form)
  },
  remove: (id: string) => del(`/receipts/${id}`),
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

// ============ 账簿 ============
// ============ 员工 / 报销 / 工资 ============
export const employeeApi = {
  list: (params?: Record<string, any>) => get<any>('/employees', params),
  options: (onlyOnJob?: boolean) => get<any[]>('/employees/options', { onlyOnJob }),
  detail: (id: string) => get<any>(`/employees/${id}`),
  create: (data: any) => post('/employees', data),
  batchCreate: (items: any[]) => post<any>('/employees/batch', { items }),
  update: (id: string, data: any) => put(`/employees/${id}`, data),
  remove: (id: string) => del(`/employees/${id}`),
}

export const expenseClaimApi = {
  list: (params?: Record<string, any>) => get<any>('/expense-claims', params),
  detail: (id: string) => get<any>(`/expense-claims/${id}`),
  nextNo: (claimDate?: string) => get<string>('/expense-claims/next-no', { claimDate }),
  create: (data: any) => post('/expense-claims', data),
  update: (id: string, data: any) => put(`/expense-claims/${id}`, data),
  approve: (id: string) => post(`/expense-claims/${id}/approve`),
  pay: (id: string, data: any) => post(`/expense-claims/${id}/pay`, data),
  reject: (id: string, reason: string) => post(`/expense-claims/${id}/reject`, { reason }),
  remove: (id: string) => del(`/expense-claims/${id}`),
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