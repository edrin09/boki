<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.status" placeholder="单据状态" clearable style="width: 130px" @change="search">
          <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-select v-model="query.employeeId" placeholder="借款人" clearable filterable style="width: 160px" @change="search">
          <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:loan:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增借款单
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无借款单">
        <el-table-column prop="loanNo" label="单号" width="130" />
        <el-table-column prop="loanDate" label="借款日期" width="115" />
        <el-table-column label="借款人" width="160">
          <template #default="{ row }">{{ row.employeeName }}</template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="借款事由" min-width="160">
          <template #default="{ row }">{{ row.reason || '-' }}</template>
        </el-table-column>
        <el-table-column label="借款方式" width="110">
          <template #default="{ row }">
            <el-tag :type="PAY_METHOD_TAGS[row.payMethod]" size="small">{{ PAY_METHODS[row.payMethod] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="借款金额" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAGS[row.status]" size="small">
              {{ row.repaidAmount > 0 && row.status === 'approved' ? '部分已还' : row.statusLabel }}
            </el-tag>
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
              <el-button v-permission="'hr:loan:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
              <el-button v-permission="'hr:loan:approve'" link type="success" @click="onApprove(row)">审核</el-button>
              <el-button v-permission="'hr:loan:approve'" link type="info" @click="onReject(row)">驳回</el-button>
            </template>
            <el-button
              v-if="row.status === 'approved'"
              v-permission="'hr:loan:repay'"
              link
              type="warning"
              @click="onRepay(row)"
            >
              还款
            </el-button>
            <el-button
              v-if="row.status !== 'repaid'"
              v-permission="'hr:loan:delete'"
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
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="借款单号">
              <el-tag type="info">{{ previewNo }}</el-tag>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="借款日期" prop="loanDate">
              <el-date-picker v-model="form.loanDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="借款人" prop="employeeId">
              <el-select v-model="form.employeeId" filterable placeholder="选择员工" style="width: 100%">
                <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="借款金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0" :precision="2" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="借款方式">
              <el-select v-model="form.payMethod" style="width: 100%" @change="onPayMethodChange">
                <el-option v-for="(label, key) in PAY_METHODS" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="放款账户">
              <el-select v-model="form.bankAccountId" clearable filterable placeholder="未选则取默认科目" style="width: 100%">
                <el-option v-for="b in bankOptions" :key="b.id"
                  :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="借款事由">
          <el-input v-model="form.reason" maxlength="200" show-word-limit placeholder="如：差旅费备用金" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存草稿</el-button>
      </template>
    </el-dialog>

    <!-- 还款弹窗 -->
    <el-dialog v-model="repayVisible" title="借款还款" width="520px" destroy-on-close>
      <el-form ref="repayFormRef" :model="repayForm" :rules="repayRules" label-width="100px">
        <el-form-item label="借款单号">
          <el-tag type="info">{{ repayRow?.loanNo }}</el-tag>
          <span class="ml8">借款人：{{ repayRow?.employeeName }}</span>
          <span class="ml8">借款：<b class="amount amount--total">{{ formatAmount(repayRow?.amount) }}</b></span>
        </el-form-item>
        <el-form-item label="还款进度">
          <span>
            已还：<b class="amount">{{ formatAmount(repayRow?.repaidAmount) }}</b>
            <span class="ml8">剩余待还：<b class="amount amount--outstanding">{{ formatAmount(repayRow?.outstanding) }}</b></span>
          </span>
        </el-form-item>
        <el-form-item label="本次还款" prop="amount">
          <el-input-number
            v-model="repayForm.amount"
            :min="0.01"
            :max="repayRow?.outstanding"
            :precision="2"
            :step="100"
            style="width: 220px"
          />
          <el-button class="ml8" size="small" @click="repayForm.amount = repayRow?.outstanding">
            全额还清（{{ formatAmount(repayRow?.outstanding) }}）
          </el-button>
        </el-form-item>
        <el-form-item label="还款方式" prop="repayMethod">
          <el-select v-model="repayForm.repayMethod" style="width: 100%">
            <el-option v-for="(label, key) in PAY_METHODS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="回款账户">
          <el-select v-model="repayForm.bankAccountId" clearable filterable placeholder="未选则取默认科目" style="width: 100%">
            <el-option v-for="b in bankOptions" :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="还款日期" prop="repayDate">
          <el-date-picker v-model="repayForm.repayDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="repayForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="repayVisible = false">取消</el-button>
        <el-button type="primary" :loading="repaying" @click="onRepaySubmit">确认还款</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="借款单详情" size="600px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="单号">{{ detail.loanNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="STATUS_TAGS[detail.status]" size="small">{{ detail.statusLabel }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="借款日期">{{ detail.loanDate }}</el-descriptions-item>
          <el-descriptions-item label="借款人">{{ detail.employeeName }}</el-descriptions-item>
          <el-descriptions-item label="部门">{{ detail.departmentName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="借款方式">{{ PAY_METHODS[detail.payMethod] }}</el-descriptions-item>
          <el-descriptions-item label="借款金额">
            <span class="amount amount--total">{{ formatAmount(detail.amount) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="已还 / 剩余">
            {{ formatAmount(detail.repaidAmount) }} / {{ formatAmount(detail.outstanding) }}
          </el-descriptions-item>
          <el-descriptions-item label="放款账户">{{ detail.bankAccountName || '默认科目' }}</el-descriptions-item>
          <el-descriptions-item label="借款事由" :span="2">{{ detail.reason || '-' }}</el-descriptions-item>
          <el-descriptions-item label="还款日期">{{ detail.repayDate || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近还款凭证">{{ detail.repayVoucherId ? '已生成' : '-' }}</el-descriptions-item>
          <el-descriptions-item label="制单人">{{ detail.createdByName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Download } from '@element-plus/icons-vue'
import { bankApi, employeeApi, loanApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { exportExcel } from '@/utils/export'

const PAY_METHODS: Record<string, string> = {
  cash: '现金',
  bank: '银行转账',
}
const PAY_METHOD_TAGS: Record<string, any> = { cash: 'primary', bank: 'success' }
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', approved: '已借款', repaid: '已还款', rejected: '已驳回',
}
const STATUS_TAGS: Record<string, any> = {
  draft: 'info', approved: 'warning', repaid: 'primary', rejected: 'danger',
}

const dateRange = ref<[string, string] | null>(null)
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, status: '', employeeId: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return loanApi.list(params)
  },
})

const employeeOptions = ref<any[]>([])
const bankOptions = ref<any[]>([])
const previewNo = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()

const initialForm = {
  loanDate: new Date().toISOString().slice(0, 10),
  employeeId: '',
  amount: 0,
  reason: '',
  payMethod: 'cash' as string,
  bankAccountId: '',
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  loanDate: [{ required: true, message: '请选择借款日期', trigger: 'change' }],
  employeeId: [{ required: true, message: '请选择借款人', trigger: 'change' }],
  amount: [{ required: true, message: '请输入借款金额', trigger: 'blur' }],
}

const dialogTitle = computed(() => (editId.value ? '编辑借款单' : '新增借款单'))

function onReset() {
  query.status = ''
  query.employeeId = ''
  dateRange.value = null
  reset()
}

function onPayMethodChange() {
  if (form.payMethod === 'cash') form.bankAccountId = ''
}

async function onCreate() {
  editId.value = ''
  Object.assign(form, JSON.parse(JSON.stringify(initialForm)))
  try {
    previewNo.value = await loanApi.nextNo(form.loanDate)
  } catch {
    previewNo.value = ''
  }
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onEdit(row: any) {
  editId.value = row.id
  const detail = await loanApi.detail(row.id)
  Object.assign(form, {
    loanDate: String(detail.loanDate).slice(0, 10),
    employeeId: detail.employeeId,
    amount: Number(detail.amount ?? 0),
    reason: detail.reason ?? '',
    payMethod: detail.payMethod,
    bankAccountId: detail.bankAccountId ?? '',
    remark: detail.remark ?? '',
  })
  previewNo.value = detail.loanNo
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if ((Number(form.amount) || 0) <= 0) {
    ElMessage.warning('借款金额必须大于 0')
    return
  }
  saving.value = true
  try {
    const payload: any = { ...form }
    if (!payload.bankAccountId) delete payload.bankAccountId
    if (!payload.reason) delete payload.reason
    if (!payload.remark) delete payload.remark
    if (editId.value) await loanApi.update(editId.value, payload)
    else await loanApi.create(payload)
    ok(editId.value ? '修改成功' : '保存成功，审核后自动发放借款并生成凭证')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onApprove(row: any) {
  try {
    await ElMessageBox.confirm(
      `审核后将向「${row.employeeName}」发放借款 ${formatAmount(row.amount)} 元，并生成借款凭证，确认审核吗？`,
      '审核借款单', { type: 'warning' },
    )
  } catch { return }
  try {
    await loanApi.approve(row.id)
    ok('审核成功，已发放借款并生成凭证')
    load()
  } catch { /* 错误已提示 */ }
}

// 还款
const repayVisible = ref(false)
const repaying = ref(false)
const repayRow = ref<any>(null)
const repayFormRef = ref<FormInstance>()
const repayForm = reactive({
  amount: undefined as number | undefined,
  repayMethod: 'cash' as string,
  bankAccountId: '',
  repayDate: new Date().toISOString().slice(0, 10),
  remark: '',
})
const repayRules: FormRules = {
  amount: [{ required: true, message: '请填写本次还款金额', trigger: 'blur' }],
  repayMethod: [{ required: true, message: '请选择还款方式', trigger: 'change' }],
  repayDate: [{ required: true, message: '请选择还款日期', trigger: 'change' }],
}

function onRepay(row: any) {
  repayRow.value = row
  Object.assign(repayForm, {
    amount: row.outstanding ?? row.amount, // 默认剩余欠款全额
    repayMethod: row.payMethod,
    bankAccountId: row.bankAccountId ?? '',
    repayDate: new Date().toISOString().slice(0, 10),
    remark: '',
  })
  repayVisible.value = true
  nextTick(() => repayFormRef.value?.clearValidate())
}

async function onRepaySubmit() {
  const valid = await repayFormRef.value?.validate().catch(() => false)
  if (!valid) return
  repaying.value = true
  try {
    const payload: any = { ...repayForm }
    if (!payload.bankAccountId) delete payload.bankAccountId
    if (!payload.remark) delete payload.remark
    const res = await loanApi.repay(repayRow.value.id, payload)
    const cleared = res?.status === 'repaid'
    ok(cleared ? '已还清，状态更新为「已还款」' : '部分还款成功，已生成还款凭证')
    repayVisible.value = false
    load()
  } finally {
    repaying.value = false
  }
}

async function onReject(row: any) {
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('请填写驳回原因', '驳回借款单', {
      inputValidator: (v: string) => (v && v.trim() ? true : '请填写驳回原因'),
    })
    reason = res.value ?? ''
  } catch { return }
  try {
    await loanApi.reject(row.id, reason)
    ok('已驳回')
    load()
  } catch { /* 错误已提示 */ }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`借款单「${row.loanNo}」`))) return
  try {
    await loanApi.remove(row.id)
    ok('删除成功')
    load()
  } catch { /* 错误已提示 */ }
}

const detailVisible = ref(false)
const detail = ref<any>(null)

async function onView(row: any) {
  detail.value = await loanApi.detail(row.id)
  detailVisible.value = true
}

function onExport() {
  exportExcel({
    filename: `借款单_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '借款单',
    columns: [
      { title: '单号', prop: 'loanNo', width: 14 },
      { title: '借款日期', prop: 'loanDate', width: 12 },
      { title: '借款人', prop: 'employeeName', width: 12 },
      { title: '部门', prop: 'departmentName', width: 14 },
      { title: '借款事由', prop: 'reason', width: 20 },
      { title: '借款方式', prop: 'payMethod', width: 12, format: (r) => PAY_METHODS[r.payMethod] ?? '' },
      { title: '借款金额', prop: 'amount', width: 15, amount: true },
      { title: '状态', prop: 'statusLabel', width: 10 },
    ],
    rows: list.value as any[],
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  employeeOptions.value = await employeeApi.options()
  bankOptions.value = await bankApi.options()
  load()
})
</script>

<style scoped lang="scss">
.text-muted {
  color: #9ca3af;
}

.amount--outstanding {
  color: #e6a23c;
}

.ml8 {
  margin-left: 8px;
}
</style>
