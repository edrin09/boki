<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.status" placeholder="单据状态" clearable style="width: 130px" @change="search">
          <el-option label="草稿" value="draft" />
          <el-option label="已审核" value="approved" />
          <el-option label="已发放" value="paid" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出工资表</el-button>
        <el-button v-permission="'hr:payroll:create'" @click="importVisible = true">
          <el-icon><Upload /></el-icon>导入工资表
        </el-button>
        <el-button v-permission="'hr:payroll:create'" type="primary" @click="openGenerate">
          <el-icon><Plus /></el-icon>生成工资单
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无工资单">
        <el-table-column prop="payrollNo" label="工资单号" width="130" />
        <el-table-column label="工资期间" min-width="115">
          <template #default="{ row }">{{ periodLabel(row.period) }}</template>
        </el-table-column>
        <el-table-column prop="payDate" label="发放日期" width="115" />
        <el-table-column prop="employeeCount" label="人数" width="80" align="center" />
        <el-table-column label="应发合计" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ formatAmount(row.totalGross) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="代扣合计" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">
              {{ formatAmount(row.totalInsurance + row.totalFund + row.totalTax + row.totalOtherDeduct) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="实发合计" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.totalNet) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAGS[row.status]" size="small">{{ row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onView(row)">查看明细</el-button>
            <el-button v-if="row.status === 'draft'" v-permission="'hr:payroll:update'" link type="primary"
              @click="onEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'draft'" v-permission="'hr:payroll:approve'" link type="success"
              @click="onApprove(row)">审核计提</el-button>
            <el-button v-if="row.status === 'approved'" v-permission="'hr:payroll:pay'" link type="warning"
              @click="onPay(row)">发放</el-button>
            <el-button v-if="row.status !== 'paid'" v-permission="'hr:payroll:delete'" link type="danger"
              @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="onReset" />
      </div>
    </div>

    <!-- 生成弹窗 -->
    <el-dialog v-model="generateVisible" title="生成工资单" width="520px" destroy-on-close>
      <el-form :model="generateForm" label-width="110px">
        <el-form-item label="工资期间">
          <PeriodPicker v-model="generateForm.period" width="160px" />
        </el-form-item>
        <el-form-item label="发放日期">
          <el-date-picker v-model="generateForm.payDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="限定部门">
          <el-select v-model="generateForm.departmentId" clearable filterable placeholder="不选则取全部在职员工" style="width: 100%">
            <el-option v-for="d in departmentOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon
        title="将按在职员工的「基本工资」预生成工资明细，可在生成后继续编辑绩效、补贴、代扣等项。" />
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="onGenerate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 明细弹窗 -->
    <el-dialog v-model="detailVisible" title="工资表明细" width="1100px" destroy-on-close>
      <template v-if="detail">
        <el-descriptions :column="4" border size="small" class="mb12">
          <el-descriptions-item label="工资单号">{{ detail.payrollNo }}</el-descriptions-item>
          <el-descriptions-item label="工资期间">{{ periodLabel(detail.period) }}</el-descriptions-item>
          <el-descriptions-item label="发放日期">{{ detail.payDate }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="STATUS_TAGS[detail.status]" size="small">{{ detail.statusLabel }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="费用科目">{{ detail.expenseAccountName || '默认 6602 管理费用' }}</el-descriptions-item>
          <el-descriptions-item label="薪酬科目">{{ detail.payableAccountName || '默认 2211.01 工资' }}</el-descriptions-item>
          <el-descriptions-item label="代扣挂账">{{ detail.deductAccountName || '默认 2241 其他应付款' }}</el-descriptions-item>
          <el-descriptions-item label="个税科目">{{ detail.taxAccountName || '默认 2221.04 个税' }}</el-descriptions-item>
        </el-descriptions>

        <div class="page-toolbar">
          <el-button v-if="detail?.status === 'draft'" size="small" @click="onEdit(detail)">
            <el-icon><Edit /></el-icon>编辑明细
          </el-button>
          <div class="page-toolbar__spacer" />
          <el-select v-model="payForm.bankAccountId" size="small" placeholder="发放账户" filterable style="width: 220px">
            <el-option v-for="b in bankOptions" :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
          </el-select>
        </div>

        <el-table :data="detail.items ?? []" size="small" show-summary :summary-method="summaryMethod"
          max-height="460px">
          <el-table-column type="index" label="#" width="50" align="center" />
          <el-table-column prop="employeeCode" label="工号" width="90" />
          <el-table-column prop="employeeName" label="姓名" width="90" />
          <el-table-column prop="departmentName" label="部门" width="110">
            <template #default="{ row }">{{ row.departmentName || '-' }}</template>
          </el-table-column>
          <el-table-column label="基本" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.baseSalary) }}</span></template>
          </el-table-column>
          <el-table-column label="绩效" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.performance) }}</span></template>
          </el-table-column>
          <el-table-column label="补贴" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.allowance) }}</span></template>
          </el-table-column>
          <el-table-column label="加班" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.overtime) }}</span></template>
          </el-table-column>
          <el-table-column label="应发" width="120" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(row.gross) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="社保" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.insurancePersonal) }}</span></template>
          </el-table-column>
          <el-table-column label="公积金" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.fundPersonal) }}</span></template>
          </el-table-column>
          <el-table-column label="个税" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.tax) }}</span></template>
          </el-table-column>
          <el-table-column label="其他代扣" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.otherDeduct) }}</span></template>
          </el-table-column>
          <el-table-column label="实发" width="120" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(row.net) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="detail?.status === 'approved'"
          v-permission="'hr:payroll:pay'"
          type="primary"
          :loading="paying"
          @click="onPayNow"
        >
          确认发放
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入工资表弹窗 -->
    <el-dialog v-model="importVisible" title="导入工资表" width="980px" destroy-on-close>
      <template v-if="!importPreviewData">
        <el-upload drag :auto-upload="false" :limit="1" accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/webp,application/pdf"
          :on-change="onImportFileChange" :on-remove="onImportFileRemove" :file-list="importFileList">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽 Excel / CSV / 工资表图片 / PDF 到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">表格按表头关键词自动映射（姓名/基本工资/绩效/补贴/社保/公积金/个税等）；图片与 PDF 走 OCR，识别结果需人工核对</div>
          </template>
        </el-upload>
      </template>

      <template v-else>
        <div class="import-head">
          <el-form inline class="import-form">
            <el-form-item label="工资期间">
              <PeriodPicker v-model="importForm.period" width="150px" />
            </el-form-item>
            <el-form-item label="发放日期">
              <el-date-picker v-model="importForm.payDate" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="importCommitting" @click="onImportCommit">确认导入</el-button>
            </el-form-item>
          </el-form>
          <div class="import-actions">
            <el-button @click="backToUpload"><el-icon><Back /></el-icon>重新选择文件</el-button>
          </div>
        </div>
        <el-alert :type="importPreviewData.summary.unmatched ? 'warning' : 'success'" :closable="false" show-icon class="mb12"
          :title="`共 ${importPreviewData.summary.total} 行，匹配员工 ${importPreviewData.summary.matched} 人，未匹配 ${importPreviewData.summary.unmatched} 人；应发合计 ${formatAmount(importPreviewData.summary.totalGross)}，实发合计 ${formatAmount(importPreviewData.summary.totalNet)}`" />
        <el-table :data="importRows" size="small" max-height="440px">
          <el-table-column type="index" label="#" width="45" align="center" />
          <el-table-column label="姓名" width="120">
            <template #default="{ row }">
              <template v-if="row.matched">{{ row.employeeName }}</template>
              <el-select v-else v-model="row.employeeId" filterable placeholder="选择员工" size="small" style="width: 100%">
                <el-option v-for="e in employeeOptions" :key="e.id" :label="`${e.name}（${e.code}）`" :value="e.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="匹配" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.fromOcr" size="small" type="warning">OCR</el-tag>
              <el-tag v-if="row.matched" size="small" type="success">已匹配</el-tag>
              <el-tag v-else size="small" type="danger">未匹配</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="基本工资" width="110">
            <template #default="{ row }">
              <el-input-number v-model="row.baseSalary" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="绩效" width="100">
            <template #default="{ row }">
              <el-input-number v-model="row.performance" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="补贴" width="100">
            <template #default="{ row }">
              <el-input-number v-model="row.allowance" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="加班" width="100">
            <template #default="{ row }">
              <el-input-number v-model="row.overtime" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="社保" width="95">
            <template #default="{ row }">
              <el-input-number v-model="row.insurancePersonal" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="公积金" width="95">
            <template #default="{ row }">
              <el-input-number v-model="row.fundPersonal" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="个税" width="90">
            <template #default="{ row }">
              <el-input-number v-model="row.tax" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="其他代扣" width="90">
            <template #default="{ row }">
              <el-input-number v-model="row.otherDeduct" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="应发" width="100" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(calcRowGross(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="实发" width="100" align="right">
            <template #default="{ row }">
              <span class="amount amount--total">{{ formatAmount(calcRowNet(row)) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="unmatchableCount" class="import-warning">
          {{ unmatchableCount }} 行未指定员工，确认导入前请先为每行选择员工；未选择的行将被跳过。
        </div>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button v-if="!importPreviewData" type="primary" :disabled="!importFileList.length" :loading="importParsing"
          @click="onImportParse">解析预览</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Download, Edit, Upload, UploadFilled, Back } from '@element-plus/icons-vue'
import { bankApi, departmentApi, employeeApi, payrollApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const STATUS_TAGS: Record<string, any> = { draft: 'info', approved: 'success', paid: 'primary' }

const router = useRouter()

const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, status: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => payrollApi.list(params),
})

const departmentOptions = ref<any[]>([])
const bankOptions = ref<any[]>([])

const generateVisible = ref(false)
const generating = ref(false)
const generateForm = reactive({
  period: currentPeriod(),
  payDate: new Date().toISOString().slice(0, 10),
  departmentId: '',
})

function onReset() {
  query.status = ''
  reset()
}

function openGenerate() {
  generateForm.period = currentPeriod()
  generateForm.payDate = new Date().toISOString().slice(0, 10)
  generateForm.departmentId = ''
  generateVisible.value = true
}

async function onGenerate() {
  generating.value = true
  try {
    const payload: any = { period: generateForm.period, payDate: generateForm.payDate }
    if (generateForm.departmentId) payload.departmentId = generateForm.departmentId
    await payrollApi.generate(payload)
    ok('生成成功，请核对明细后审核')
    generateVisible.value = false
    load()
  } finally {
    generating.value = false
  }
}

// ============ 导入工资表 ============
const importVisible = ref(false)
const importFileList = ref<any[]>([])
const importParsing = ref(false)
const importPreviewData = ref<any>(null)
const importRows = ref<any[]>([])
const importCommitting = ref(false)
const employeeOptions = ref<any[]>([])
const importForm = reactive({
  period: currentPeriod(),
  payDate: new Date().toISOString().slice(0, 10),
})

function onImportFileChange(_file: any, files: any[]) {
  importFileList.value = files
}

function onImportFileRemove(_file: any, files: any[]) {
  importFileList.value = files
}

async function onImportParse() {
  const raw = importFileList.value.find((f: any) => f.raw instanceof File)?.raw as File | undefined
  if (!raw) {
    ElMessage.warning('请先选择工资表文件')
    return
  }
  importParsing.value = true
  try {
    const res = await payrollApi.importPreview(raw)
    importPreviewData.value = res
    importRows.value = (res.rows ?? []).map((r: any) => ({ ...r }))
    importForm.period = currentPeriod()
    importForm.payDate = new Date().toISOString().slice(0, 10)
  } finally {
    importParsing.value = false
  }
}

function backToUpload() {
  importPreviewData.value = null
  importRows.value = []
  importFileList.value = []
}

const unmatchableCount = computed(() =>
  importRows.value.filter((r: any) => !r.employeeId).length,
)

function calcRowGross(row: any): number {
  return Math.round(
    ((row.baseSalary ?? 0) + (row.performance ?? 0) + (row.allowance ?? 0) + (row.overtime ?? 0)) * 100,
  ) / 100
}

function calcRowNet(row: any): number {
  const gross = calcRowGross(row)
  const deduct =
    (row.insurancePersonal ?? 0) + (row.fundPersonal ?? 0) + (row.tax ?? 0) + (row.otherDeduct ?? 0)
  return Math.round((gross - deduct) * 100) / 100
}

async function onImportCommit() {
  const rows = importRows.value.filter((r: any) => r.employeeId)
  if (!rows.length) {
    ElMessage.warning('没有可导入的行，请先为未匹配员工选择档案')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认按 ${rows.length} 行生成 ${periodLabel(importForm.period)} 工资单草稿？导入后可继续编辑明细，审核计提后才生成凭证。`,
      '确认导入',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  importCommitting.value = true
  try {
    const payload = {
      period: importForm.period,
      payDate: importForm.payDate,
      remark: '工资表导入',
      rows: rows.map((r: any) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        baseSalary: r.baseSalary ?? 0,
        performance: r.performance ?? 0,
        allowance: r.allowance ?? 0,
        overtime: r.overtime ?? 0,
        insurancePersonal: r.insurancePersonal ?? 0,
        fundPersonal: r.fundPersonal ?? 0,
        tax: r.tax ?? 0,
        otherDeduct: r.otherDeduct ?? 0,
      })),
    }
    await payrollApi.importCommit(payload)
    ok('工资单草稿已生成，可在列表中编辑与审核')
    importVisible.value = false
    backToUpload()
    load()
  } finally {
    importCommitting.value = false
  }
}

const detailVisible = ref(false)
const detail = ref<any>(null)
const payForm = reactive({ bankAccountId: '' })
const paying = ref(false)

async function onView(row: any) {
  detail.value = await payrollApi.detail(row.id)
  payForm.bankAccountId = detail.value?.bankAccountId ?? ''
  detailVisible.value = true
}

async function onEdit(row: any) {
  if (row.status && row.status !== 'draft') {
    ElMessage.warning('仅草稿状态的工资单可以编辑')
    return
  }
  router.push(`/hr/payrolls/${row.id}/edit`)
}

async function onApprove(row: any) {
  try {
    await ElMessageBox.confirm(
      `审核后将按应发工资 ${formatAmount(row.totalGross)} 元生成「计提工资」凭证，确认吗？`,
      '审核工资单', { type: 'warning' },
    )
  } catch { return }
  try {
    await payrollApi.approve(row.id)
    ok('审核成功，已生成计提凭证')
    load()
  } catch { /* 错误已提示 */ }
}

async function onPay(row: any) {
  let bankAccountId = row.bankAccountId
  if (!bankAccountId) {
    ElMessage.warning('请先打开明细并选择发放账户')
    await onView(row)
    return
  }
  try {
    await ElMessageBox.confirm(`确认发放实发工资 ${formatAmount(row.totalNet)} 元吗？`, '发放工资', { type: 'warning' })
  } catch { return }
  try {
    await payrollApi.pay(row.id, { bankAccountId })
    ok('发放成功，已生成发放凭证')
    load()
  } catch { /* 错误已提示 */ }
}

async function onPayNow() {
  if (!detail.value) return
  paying.value = true
  try {
    await payrollApi.pay(detail.value.id, { bankAccountId: payForm.bankAccountId || undefined })
    ok('发放成功，已生成发放凭证')
    detailVisible.value = false
    load()
  } finally {
    paying.value = false
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`工资单「${row.payrollNo}」`))) return
  try {
    await payrollApi.remove(row.id)
    ok('删除成功')
    load()
  } catch { /* 错误已提示 */ }
}

function summaryMethod({ columns }: any) {
  return columns.map((_col: any, index: number) => {
    if (index === 0) return '合计'
    if (index <= 3) return ''
    const items = detail.value?.items ?? []
    const sum = (field: string) =>
      Math.round(items.reduce((acc: number, i: any) => acc + (Number(i[field]) || 0), 0) * 100) / 100
    const map: Record<number, string> = {
      4: 'baseSalary',
      5: 'performance',
      6: 'allowance',
      7: 'overtime',
      8: null as any,
      9: 'insurancePersonal',
      10: 'fundPersonal',
      11: 'tax',
      12: 'otherDeduct',
      13: null as any,
    }
    if (map[index] === null) {
      if (index === 8) return formatAmount(detail.value?.totalGross ?? 0)
      return formatAmount(detail.value?.totalNet ?? 0)
    }
    return formatAmount(sum(map[index]))
  })
}

function onExport() {
  const rows: any[] = []
  for (const p of list.value as any[]) {
    rows.push({
      payrollNo: p.payrollNo,
      period: periodLabel(p.period),
      payDate: p.payDate,
      employeeCount: p.employeeCount,
      totalGross: p.totalGross,
      totalNet: p.totalNet,
      status: p.statusLabel,
    })
  }
  exportExcel({
    filename: `工资单汇总_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '工资单汇总',
    columns: [
      { title: '工资单号', prop: 'payrollNo', width: 14 },
      { title: '工资期间', prop: 'period', width: 16 },
      { title: '发放日期', prop: 'payDate', width: 12 },
      { title: '人数', prop: 'employeeCount', width: 8 },
      { title: '应发合计', prop: 'totalGross', width: 15, amount: true },
      { title: '实发合计', prop: 'totalNet', width: 15, amount: true },
      { title: '状态', prop: 'status', width: 10 },
    ],
    rows,
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  departmentOptions.value = await departmentApi.options()
  bankOptions.value = await bankApi.options()
  employeeOptions.value = await employeeApi.options(true)
  load()
})
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}
.import-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.import-form {
  display: flex;
  flex-wrap: wrap;
}
.import-actions {
  flex-shrink: 0;
}
.import-warning {
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>