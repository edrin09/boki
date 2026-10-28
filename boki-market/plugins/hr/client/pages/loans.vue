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
        <el-button :loading="pdfExporting" @click="onPdfPackage">
          <el-icon><Printer /></el-icon>生成凭证PDF
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:loan:create'" @click="importVisible = true">
          <el-icon><Upload /></el-icon>导入
        </el-button>
        <el-button v-permission="'hr:loan:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增借款单
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无借款单" @selection-change="selected = $event">
        <el-table-column type="selection" width="42" />
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
          @current-change="load" @size-change="handleSize" />
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

    <!-- 导入借款单弹窗 -->
    <el-dialog v-model="importVisible" title="导入借款单" width="1040px" destroy-on-close>
      <template v-if="!importPreviewData">
        <el-upload v-loading="importParsing" drag :auto-upload="false" :limit="1" accept=".xlsx,.xls,.csv"
          :on-change="onImportFileChange" :on-remove="onImportFileRemove" :file-list="importFileList">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽 Excel / CSV 到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">按表头关键词自动映射（单号/借款日期/借款人/借款事由/借款方式/金额等），选择文件后立即解析预览；未匹配的借款人可在预览中手动指定</div>
          </template>
        </el-upload>
      </template>

      <template v-else>
        <div class="import-head">
          <el-alert
            :type="importPreviewData.summary.unmatched || importPreviewData.summary.duplicates ? 'warning' : 'success'"
            :closable="false" show-icon class="import-head__alert"
            :title="`共 ${importPreviewData.summary.total} 行：匹配 ${importPreviewData.summary.matched} 行，未匹配 ${importPreviewData.summary.unmatched} 行，金额合计 ${formatAmount(importPreviewData.summary.totalAmount)}`" />
        </div>
        <el-table :data="importRows" size="small" max-height="440px">
          <el-table-column type="index" label="#" width="45" align="center" />
          <el-table-column label="单号" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.loanNoTaken" size="small" type="info">自动生成</el-tag>
              <span v-else>{{ row.loanNo || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="loanDate" label="借款日期" width="105" />
          <el-table-column label="借款人" width="150">
            <template #default="{ row }">
              <template v-if="row.matched">{{ row.employeeName }}</template>
              <el-select v-else v-model="row.employeeId" filterable placeholder="选择员工" size="small"
                style="width: 100%" @change="onImportEmployeeChange(row)">
                <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="借款事由" min-width="130">
            <template #default="{ row }">{{ row.reason || '-' }}</template>
          </el-table-column>
          <el-table-column label="借款方式" width="95">
            <template #default="{ row }">{{ row.payMethodLabel || PAY_METHODS[row.payMethod] }}</template>
          </el-table-column>
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="说明" min-width="130">
            <template #default="{ row }">
              <span :class="{ 'import-warning-text': row.duplicate }">{{ row.message }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="importUnmatchedCount" class="import-warning">
          {{ importUnmatchedCount }} 行未匹配到员工档案，请在行内选择员工；未选择的行将被跳过。
        </div>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <template v-if="importPreviewData">
          <el-button @click="backToUpload"><el-icon><Back /></el-icon>重新选择文件</el-button>
          <el-button type="primary" :loading="importCommitting" @click="onImportCommit">确认导入</el-button>
        </template>
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
import { Plus, Search, Download, Upload, UploadFilled, Back, Printer } from '@element-plus/icons-vue'
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
const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return loanApi.list(params)
  },
  defaultParams: { page: 1, pageSize: 20, status: '', employeeId: '' },
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
  query.value.status = ''
  query.value.employeeId = ''
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

// ============ 导入借款单 ============
const importVisible = ref(false)
const importFileList = ref<any[]>([])
const importParsing = ref(false)
const importPreviewData = ref<any>(null)
const importRows = ref<any[]>([])
const importCommitting = ref(false)

const importUnmatchedCount = computed(() =>
  importRows.value.filter((r: any) => !r.employeeId).length,
)

function onImportFileChange(_file: any, files: any[]) {
  importFileList.value = files
  onImportParse()
}

function onImportFileRemove(_file: any, files: any[]) {
  importFileList.value = files
}

async function onImportParse() {
  const raw = importFileList.value.find((f: any) => f.raw instanceof File)?.raw as File | undefined
  if (!raw) return
  importParsing.value = true
  try {
    const res = await loanApi.importPreview(raw)
    importPreviewData.value = res
    importRows.value = (res.rows ?? []).map((r: any) => ({ ...r }))
  } finally {
    importParsing.value = false
  }
}

function backToUpload() {
  importPreviewData.value = null
  importRows.value = []
  importFileList.value = []
}

function onImportEmployeeChange(row: any) {
  if (row.employeeId) row.message = ''
}

async function onImportCommit() {
  const rows = importRows.value.filter((r: any) => r.matched && r.employeeId)
  if (!rows.length) {
    ElMessage.warning('没有可导入的行，请先为未匹配的借款人选择员工档案')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将生成 ${rows.length} 条借款单草稿，审核后才会生成凭证，确认导入吗？`,
      '确认导入',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '取消' },
    )
  } catch { return }
  importCommitting.value = true
  try {
    const res = await loanApi.importCommit({
      rows: rows.map((r: any) => {
        const item: any = {
          employeeId: r.employeeId,
          loanDate: r.loanDate,
          amount: Number(r.amount ?? 0),
          payMethod: r.payMethod,
        }
        if (r.loanNo) item.loanNo = r.loanNo
        if (r.reason) item.reason = r.reason
        return item
      }),
    })
    ok(`导入完成：生成 ${res.created} 条借款单草稿`)
    if (res.failed) ElMessage.warning(`有 ${res.failed} 行导入失败`)
    importVisible.value = false
    backToUpload()
    load()
  } finally {
    importCommitting.value = false
  }
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

// ============ 批量生成原始凭证 PDF ============
const selected = ref<any[]>([])
const pdfExporting = ref(false)

async function onPdfPackage() {
  const ids = selected.value.map((r: any) => r.id)
  const count = ids.length || total.value
  if (!count) {
    ElMessage.warning('当前没有可导出的借款单')
    return
  }
  try {
    await ElMessageBox.confirm(
      ids.length
        ? `将把选中的 ${ids.length} 张借款单各生成一份 PDF（原始凭证存根）并打包为压缩包下载，解压后即可打印。继续吗？`
        : `未勾选单据时将按当前筛选条件打包全部 ${total.value} 张借款单 PDF，继续吗？`,
      '生成原始凭证 PDF',
      { type: 'info', confirmButtonText: '生成并下载', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  pdfExporting.value = true
  try {
    const payload: Record<string, any> = ids.length
      ? { ids }
      : {
          status: query.value.status || undefined,
          employeeId: query.value.employeeId || undefined,
          startDate: dateRange.value?.[0],
          endDate: dateRange.value?.[1],
        }
    await loanApi.downloadPdfPackage(payload)
    ok(`已生成 ${count} 张借款单 PDF 压缩包`)
  } finally {
    pdfExporting.value = false
  }
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

.import-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.import-head__alert {
  flex: 1;
}
.import-warning-text {
  color: var(--el-color-warning);
}
.import-warning {
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
}

.amount--outstanding {
  color: #e6a23c;
}

.ml8 {
  margin-left: 8px;
}
</style>
