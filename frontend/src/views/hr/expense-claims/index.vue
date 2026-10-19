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
        <el-button :loading="pdfExporting" @click="onPdfPackage">
          <el-icon><Printer /></el-icon>生成凭证PDF
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:expense-claim:create'" @click="importVisible = true">
          <el-icon><Upload /></el-icon>导入
        </el-button>
        <el-button v-permission="'hr:expense-claim:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增报销单
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无报销单" @selection-change="selected = $event">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="claimNo" label="单号" width="130" />
        <el-table-column prop="claimDate" label="报销日期" width="115" />
        <el-table-column label="报销人" width="160">
          <template #default="{ row }">{{ row.employeeName }}</template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" min-width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column label="支付方式" width="110">
          <template #default="{ row }">
            <el-tag :type="PAY_METHOD_TAGS[row.payMethod]" size="small">{{ PAY_METHODS[row.payMethod] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="95">
          <template #default="{ row }">
            <el-tag size="small" :type="row.claimType === 'loan_offset' ? 'warning' : 'primary'">
              {{ row.claimTypeLabel || (row.claimType === 'loan_offset' ? '冲抵借款' : '直接付款') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额合计" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
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
              v-if="row.status === 'approved' && (row.payMethod !== 'advance' || row.claimType === 'payment')"
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
          @current-change="load" @size-change="handleSize" />
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
          <el-col v-if="form.payMethod === 'advance'" :span="8">
            <el-form-item label="报销类型">
              <el-radio-group v-model="form.claimType">
                <el-radio value="payment">直接付款</el-radio>
                <el-radio value="loan_offset">冲抵借款</el-radio>
              </el-radio-group>
              <div class="form-tip">
                {{ form.claimType === 'loan_offset' ? '审核时挂「其他应收款-员工」，按借款日期先后自动冲抵借款，无需付款' : '审核时挂「其他应收款-员工」，审核后点「付款」支付给员工' }}
              </div>
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

    <!-- 导入报销单弹窗 -->
    <el-dialog v-model="importVisible" title="导入报销单" width="1040px" destroy-on-close>
      <template v-if="!importPreviewData">
        <el-upload v-loading="importParsing" drag :auto-upload="false" :limit="1" accept=".xlsx,.xls,.csv"
          :on-change="onImportFileChange" :on-remove="onImportFileRemove" :file-list="importFileList">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽 Excel / CSV 到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">按表头关键词自动映射（单号/报销日期/报销人/支付方式/金额/费用说明等），选择文件后立即解析预览；未匹配的报销人可在预览中手动指定</div>
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
              <el-tag v-if="row.claimNoTaken" size="small" type="info">自动生成</el-tag>
              <span v-else>{{ row.claimNo || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="claimDate" label="报销日期" width="105" />
          <el-table-column label="报销人" width="150">
            <template #default="{ row }">
              <template v-if="row.matched">{{ row.employeeName }}</template>
              <el-select v-else v-model="row.employeeId" filterable placeholder="选择员工" size="small"
                style="width: 100%" @change="onImportEmployeeChange(row)">
                <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.code} ${e.name}`" :value="e.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="支付方式" width="105">
            <template #default="{ row }">{{ row.payMethodLabel || PAY_METHODS[row.payMethod] }}</template>
          </el-table-column>
          <el-table-column label="金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="说明" min-width="150">
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
          <el-descriptions-item label="类型">
            <el-tag size="small" :type="detail.claimType === 'loan_offset' ? 'warning' : 'primary'">
              {{ detail.claimTypeLabel || (detail.claimType === 'loan_offset' ? '冲抵借款' : '直接付款') }}
            </el-tag>
          </el-descriptions-item>
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

    <!-- 付款弹窗：垫付挂账单付款时选择资金账户 -->
    <el-dialog v-model="payVisible" title="报销付款" width="440px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="报销单">
          <span>{{ payRow?.claimNo }}</span>
          <el-tag v-if="payRow?.claimType" size="small" class="ml6"
            :type="payRow?.claimType === 'loan_offset' ? 'warning' : 'primary'">
            {{ payRow?.claimTypeLabel || (payRow?.claimType === 'loan_offset' ? '冲抵借款' : '直接付款') }}
          </el-tag>
        </el-form-item>
        <el-form-item label="报销人">{{ payRow?.employeeName }}</el-form-item>
        <el-form-item label="付款金额">
          <span class="amount amount--total">{{ formatAmount(Number(payRow?.totalAmount ?? 0)) }} 元</span>
        </el-form-item>
        <el-form-item label="付款账户" required>
          <el-select v-model="payAccountId" filterable placeholder="选择资金账户" style="width: 100%">
            <el-option v-for="b in bankOptions" :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payVisible = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Download, Upload, UploadFilled, Back, Printer } from '@element-plus/icons-vue'
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
  advance: '审核时费用挂「其他应收款-员工」；冲抵借款型自动核销借款，直接付款型审核后可付款',
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
const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return expenseClaimApi.list(params)
  },
  defaultParams: { page: 1, pageSize: 20, status: '', employeeId: '' },
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
  claimType: 'payment' as string,
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
  query.value.status = ''
  query.value.employeeId = ''
  dateRange.value = null
  reset()
}

function onPayMethodChange() {
  if (form.payMethod === 'advance') form.bankAccountId = ''
  else form.claimType = 'payment' // 现金/银行支付本质就是直接付款
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
    claimType: detail.claimType ?? 'payment',
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

// ============ 付款 ============
// 直接付款型垫付挂账单审核后付款：付款时选择资金账户（借 其他应收款-员工 贷 银行/现金）
const payVisible = ref(false)
const payRow = ref<any>(null)
const payAccountId = ref('')
const paying = ref(false)

function onPay(row: any) {
  payRow.value = row
  payAccountId.value = row.bankAccountId ?? ''
  payVisible.value = true
}

async function submitPay() {
  const row = payRow.value
  if (!row) return
  if (!payAccountId.value) {
    ElMessage.warning('请选择付款账户')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认支付 ${formatAmount(row.totalAmount)} 元给「${row.employeeName}」吗？`,
      '报销付款',
      { type: 'warning' },
    )
  } catch {
    return
  }
  paying.value = true
  try {
    await expenseClaimApi.pay(row.id, { bankAccountId: payAccountId.value })
    ok('付款成功，已生成付款凭证')
    payVisible.value = false
    load()
  } catch {
    /* 错误已提示 */
  } finally {
    paying.value = false
  }
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

// ============ 导入报销单 ============
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
    const res = await expenseClaimApi.importPreview(raw)
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
    ElMessage.warning('没有可导入的行，请先为未匹配的报销人选择员工档案')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将生成 ${rows.length} 条报销单草稿，审核后才会生成凭证，确认导入吗？`,
      '确认导入',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '取消' },
    )
  } catch { return }
  importCommitting.value = true
  try {
    const res = await expenseClaimApi.importCommit({
      rows: rows.map((r: any) => {
        const item: any = {
          employeeId: r.employeeId,
          claimDate: r.claimDate,
          amount: Number(r.amount ?? 0),
          payMethod: r.payMethod,
        }
        if (r.claimNo) item.claimNo = r.claimNo
        if (r.summary) item.summary = r.summary
        return item
      }),
    })
    ok(`导入完成：生成 ${res.created} 条报销单草稿`)
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
      {
        title: '类型',
        prop: 'claimType',
        width: 10,
        format: (r) => r.claimTypeLabel || (r.claimType === 'loan_offset' ? '冲抵借款' : '直接付款'),
      },
      { title: '金额合计', prop: 'totalAmount', width: 15, amount: true },
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
    ElMessage.warning('当前没有可导出的报销单')
    return
  }
  try {
    await ElMessageBox.confirm(
      ids.length
        ? `将把选中的 ${ids.length} 张报销单各生成一份 PDF（原始凭证存根）并打包为压缩包下载，解压后即可打印。继续吗？`
        : `未勾选单据时将按当前筛选条件打包全部 ${total.value} 张报销单 PDF，继续吗？`,
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
    await expenseClaimApi.downloadPdfPackage(payload)
    ok(`已生成 ${count} 张报销单 PDF 压缩包`)
  } finally {
    pdfExporting.value = false
  }
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

.mt12 {
  margin-top: 12px;
}
</style>