<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input v-model="query.keyword" placeholder="搜索工号 / 姓名 / 手机 / 岗位" clearable style="width: 240px"
          @keyup.enter="search" @clear="search" />
        <el-select v-model="query.departmentId" placeholder="所属部门" clearable filterable style="width: 160px"
          @change="search">
          <el-option v-for="d in departmentOptions" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="在职状态" clearable style="width: 120px" @change="search">
          <el-option label="在职" :value="1" />
          <el-option label="离职" :value="0" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'hr:employee:create'" @click="batchVisible = true">
          <el-icon><Files /></el-icon>批量建档
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:employee:create'" @click="importVisible = true">
          <el-icon><Upload /></el-icon>导入
        </el-button>
        <el-button v-permission="'hr:employee:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增员工
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无员工">
        <el-table-column prop="code" label="工号" width="130" />
        <el-table-column prop="name" label="姓名" width="160" />
        <el-table-column label="性别" width="70" align="center">
          <template #default="{ row }">{{ genderLabel(row.gender) }}</template>
        </el-table-column>
        <el-table-column label="用工性质" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.employmentType === 'part_time' ? 'warning' : 'info'" size="small">
              {{ row.employmentType === 'part_time' ? '兼职' : '全职' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="position" label="岗位" min-width="140">
          <template #default="{ row }">{{ row.position || '-' }}</template>
        </el-table-column>
        <el-table-column label="基本工资" width="140" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.baseSalary) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="当前欠款" width="110" align="right">
          <template #default="{ row }">
            <el-button v-if="(row.loanBalance ?? 0) > 0" link type="warning" class="debt-link"
              @click="openDebts(row)">
              {{ formatAmount(row.loanBalance) }}
            </el-button>
            <span v-else class="debt-clear">0.00</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="hireDate" label="入职日期" width="115">
          <template #default="{ row }">{{ row.hireDate || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'hr:employee:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'hr:employee:update'" link type="warning" @click="onToggle(row)">
              {{ row.status === 1 ? '办理离职' : '恢复在职' }}
            </el-button>
            <el-button v-permission="'hr:employee:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="handleSize" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑员工' : '新增员工'" width="700px" destroy-on-close>
      <div v-if="!form.id" class="ocr-section">
        <div class="ocr-section__title">证件一键录入</div>
        <OcrUpload target="employee" @apply="onOcrApply" />
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="性别">
              <el-select v-model="form.gender" style="width: 100%">
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
                <el-option label="未知" value="unknown" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="用工性质">
              <el-select v-model="form.employmentType" style="width: 100%">
                <el-option label="全职" value="full_time" />
                <el-option label="兼职" value="part_time" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="form.departmentId" clearable filterable placeholder="可选" style="width: 100%">
                <el-option v-for="d in departmentOptions" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位">
              <el-input v-model="form.position" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="基本工资">
              <el-input-number v-model="form.baseSalary" :min="0" :precision="2" :step="500" style="width: 100%" />
              <div class="form-tip">用于「工资表」按员工生成工资单时的默认值</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期">
              <el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="身份证号">
          <el-input v-model="form.idCard" placeholder="18 位身份证号" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开户行">
              <el-input v-model="form.bankName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工资卡号">
              <el-input v-model="form.bankAccount" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item v-if="form.id" label="离职日期">
              <el-date-picker v-model="form.leaveDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="在职状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0"
                active-text="在职" inactive-text="离职" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 欠款明细 -->
    <el-dialog v-model="debtVisible" title="员工欠款明细" width="980px" destroy-on-close>
      <template v-if="debtData">
        <el-descriptions :column="5" border size="small" class="mb12">
          <el-descriptions-item label="员工">{{ debtData.employee?.name }}（{{ debtData.employee?.code }}）</el-descriptions-item>
          <el-descriptions-item label="借款总额">
            <span class="amount">{{ formatAmount(debtData.summary?.loanTotal ?? 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="已还现金/银行">
            <span class="amount">{{ formatAmount(debtData.summary?.repaidTotal ?? 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="报销等抵充">
            <span class="amount">{{ formatAmount(debtData.summary?.offsetTotal ?? 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="当前欠款">
            <span class="debt-link-text">{{ formatAmount(debtData.summary?.balance ?? 0) }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="debt-section-title">借款单</div>
        <el-table :data="debtData.loans ?? []" size="small" border max-height="240px" empty-text="暂无借款记录">
          <el-table-column prop="loanNo" label="借款单号" width="140" />
          <el-table-column prop="loanDate" label="借款日期" width="110" />
          <el-table-column prop="reason" label="借款事由" min-width="140">
            <template #default="{ row }">{{ row.reason || '-' }}</template>
          </el-table-column>
          <el-table-column label="借款金额" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
          </el-table-column>
          <el-table-column label="已还现金" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.repaidAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="抵充金额" width="100" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.offsetAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="未还金额" width="110" align="right">
            <template #default="{ row }">
              <span :class="row.outstanding > 0 ? 'debt-link-text' : 'debt-clear'">
                {{ formatAmount(row.outstanding) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="LOAN_STATUS_TAGS[row.status] ?? 'info'" size="small">
                {{ LOAN_STATUS_LABELS[row.status] ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="debt-section-title">还款 / 抵充流水</div>
        <el-table :data="debtData.settlements ?? []" size="small" border max-height="240px" empty-text="暂无还款记录">
          <el-table-column prop="settleDate" label="核销日期" width="110" />
          <el-table-column prop="settleTypeLabel" label="途径" width="110" />
          <el-table-column prop="sourceNo" label="来源单据" width="150">
            <template #default="{ row }">{{ row.sourceNo || '-' }}</template>
          </el-table-column>
          <el-table-column prop="loanNo" label="抵充借款单" width="140">
            <template #default="{ row }">{{ row.loanNo || '无借款挂账' }}</template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
          <el-table-column label="金额" width="110" align="right">
            <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
          </el-table-column>
        </el-table>
      </template>

      <template #footer>
        <el-button @click="debtVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 导入员工花名册弹窗 -->
    <el-dialog v-model="importVisible" title="导入员工花名册" width="1080px" destroy-on-close>
      <template v-if="!importPreviewData">
        <el-upload v-loading="importParsing" drag :auto-upload="false" :limit="1" accept=".xlsx,.xls,.csv"
          :on-change="onImportFileChange" :on-remove="onImportFileRemove" :file-list="importFileList">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽 Excel / CSV 到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">按表头关键词自动映射（姓名/性别/用工性质/身份证号/手机号/部门/岗位/开户银行/工资卡号/入职日期/基本工资等），选择文件后立即解析预览</div>
          </template>
        </el-upload>
      </template>

      <template v-else>
        <div class="import-head">
          <el-alert :type="importSummary.exists ? 'warning' : 'success'" :closable="false" show-icon
            class="import-head__alert" :title="importAlertTitle" />
        </div>
        <el-table :data="importRows" size="small" max-height="440px"
          :row-class-name="({ row }: any) => (row.exists ? 'import-row--skip' : '')">
          <el-table-column type="index" label="#" width="45" align="center" />
          <el-table-column prop="name" label="姓名" width="90" />
          <el-table-column label="性别" width="60" align="center">
            <template #default="{ row }">{{ row.genderLabel || genderLabel(row.gender) }}</template>
          </el-table-column>
          <el-table-column label="用工性质" width="80" align="center">
            <template #default="{ row }">{{ row.employmentTypeLabel || '全职' }}</template>
          </el-table-column>
          <el-table-column prop="idCard" label="身份证号" width="170">
            <template #default="{ row }">{{ row.idCard || '-' }}</template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="120">
            <template #default="{ row }">{{ row.phone || '-' }}</template>
          </el-table-column>
          <el-table-column label="部门" width="150">
            <template #default="{ row }">
              <span>{{ row.departmentName || '-' }}</span>
              <el-tag v-if="row.departmentWillCreate" size="small" type="warning" class="ml4">将创建</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="position" label="岗位" min-width="90">
            <template #default="{ row }">{{ row.position || '-' }}</template>
          </el-table-column>
          <el-table-column prop="bankName" label="开户银行" width="110">
            <template #default="{ row }">{{ row.bankName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="bankAccount" label="工资卡号" width="140">
            <template #default="{ row }">{{ row.bankAccount || '-' }}</template>
          </el-table-column>
          <el-table-column prop="message" label="说明" min-width="130" />
        </el-table>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <template v-if="importPreviewData">
          <el-button @click="backToUpload"><el-icon><Back /></el-icon>重新选择文件</el-button>
          <el-button type="primary" :loading="importCommitting" @click="onImportCommit">确认导入</el-button>
        </template>
      </template>
    </el-dialog>

    <BatchDialog v-model="batchVisible" target="employee" @success="onBatchSuccess" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Back, Files, Plus, Search, Download, Upload, UploadFilled } from '@element-plus/icons-vue'
import { departmentApi, employeeApi, type ExtractResult } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import OcrUpload from '@/components/OcrUpload/index.vue'
import BatchDialog from '@/components/OcrUpload/BatchDialog.vue'

const GENDERS: Record<string, string> = { male: '男', female: '女', unknown: '未知' }
const genderLabel = (g: string) => GENDERS[g] ?? '未知'

const employmentTypeLabel = (t: string) => (t === 'part_time' ? '兼职' : '全职')

const LOAN_STATUS_LABELS: Record<string, string> = {
  draft: '待审核',
  approved: '已借款',
  repaid: '已还清',
  rejected: '已驳回',
}
const LOAN_STATUS_TAGS: Record<string, any> = {
  draft: 'warning',
  approved: 'success',
  repaid: 'info',
  rejected: 'danger',
}

const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  fetcher: (params) => employeeApi.list(params),
  defaultParams: { page: 1, pageSize: 20, keyword: '', status: '', departmentId: '' },
})

const departmentOptions = ref<any[]>([])
const dialogVisible = ref(false)
const batchVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  gender: 'unknown' as string,
  employmentType: 'full_time' as string,
  departmentId: '',
  position: '',
  idCard: '',
  phone: '',
  email: '',
  hireDate: '',
  leaveDate: '',
  baseSalary: 0,
  bankName: '',
  bankAccount: '',
  status: 1,
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
}

function onCreate() {
  Object.assign(form, { ...initialForm })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    gender: row.gender ?? 'unknown',
    employmentType: row.employmentType ?? 'full_time',
    departmentId: row.departmentId ?? '',
    position: row.position ?? '',
    idCard: row.idCard ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    hireDate: row.hireDate ?? '',
    leaveDate: row.leaveDate ?? '',
    baseSalary: Number(row.baseSalary ?? 0),
    bankName: row.bankName ?? '',
    bankAccount: row.bankAccount ?? '',
    status: row.status,
    remark: row.remark ?? '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

/** 证件识别结果 → 表单字段（只覆盖勾选且识别到的字段，其余保留手动录入） */
function onOcrApply(payload: { values: Record<string, any>; result: ExtractResult }) {
  Object.assign(form, payload.values)
  ElMessage.success(`已填入 ${Object.keys(payload.values).length} 个字段，请核对后保存`)
  nextTick(() => formRef.value?.clearValidate())
}

function onBatchSuccess() {
  load()
}

async function onToggle(row: any) {
  const next = row.status === 1 ? 0 : 1
  try {
    await employeeApi.update(row.id, { status: next })
    ok(next === 1 ? '已恢复在职' : '已办理离职')
    load()
  } catch {
    /* 错误已提示（如尚有欠款） */
  }
}

// ============ 导入员工花名册 ============
const importVisible = ref(false)
const importFileList = ref<any[]>([])
const importParsing = ref(false)
const importPreviewData = ref<any>(null)
const importRows = ref<any[]>([])
const importCommitting = ref(false)

const importSummary = computed<any>(() => importPreviewData.value?.summary ?? {})
const importAlertTitle = computed(() => {
  const s = importSummary.value
  let title = `共 ${s.total ?? 0} 行：将新建 ${s.newCount ?? 0} 人，已存在跳过 ${s.exists ?? 0} 人`
  if (s.newDepartments?.length) title += `，将自动创建部门：${s.newDepartments.join('、')}`
  return title
})

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
    const res = await employeeApi.importPreview(raw)
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

async function onImportCommit() {
  const rows = importRows.value
  if (!rows.length) {
    ElMessage.warning('没有可导入的行')
    return
  }
  const newCount = importSummary.value.newCount ?? rows.filter((r: any) => !r.exists).length
  const existsCount = importSummary.value.exists ?? rows.filter((r: any) => r.exists).length
  try {
    await ElMessageBox.confirm(
      `将新建 ${newCount} 名员工（已存在 ${existsCount} 人自动跳过），工号由系统自动生成，确认导入吗？`,
      '确认导入',
      { type: 'warning', confirmButtonText: '确认导入', cancelButtonText: '取消' },
    )
  } catch { return }
  importCommitting.value = true
  try {
    const res = await employeeApi.importCommit({
      rows: rows.map((r: any) => {
        const item: any = { name: r.name }
        if (r.gender) item.gender = r.gender
        if (r.employmentType) item.employmentType = r.employmentType
        if (r.departmentName) item.departmentName = r.departmentName
        if (r.position) item.position = r.position
        if (r.idCard) item.idCard = r.idCard
        if (r.phone) item.phone = r.phone
        if (r.hireDate) item.hireDate = r.hireDate
        if (r.baseSalary !== null && r.baseSalary !== undefined && r.baseSalary !== '') {
          item.baseSalary = Number(r.baseSalary)
        }
        if (r.bankName) item.bankName = r.bankName
        if (r.bankAccount) item.bankAccount = r.bankAccount
        return item
      }),
    })
    ok(`导入完成：新建 ${res.created} 人，跳过 ${res.skipped} 人`)
    const failed = (res.results ?? []).filter((x: any) => x.success === false && !x.skipped)
    if (failed.length) {
      ElMessage.warning(
        `有 ${failed.length} 行导入失败：` +
        failed.map((f: any) => `${f.name ?? `第 ${(f.index ?? 0) + 1} 行`}：${f.message ?? '失败'}`).join('；'),
      )
    }
    importVisible.value = false
    backToUpload()
    load()
  } finally {
    importCommitting.value = false
  }
}

// ============ 欠款明细 ============
const debtVisible = ref(false)
const debtData = ref<any>(null)

async function openDebts(row: any) {
  debtData.value = await employeeApi.debts(row.id)
  debtVisible.value = true
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`员工「${row.name}」`))) return
  try {
    await employeeApi.remove(row.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示（如有报销单/工资记录） */
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload: any = { ...form }
    for (const k of ['departmentId', 'position', 'idCard', 'phone', 'email', 'hireDate', 'leaveDate', 'bankName', 'bankAccount', 'remark']) {
      if (!payload[k]) delete payload[k]
    }
    if (form.id) await employeeApi.update(form.id, payload)
    else await employeeApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

function onExport() {
  exportExcel({
    filename: `员工花名册_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '员工',
    columns: [
      { title: '工号', prop: 'code', width: 10 },
      { title: '姓名', prop: 'name', width: 12 },
      { title: '性别', prop: 'gender', width: 8, format: (r) => genderLabel(r.gender) },
      { title: '用工性质', prop: 'employmentType', width: 10, format: (r) => employmentTypeLabel(r.employmentType) },
      { title: '部门', prop: 'departmentName', width: 16 },
      { title: '岗位', prop: 'position', width: 16 },
      { title: '基本工资', prop: 'baseSalary', width: 14, amount: true },
      { title: '当前欠款', prop: 'loanBalance', width: 12, amount: true },
      { title: '身份证号', prop: 'idCard', width: 20 },
      { title: '手机号', prop: 'phone', width: 15 },
      { title: '入职日期', prop: 'hireDate', width: 12 },
      { title: '状态', prop: 'status', width: 8, format: (r) => (r.status === 1 ? '在职' : '离职') },
    ],
    rows: list.value as any[],
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  departmentOptions.value = await departmentApi.options()
  load()
})
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}
.ml4 {
  margin-left: 4px;
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
:deep(.el-table .import-row--skip) {
  color: var(--el-text-color-secondary);
}
.form-tip {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}
.debt-link {
  font-weight: 600;
}
.debt-link-text {
  color: var(--el-color-warning);
  font-weight: 600;
}
.debt-clear {
  color: var(--app-text-secondary);
}
.debt-section-title {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary, #606266);
}

.ocr-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}

.ocr-section__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary, #606266);
}
</style>
