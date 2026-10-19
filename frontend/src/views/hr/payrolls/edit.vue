<template>
  <div class="page">
    <div class="page-card" v-loading="loading">
      <!-- 页头 -->
      <div class="edit-head">
        <div class="edit-head__left">
          <el-button link @click="goBack">
            <el-icon><ArrowLeft /></el-icon>返回
          </el-button>
          <span class="edit-head__title">编辑工资明细</span>
          <el-tag v-if="meta.payrollNo" type="info" size="small">{{ meta.payrollNo }}</el-tag>
          <el-tag v-if="meta.statusLabel" :type="STATUS_TAGS[meta.status]" size="small">
            {{ meta.statusLabel }}
          </el-tag>
        </div>
        <div class="edit-head__right">
          <el-button @click="goBack">取消</el-button>
          <el-button type="primary" :loading="saving" :disabled="readonly" @click="onSave">
            保存
          </el-button>
        </div>
      </div>

      <el-alert v-if="readonly" type="warning" :closable="false" show-icon class="mb12"
        :title="`当前工资单状态为「${meta.statusLabel}」，仅草稿状态可编辑，本页仅可查看。`" />
      <el-alert v-else type="info" :closable="false" show-icon class="mb12"
        title="修改后保存为草稿；「审核计提」生成 借：工资费用 / 贷：应付职工薪酬，「发放」生成 借：应付职工薪酬 / 贷：银行及代扣项。" />

      <!-- 基本信息 -->
      <el-form :inline="true" class="edit-form" :disabled="readonly">
        <el-form-item label="工资期间">
          <PeriodPicker v-model="meta.period" width="150px" />
        </el-form-item>
        <el-form-item label="发放日期">
          <el-date-picker v-model="meta.payDate" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="meta.remark" placeholder="选填" maxlength="200" style="width: 220px" />
        </el-form-item>
      </el-form>

      <!-- 记账科目 -->
      <el-form :inline="true" class="edit-form" :disabled="readonly">
        <el-form-item label="费用科目">
          <el-select v-model="meta.expenseAccountId" clearable filterable placeholder="默认 6602" style="width: 220px">
            <el-option v-for="a in accountOptions" :key="a.id" :label="`${a.code} ${a.fullName}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="薪酬科目">
          <el-select v-model="meta.payableAccountId" clearable filterable placeholder="默认 2211.01" style="width: 220px">
            <el-option v-for="a in accountOptions" :key="a.id" :label="`${a.code} ${a.fullName}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="代扣挂账">
          <el-select v-model="meta.deductAccountId" clearable filterable placeholder="默认 2241" style="width: 220px">
            <el-option v-for="a in accountOptions" :key="a.id" :label="`${a.code} ${a.fullName}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="个税科目">
          <el-select v-model="meta.taxAccountId" clearable filterable placeholder="默认 2221.04" style="width: 220px">
            <el-option v-for="a in accountOptions" :key="a.id" :label="`${a.code} ${a.fullName}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发放账户">
          <el-select v-model="meta.bankAccountId" clearable filterable placeholder="默认 1002 银行存款" style="width: 240px">
            <el-option v-for="b in bankOptions" :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`" :value="b.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 明细操作 -->
      <div class="page-toolbar">
        <el-button type="primary" plain :disabled="readonly" @click="openAdd">
          <el-icon><Plus /></el-icon>添加员工
        </el-button>
        <div class="page-toolbar__spacer" />
        <span class="edit-total">人数 <b>{{ items.length }}</b></span>
        <span class="edit-total">应发合计 <b class="amount amount--debit">{{ formatAmount(totals.gross) }}</b></span>
        <span class="edit-total">代扣合计 <b class="amount amount--credit">{{ formatAmount(totals.deduct) }}</b></span>
        <span class="edit-total">实发合计 <b class="amount amount--total">{{ formatAmount(totals.net) }}</b></span>
      </div>

      <!-- 明细表 -->
      <el-table :data="items" border size="small" show-summary :summary-method="summaryMethod"
        max-height="calc(100vh - 420px)" empty-text="暂无员工明细，点击「添加员工」录入">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column prop="employeeCode" label="工号" width="100" />
        <el-table-column prop="employeeName" label="姓名" width="90" />
        <el-table-column prop="departmentName" label="部门" width="110">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column label="基本工资" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.baseSalary" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="绩效" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.performance" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="补贴" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.allowance" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="加班费" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.overtime" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="应发" width="120" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(calcGross(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="个人社保" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.insurancePersonal" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="个人公积金" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.fundPersonal" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="个税" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.tax" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="其他代扣" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.otherDeduct" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="欠款余额" width="100" align="right">
          <template #default="{ row }">
            <span :class="{ 'loan-outstanding': (outstandingMap.get(row.employeeId) ?? 0) > 0 }">
              {{ formatAmount(outstandingMap.get(row.employeeId) ?? 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="借款扣回" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.loanDeduct" :min="0" :precision="2" :controls="false" :disabled="readonly" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="实发" width="120" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(calcNet(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" :disabled="readonly" @click="removeItem($index)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="edit-foot">
        <el-button @click="goBack">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="readonly" @click="onSave">保存</el-button>
      </div>
    </div>

    <!-- 添加员工 -->
    <el-dialog v-model="addVisible" title="添加员工" width="420px" destroy-on-close>
      <el-select v-model="addEmployeeId" filterable placeholder="搜索并选择员工" style="width: 100%">
        <el-option v-for="e in addableEmployees" :key="e.id" :label="`${e.name}（${e.code}）`" :value="e.id" />
      </el-select>
      <div v-if="!addableEmployees.length" class="add-empty">没有可添加的在职员工（可能已全部录入）</div>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!addEmployeeId" :loading="adding" @click="confirmAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import { accountApi, bankApi, employeeApi, loanApi, payrollApi } from '@/api'
import { ok } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const STATUS_TAGS: Record<string, any> = { draft: 'info', approved: 'success', paid: 'primary' }

const route = useRoute()
const router = useRouter()
const id = String(route.params.id ?? '')

const loading = ref(false)
const saving = ref(false)
const readonly = computed(() => meta.status !== 'draft')

const meta = reactive({
  payrollNo: '',
  period: 0,
  payDate: '',
  status: 'draft',
  statusLabel: '',
  remark: '',
  expenseAccountId: '',
  payableAccountId: '',
  deductAccountId: '',
  taxAccountId: '',
  bankAccountId: '',
})

const items = ref<any[]>([])
const accountOptions = ref<any[]>([])
const bankOptions = ref<any[]>([])
const employeeOptions = ref<any[]>([])
/** 员工未还清借款余额（employeeId -> 元），用于展示与自动预填扣回 */
const outstandingMap = ref<Map<string, number>>(new Map())

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function calcGross(row: any): number {
  return round2(
    (row.baseSalary ?? 0) + (row.performance ?? 0) + (row.allowance ?? 0) + (row.overtime ?? 0),
  )
}

function rowDeduct(row: any): number {
  return round2(
    (row.insurancePersonal ?? 0) + (row.fundPersonal ?? 0) + (row.tax ?? 0) + (row.otherDeduct ?? 0) + (row.loanDeduct ?? 0),
  )
}

function calcNet(row: any): number {
  return round2(calcGross(row) - rowDeduct(row))
}

const totals = computed(() => {
  const sum = (fn: (row: any) => number) =>
    round2(items.value.reduce((acc, row) => acc + fn(row), 0))
  return {
    count: items.value.length,
    gross: sum(calcGross),
    deduct: sum(rowDeduct),
    net: sum(calcNet),
  }
})

function goBack() {
  router.push('/hr/payrolls')
}

async function load() {
  if (!id) {
    ElMessage.error('缺少工资单参数')
    goBack()
    return
  }
  loading.value = true
  try {
    const data = await payrollApi.detail(id)
    Object.assign(meta, {
      payrollNo: data.payrollNo ?? '',
      period: data.period ?? 0,
      payDate: data.payDate ?? '',
      status: data.status ?? 'draft',
      statusLabel: data.statusLabel ?? '',
      remark: data.remark ?? '',
      expenseAccountId: data.expenseAccountId ?? '',
      payableAccountId: data.payableAccountId ?? '',
      deductAccountId: data.deductAccountId ?? '',
      taxAccountId: data.taxAccountId ?? '',
      bankAccountId: data.bankAccountId ?? '',
    })
    items.value = (data.items ?? []).map((i: any) => ({
      employeeId: i.employeeId,
      employeeCode: i.employeeCode,
      employeeName: i.employeeName,
      departmentName: i.departmentName ?? '',
      baseSalary: Number(i.baseSalary ?? 0),
      performance: Number(i.performance ?? 0),
      allowance: Number(i.allowance ?? 0),
      overtime: Number(i.overtime ?? 0),
      insurancePersonal: Number(i.insurancePersonal ?? 0),
      fundPersonal: Number(i.fundPersonal ?? 0),
      tax: Number(i.tax ?? 0),
      otherDeduct: Number(i.otherDeduct ?? 0),
      loanDeduct: Number(i.loanDeduct ?? 0),
    }))
  } finally {
    loading.value = false
  }
}

// ============ 添加 / 移除员工 ============
const addVisible = ref(false)
const adding = ref(false)
const addEmployeeId = ref('')

const addableEmployees = computed(() => {
  const used = new Set(items.value.map((i) => i.employeeId))
  return employeeOptions.value.filter((e) => !used.has(e.id))
})

function openAdd() {
  addEmployeeId.value = ''
  addVisible.value = true
}

async function confirmAdd() {
  const opt = employeeOptions.value.find((e) => e.id === addEmployeeId.value)
  if (!opt) {
    ElMessage.warning('请选择员工')
    return
  }
  adding.value = true
  try {
    let baseSalary = 0
    let departmentName = ''
    try {
      const detail = await employeeApi.detail(opt.id)
      baseSalary = Number(detail.baseSalary ?? 0)
      departmentName = detail.departmentName ?? ''
    } catch {
      /* 取不到档案信息时按 0 录入，不影响添加 */
    }
    items.value.push({
      employeeId: opt.id,
      employeeCode: opt.code,
      employeeName: opt.name,
      departmentName,
      baseSalary,
      performance: 0,
      allowance: 0,
      overtime: 0,
      insurancePersonal: 0,
      fundPersonal: 0,
      tax: 0,
      otherDeduct: 0,
      // 自动带出员工欠款：扣回金额 = min(欠款余额, 应发工资)
      loanDeduct: round2(Math.min(outstandingMap.value.get(opt.id) ?? 0, baseSalary)),
    })
    addVisible.value = false
  } finally {
    adding.value = false
  }
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function summaryMethod({ columns }: any) {
  return columns.map((_col: any, index: number) => {
    // 列顺序：# 0 / 工号 1 / 姓名 2 / 部门 3 / 基本 4 / 绩效 5 / 补贴 6 / 加班 7
    //        应发 8 / 社保 9 / 公积金 10 / 个税 11 / 其他代扣 12 / 欠款余额 13 / 借款扣回 14 / 实发 15 / 操作 16
    const sumField = (field: string) =>
      round2(items.value.reduce((acc, row) => acc + (Number(row[field]) || 0), 0))
    switch (index) {
      case 0:
        return '合计'
      case 1:
      case 2:
      case 3:
      case 13:
      case 16:
        return ''
      case 4:
        return formatAmount(sumField('baseSalary'))
      case 5:
        return formatAmount(sumField('performance'))
      case 6:
        return formatAmount(sumField('allowance'))
      case 7:
        return formatAmount(sumField('overtime'))
      case 8:
        return formatAmount(totals.value.gross)
      case 9:
        return formatAmount(sumField('insurancePersonal'))
      case 10:
        return formatAmount(sumField('fundPersonal'))
      case 11:
        return formatAmount(sumField('tax'))
      case 12:
        return formatAmount(sumField('otherDeduct'))
      case 14:
        return formatAmount(sumField('loanDeduct'))
      case 15:
        return formatAmount(totals.value.net)
      default:
        return ''
    }
  })
}

async function onSave() {
  if (readonly.value) return
  if (!items.value.length) {
    ElMessage.warning('请至少录入一名员工的工资')
    return
  }
  const seen = new Set<string>()
  for (const row of items.value) {
    if (!row.employeeId) {
      ElMessage.error('存在未指定员工的行，请检查')
      return
    }
    if (seen.has(row.employeeId)) {
      ElMessage.error('存在重复的员工，请检查')
      return
    }
    seen.add(row.employeeId)
    const gross = calcGross(row)
    const deduct = rowDeduct(row)
    if (deduct > gross) {
      ElMessage.error(
        `员工「${row.employeeName}」的代扣合计（${formatAmount(deduct)}）超过应发工资（${formatAmount(gross)}）`,
      )
      return
    }
  }
  if (!meta.period) {
    ElMessage.warning('请选择工资期间')
    return
  }
  if (!meta.payDate) {
    ElMessage.warning('请选择发放日期')
    return
  }

  saving.value = true
  try {
    const payload: any = {
      period: meta.period,
      payDate: meta.payDate,
      expenseAccountId: meta.expenseAccountId || undefined,
      payableAccountId: meta.payableAccountId || undefined,
      deductAccountId: meta.deductAccountId || undefined,
      taxAccountId: meta.taxAccountId || undefined,
      bankAccountId: meta.bankAccountId || undefined,
      remark: meta.remark || undefined,
      items: items.value.map((row) => ({
        employeeId: row.employeeId,
        baseSalary: row.baseSalary ?? 0,
        performance: row.performance ?? 0,
        allowance: row.allowance ?? 0,
        overtime: row.overtime ?? 0,
        insurancePersonal: row.insurancePersonal ?? 0,
        fundPersonal: row.fundPersonal ?? 0,
        tax: row.tax ?? 0,
        otherDeduct: row.otherDeduct ?? 0,
        loanDeduct: row.loanDeduct ?? 0,
      })),
    }
    await payrollApi.update(id, payload)
    ok('保存成功')
    router.push('/hr/payrolls')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const [accounts, banks, employees] = await Promise.all([
      accountApi.options(),
      bankApi.options(),
      employeeApi.options(true),
    ])
    accountOptions.value = accounts
    bankOptions.value = banks
    employeeOptions.value = employees
  } catch {
    /* 选项加载失败不影响明细的查看与保存 */
  }
  try {
    const balances = await loanApi.employeeBalances({ page: 1, pageSize: 500 })
    const map = new Map<string, number>()
    for (const b of balances?.list ?? []) {
      if (Number(b.balance ?? 0) > 0) map.set(b.employeeId, Number(b.balance))
    }
    outstandingMap.value = map
  } catch {
    /* 欠款余额加载失败不影响编辑，仅不显示提示 */
  }
})
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}
.edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px dashed var(--app-border);

  &__left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
  }
}
.edit-form {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.edit-total {
  font-size: 13px;
  color: var(--app-text-secondary);

  b {
    color: var(--app-text);
  }
}
.edit-foot {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
.add-empty {
  margin-top: 10px;
  font-size: 13px;
  color: var(--el-color-info);
}
.loan-outstanding {
  color: var(--el-color-warning);
  font-weight: 600;
}
</style>
