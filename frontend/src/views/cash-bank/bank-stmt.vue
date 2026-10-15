<template>
  <div class="page">
    <!-- 汇总卡片 -->
    <el-row :gutter="12" class="summary">
      <el-col :span="6">
        <el-card shadow="never">
          <div class="s-label">流水总笔数</div>
          <div class="s-value">{{ summary.total ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="s-label">已自动识别（利息/手续费/借款）</div>
          <div class="s-value">{{ (summary.booked ?? 0) + (summary.matched ?? 0) }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="s-label">待确认</div>
          <div class="s-value warn">{{ summary.pending ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="s-label">收入 / 支出合计</div>
          <div class="s-value small">
            {{ fmt(summary.creditTotal) }} / {{ fmt(summary.debitTotal) }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 工具条 -->
    <el-card shadow="never" class="toolbar">
      <el-upload
        :show-file-list="false"
        accept=".xlsx,.xls,.csv"
        :before-upload="beforeUpload"
      >
        <el-button type="primary" :loading="importing" :disabled="!bankAccountId">
          上传对账单（Excel/CSV）
        </el-button>
      </el-upload>
      <el-select
        v-model="bankAccountId"
        placeholder="选择资金账户"
        style="width: 240px; margin-left: 12px"
      >
        <el-option v-for="b in banks" :key="b.id" :label="b.name" :value="b.id" />
      </el-select>
      <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 140px; margin-left: 12px" @change="load">
        <el-option label="待确认" value="pending" />
        <el-option label="已入账" value="booked" />
        <el-option label="已匹配" value="matched" />
        <el-option label="已跳过" value="skipped" />
      </el-select>
      <el-button style="margin-left: 12px" @click="load">刷新</el-button>
      <span v-if="!bankAccountId" class="tip">请先选择资金账户（收款/付款将记到该账户）</span>
    </el-card>

    <!-- 流水列表 -->
    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" size="small" stripe>
        <el-table-column prop="rowDate" label="日期" width="100" />
        <el-table-column prop="summary" label="摘要" min-width="140" show-overflow-tooltip />
        <el-table-column prop="counterName" label="对方户名" min-width="130" show-overflow-tooltip />
        <el-table-column prop="credit" label="收入" width="100" align="right">
          <template #default="{ row }">{{ row.credit > 0 ? fmt(row.credit) : '' }}</template>
        </el-table-column>
        <el-table-column prop="debit" label="支出" width="100" align="right">
          <template #default="{ row }">{{ row.debit > 0 ? fmt(row.debit) : '' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="matchInfo" label="识别/建议" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.matchInfo }}</span>
            <span v-if="row.suggestAccountCode" class="suggest">
              → {{ row.suggestAccountCode }} {{ row.suggestAccountName }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              type="primary"
              size="small"
              @click="openBook(row)"
            >入账</el-button>
            <el-button
              v-if="row.status === 'pending' || row.status === 'matched'"
              size="small"
              @click="skip(row)"
            >跳过</el-button>
            <el-button v-if="row.status === 'skipped'" size="small" @click="restore(row)">恢复</el-button>
            <el-button type="danger" size="small" link @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pager"
        v-model:current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </el-card>

    <!-- 入账对话框 -->
    <el-dialog v-model="bookDialog" title="流水入账" width="460px">
      <el-form label-width="90px">
        <el-form-item label="金额">
          <span class="amount">{{ fmt(current?.debit > 0 ? current?.debit : current?.credit) }}</span>
        </el-form-item>
        <el-form-item label="业务类型">
          <el-radio-group v-model="bookForm.bizType">
            <el-radio-button
              v-for="t in bizTypes"
              :key="t.value"
              :value="t.value"
            >{{ t.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="对方科目">
          <el-select v-model="bookForm.accountId" filterable placeholder="选择会计科目" style="width: 100%">
            <el-option
              v-for="a in accounts"
              :key="a.id"
              :label="`${a.code} ${a.fullName || a.name}`"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="bookForm.summary" placeholder="留空默认用流水摘要" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bookDialog = false">取消</el-button>
        <el-button type="primary" :loading="booking" @click="confirmBook">确认入账</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { bankStmtApi, bankApi, accountApi } from '@/api'

const summary = ref<any>({})
const rows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const importing = ref(false)
const booking = ref(false)
const banks = ref<any[]>([])
const accounts = ref<any[]>([])
const bankAccountId = ref('')
const bookDialog = ref(false)
const current = ref<any>(null)

const query = reactive({ page: 1, pageSize: 50, status: '' })
const bookForm = reactive({ bizType: 'expense', accountId: '', summary: '' })

const bizTypes = [
  { value: 'expense', label: '费用支出' },
  { value: 'payment', label: '付款（冲应付/往来）' },
  { value: 'receipt', label: '收款（冲应收/往来）' },
  { value: 'income', label: '其他收入' },
]

onMounted(async () => {
  const [b, a] = await Promise.all([bankApi.list({ pageSize: 100 }), accountApi.tree()])
  banks.value = b?.list ?? b ?? []
  accounts.value = flattenAccounts(a ?? [])
  await Promise.all([load(), loadSummary()])
})

function flattenAccounts(list: any[], prefix = ''): any[] {
  const out: any[] = []
  for (const a of list) {
    const fullName = prefix ? `${prefix}/${a.name}` : a.name
    if (a.isLeaf !== false) out.push({ ...a, fullName })
    if (a.children?.length) out.push(...flattenAccounts(a.children, fullName))
  }
  return out
}

async function load() {
  loading.value = true
  try {
    const res = await bankStmtApi.list({ ...query, status: query.status || undefined })
    rows.value = res?.list ?? []
    total.value = res?.total ?? 0
  } finally {
    loading.value = false
  }
}

async function loadSummary() {
  summary.value = await bankStmtApi.summary()
}

function beforeUpload(file: File) {
  if (!bankAccountId.value) {
    ElMessage.warning('请先选择资金账户')
    return false
  }
  importing.value = true
  bankStmtApi
    .import(file, bankAccountId.value)
    .then(async (res: any) => {
      ElMessage.success(
        `导入 ${res.total} 行：已建议/匹配 ${res.total - res.pending} 行，待确认 ${res.pending} 行`,
      )
      await Promise.all([load(), loadSummary()])
    })
    .finally(() => {
      importing.value = false
    })
  return false // 阻止 el-upload 自动上传
}

function openBook(row: any) {
  current.value = row
  bookForm.bizType = row.suggestBizType || (row.credit > 0 ? 'receipt' : 'expense')
  bookForm.accountId = row.suggestAccountId || ''
  bookForm.summary = ''
  bookDialog.value = true
}

async function confirmBook() {
  if (!bookForm.accountId) {
    ElMessage.warning('请选择对方科目')
    return
  }
  booking.value = true
  try {
    await bankStmtApi.book(current.value.id, { ...bookForm })
    ElMessage.success('已入账并生成凭证')
    bookDialog.value = false
    await Promise.all([load(), loadSummary()])
  } finally {
    booking.value = false
  }
}

async function skip(row: any) {
  const { value } = await ElMessageBox.prompt('跳过原因（如：已在借款单/工资模块记账）', '跳过', {
    inputValue: row.status === 'matched' ? row.matchInfo : '',
  })
  await bankStmtApi.skip(row.id, value)
  ElMessage.success('已跳过')
  await Promise.all([load(), loadSummary()])
}

async function restore(row: any) {
  await bankStmtApi.restore(row.id)
  ElMessage.success('已恢复为待确认')
  await load()
}

async function removeRow(row: any) {
  await ElMessageBox.confirm(
    row.status === 'booked'
      ? '该行已入账，删除将同时删除对应的资金单据和凭证，确认？'
      : '确认删除该流水行？',
    '删除',
    { type: 'warning' },
  )
  await bankStmtApi.remove(row.id)
  ElMessage.success('已删除')
  await Promise.all([load(), loadSummary()])
}

function statusText(s: string): string {
  const map: Record<string, string> = { booked: '已入账', matched: '已匹配', pending: '待确认', skipped: '已跳过' }
  return map[s] ?? s
}

function statusTag(s: string): string {
  const map: Record<string, string> = { booked: 'success', matched: 'info', pending: 'warning', skipped: 'danger' }
  return map[s] ?? 'info'
}

function fmt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<style scoped>
.page { padding: 12px; }
.summary { margin-bottom: 12px; }
.s-label { font-size: 12px; color: #909399; }
.s-value { font-size: 22px; font-weight: 600; margin-top: 4px; }
.s-value.warn { color: #e6a23c; }
.s-value.small { font-size: 16px; }
.toolbar { margin-bottom: 12px; }
.toolbar :deep(.el-card__body) { display: flex; align-items: center; }
.tip { margin-left: 12px; color: #e6a23c; font-size: 12px; }
.suggest { color: #409eff; margin-left: 4px; }
.pager { margin-top: 12px; justify-content: flex-end; }
.amount { font-size: 18px; font-weight: 600; color: #303133; }
</style>
