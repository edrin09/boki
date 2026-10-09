<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.status" placeholder="单据状态" clearable style="width: 130px" @change="search">
          <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-select v-model="query.employeeId" placeholder="报销人" clearable filterable style="width: 160px" @change="search">
          <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:expense-claim:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增报销单
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无报销单">
        <el-table-column prop="claimNo" label="单号" width="130" />
        <el-table-column prop="claimDate" label="报销日期" width="115" />
        <el-table-column label="报销人" width="160">
          <template #default="{ row }">{{ row.employeeName }}</template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column label="支付方式" width="130">
          <template #default="{ row }">
            <el-tag :type="PAY_METHOD_TAGS[row.payMethod]" size="small">{{ PAY_METHODS[row.payMethod] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额合计" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAGS[row.status]" size="small">{{ row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="凭证" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.voucherId" type="success" size="small">已生成</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onView(row)">查看</el-button>
            <template v-if="row.status === 'draft'">
              <el-button v-permission="'hr:expense-claim:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
              <el-button v-permission="'hr:expense-claim:approve'" link type="success" @click="onApprove(row)">审核</el-button>
              <el-button v-permission="'hr:expense-claim:approve'" link type="info" @click="onReject(row)">驳回</el-button>
            </template>
            <el-button
              v-if="row.status === 'approved' && row.payMethod !== 'advance'"
              v-permission="'hr:expense-claim:pay'"
              link
              type="warning"
              @click="onPay(row)"
            >
              付款
            </el-button>
            <el-button
              v-if="row.status !== 'paid'"
              v-permission="'hr:expense-claim:delete'"
              link
              type="danger"
              @click="onRemove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="onReset" />
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="860px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="报销单号">
              <el-tag type="info">{{ previewNo }}</el-tag>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="报销日期" prop="claimDate">
              <el-date-picker v-model="form.claimDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="报销人" prop="employeeId">
              <el-select v-model="form.employeeId" filterable placeholder="选择员工" style="width: 100%">
                <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="支付方式">
              <el-select v-model="form.payMethod" style="width: 100%" @change="onPayMethodChange">
                <el-option v-for="(label, key) in PAY_METHODS" :key="key" :label="label" :value="key" />
              </el-select>
              <div class="form-tip">{{ PAY_METHOD_HINTS[form.payMethod] }}</div>
            </el-form-item>
          </el-col>
          <el-col v-if="form.payMethod !== 'advance'" :span="8">
            <el-form-item label="付款账户">
              <el-select v-model="form.bankAccountId" clearable filterable placeholder="付款时选择" style="width: 100%">
                <el-option v-for="b in bankOptions" :key="b.id"
                  :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <el-divider content-position="left">费用明细</el-divider>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 200px">费用说明</th>
            <th style="width: 260px">费用科目</th>
            <th style="width: 140px">金额</th>
            <th style="width: 60px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in form.items" :key="index">
            <td><div class="cell"><el-input v-model="item.summary" placeholder="如：差旅费" /></div></td>
            <td>
              <div class="cell">
                <el-select v-model="item.accountId" filterable clearable placeholder="默认取管理费用" style="width: 100%">
                  <el-option v-for="a in expenseAccountOptions" :key="a.id"
                    :label="`${a.code} ${a.fullName}`" :value="a.id" />
                </el-select>
              </div>
            </td>
            <td>
              <div class="cell">
                <el-input-number v-model="item.amount" :min="0" :precision="2" :controls="false" style="width: 100%" />
              </div>
            </td>
            <td class="text-center">
              <el-button link type="danger" :disabled="form.items.length <= 1" @click="form.items.splice(index, 1)">
                删除
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="items-footer">
        <el-button size="small" @click="form.items.push(newItem())">
          <el-icon><Plus /></el-icon>增加费用行
        </el-button>
        <span class="items-footer__total">
          合计：<b class="amount amount--total">{{ formatAmount(totalAmount) }}</b>
        </span>
      </div>

      <el-form label-width="100px" class="mt12">
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存草稿</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="报销单详情" size="720px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="单号">{{ detail.claimNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="STATUS_TAGS[detail.status]" size="small">{{ detail.statusLabel }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="报销日期">{{ detail.claimDate }}</el-descriptions-item>
          <el-descriptions-item label="报销人">{{ detail.employeeName }}</el-descriptions-item>
          <el-descriptions-item label="部门">{{ detail.departmentName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="支付方式">{{ PAY_METHODS[detail.payMethod] }}</el-descriptions-item>
          <el-descriptions-item label="金额合计">
            <span class="amount amount--total">{{ formatAmount(detail.totalAmount) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="付款账户">{{ detail.bankAccountName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="detail.items ?? []" class="mt12" size="small">
          <el-table-column prop="summary" label="费用说明" min-width="150" />
          <el-table-column label="费用科目" min-width="180">
            <template #default="{ row }">
              <span v-if="row.accountCode">{{ row.accountCode }} {{ row.accountName }}</span>
              <span v-else class="text-muted">默认（管理费用）</span>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="130" align="right">
            <template #default="{ row }">
              <span class="amount">{{ formatAmount(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Download } from '@element-plus/icons-vue'
import { accountApi, bankApi, employeeApi, expenseClaimApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { exportExcel } from '@/utils/export'

const PAY_METHODS: Record<string, string> = {
  advance: '员工垫付',
  cash: '现金支付',
  bank: '银行支付',
}
const PAY_METHOD_TAGS: Record<string, any> = { advance: 'warning', cash: 'primary', bank: 'success' }
const PAY_METHOD_HINTS: Record<string, string> = {
  advance: '审核时费用挂「其他应收款」，后续由员工自行核销',
  cash: '审核时直接贷记「库存现金」',
  bank: '审核时贷记对应银行账户，付款时再冲减其他应收款',
}
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', approved: '已审核', paid: '已付款', rejected: '已驳回',
}
const STATUS_TAGS: Record<string, any> = {
  draft: 'info', approved: 'success', paid: 'primary', rejected: 'danger',
}

const dateRange = ref<[string, string] | null>(null)
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, status: '', employeeId: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return expenseClaimApi.list(params)
  },
})

const employeeOptions = ref<any[]>([])
const bankOptions = ref<any[]>([])
const expenseAccountOptions = ref<any[]>([])
const previewNo = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()

function newItem() {
  return { summary: '', accountId: '', amount: 0 }
}

const initialForm = {
  claimDate: new Date().toISOString().slice(0, 10),
  employeeId: '',
  payMethod: 'advance' as string,
  bankAccountId: '',
  remark: '',
  items: [newItem()] as Array<{ summary: string; accountId: string; amount: number }>,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  claimDate: [{ required: true, message: '请选择报销日期', trigger: 'change' }],
  employeeId: [{ required: true, message: '请选择报销人', trigger: 'change' }],
}

const dialogTitle = computed(() => (editId.value ? '编辑报销单' : '新增报销单'))

const totalAmount = computed(() =>
  form.items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0),
)

function onReset() {
  query.status = ''
  query.employeeId = ''
  dateRange.value = null
  reset()
}

function onPayMethodChange() {
  if (form.payMethod === 'advance') form.bankAccountId = ''
}

async function onCreate() {
  editId.value = ''
  Object.assign(form, JSON.parse(JSON.stringify(initialForm)))
  try {
    previewNo.value = await expenseClaimApi.nextNo(form.claimDate)
  } catch {
    previewNo.value = ''
  }
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onEdit(row: any) {
  editId.value = row.id
  const detail = await expenseClaimApi.detail(row.id)
  Object.assign(form, {
    claimDate: String(detail.claimDate).slice(0, 10),
    employeeId: detail.employeeId,
    payMethod: detail.payMethod,
    bankAccountId: detail.bankAccountId ?? '',
    remark: detail.remark ?? '',
    items: (detail.items ?? []).map((i: any) => ({
      summary: i.summary ?? '',
      accountId: i.accountId ?? '',
      amount: Number(i.amount ?? 0),
    })),
  })
  if (!form.items.length) form.items = [newItem()]
  previewNo.value = detail.claimNo
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const items = form.items.filter((i) => (Number(i.amount) || 0) > 0)
  if (!items.length) {
    ElMessage.warning('请至少录入一条金额大于 0 的费用明细')
    return
  }
  saving.value = true
  try {
    const payload: any = { ...form, items }
    if (!payload.bankAccountId) delete payload.bankAccountId
    if (!payload.remark) delete payload.remark
    if (editId.value) await expenseClaimApi.update(editId.value, payload)
    else await expenseClaimApi.create(payload)
    ok(editId.value ? '修改成功' : '保存成功，审核后自动生成记账凭证')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onApprove(row: any) {
  try {
    await ElMessageBox.confirm(
      `审核后将为「${row.claimNo}」生成记账凭证（${formatAmount(row.totalAmount)} 元），确认审核吗？`,
      '审核报销单', { type: 'warning' },
    )
  } catch { return }
  try {
    await expenseClaimApi.approve(row.id)
    ok('审核成功，已生成记账凭证')
    load()
  } catch { /* 错误已提示 */ }
}

async function onPay(row: any) {
  let bankAccountId = row.bankAccountId
  if (!bankAccountId) {
    ElMessage.warning('该单据未指定付款账户，请编辑单据选择付款账户后再付款')
    return
  }
  try {
    await ElMessageBox.confirm(`确认支付 ${formatAmount(row.totalAmount)} 元给「${row.employeeName}」吗？`, '报销付款', { type: 'warning' })
  } catch { return }
  try {
    await expenseClaimApi.pay(row.id, { bankAccountId })
    ok('付款成功，已生成付款凭证')
    load()
  } catch { /* 错误已提示 */ }
}

async function onReject(row: any) {
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('请填写驳回原因', '驳回报销单', {
      inputValidator: (v: string) => (v && v.trim() ? true : '请填写驳回原因'),
    })
    reason = res.value ?? ''
  } catch { return }
  try {
    await expenseClaimApi.reject(row.id, reason)
    ok('已驳回')
    load()
  } catch { /* 错误已提示 */ }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`报销单「${row.claimNo}」`))) return
  try {
    await expenseClaimApi.remove(row.id)
    ok('删除成功')
    load()
  } catch { /* 错误已提示 */ }
}

const detailVisible = ref(false)
const detail = ref<any>(null)

async function onView(row: any) {
  detail.value = await expenseClaimApi.detail(row.id)
  detailVisible.value = true
}

function onExport() {
  exportExcel({
    filename: `报销单_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '报销单',
    columns: [
      { title: '单号', prop: 'claimNo', width: 14 },
      { title: '报销日期', prop: 'claimDate', width: 12 },
      { title: '报销人', prop: 'employeeName', width: 12 },
      { title: '部门', prop: 'departmentName', width: 14 },
      { title: '支付方式', prop: 'payMethod', width: 12, format: (r) => PAY_METHODS[r.payMethod] ?? '' },
      { title: '金额合计', prop: 'totalAmount', width: 15, amount: true },
      { title: '状态', prop: 'statusLabel', width: 10 },
    ],
    rows: list.value as any[],
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  employeeOptions.value = await employeeApi.options()
  bankOptions.value = await bankApi.options()
  const all = await accountApi.options()
  expenseAccountOptions.value = all.filter((a: any) => a.category === 'profit' || a.category === 'cost')
  load()
})
</script>

<style scoped lang="scss">
.items-table {
  width: 100%;
  border-collapse: collapse;

  th {
    background: #f8fafc;
    font-size: 13px;
    color: #374151;
    padding: 8px 6px;
    border: 1px solid var(--app-border);
    text-align: center;
  }

  td {
    border: 1px solid var(--app-border);
    vertical-align: top;
  }
}

.items-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;

  &__total {
    font-size: 14px;
    color: var(--app-text-secondary);
  }
}

.form-tip {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.text-muted {
  color: #9ca3af;
}

.mt12 {
  margin-top: 12px;
}
</style>