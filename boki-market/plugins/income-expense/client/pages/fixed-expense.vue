<template>
  <div class="page">
    <!-- 待生成提示 -->
    <el-alert
      v-if="pendingInfo && pendingInfo.count > 0"
      type="warning"
      :closable="false"
      show-icon
      class="mb12"
    >
      <template #title>
        检测到 {{ pendingInfo.count }} 期固定费用待入账（预计合计
        <span class="amount amount--credit">{{ formatAmount(pendingInfo.totalAmount) }}</span>），
        {{ autoGenerating ? '正在自动生成…' : '' }}
      </template>
      <div class="pending-items">
        <el-tag
          v-for="item in pendingInfo.items"
          :key="item.id"
          size="small"
          class="pending-tag"
          type="warning"
          effect="plain"
        >
          {{ item.name }} · {{ item.periods.map(periodLabel).join('、') }}
        </el-tag>
      </div>
      <el-button
        v-permission="'fixed-expense:create'"
        size="small"
        type="primary"
        :loading="generating"
        style="margin-top: 8px"
        @click="onGenerate"
      >
        <el-icon><MagicStick /></el-icon>立即生成
      </el-button>
    </el-alert>
    <el-alert
      v-else-if="pendingInfo && !autoGenerating"
      type="success"
      :closable="false"
      show-icon
      class="mb12"
      title="所有固定费用均已按期入账"
    />

    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="费用名称"
          clearable
          style="width: 200px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.status" style="width: 120px" @change="search">
          <el-option label="全部状态" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-dropdown v-permission="'fixed-expense:create'" @command="onQuickCreate">
          <el-button type="primary">
            <el-icon><Plus /></el-icon>新增固定费用<el-icon><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="">自定义录入</el-dropdown-item>
              <el-dropdown-item divided v-for="q in QUICK_TEMPLATES" :key="q" :command="q">
                {{ q }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无固定费用，点击右上角新增">
        <el-table-column prop="name" label="费用名称" min-width="150" show-overflow-tooltip />
        <el-table-column label="频率" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.frequency === 'monthly' ? 'primary' : row.frequency === 'once' ? 'warning' : 'info'">
              {{ frequencyLabel(row.frequency) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="accountName" label="费用科目" min-width="140" show-overflow-tooltip />
        <el-table-column label="支付账户" min-width="110">
          <template #default="{ row }">{{ row.bankAccountName || '默认现金' }}</template>
        </el-table-column>
        <el-table-column label="扣费日" width="80" align="center">
          <template #default="{ row }">
            {{ row.frequency === 'once' ? `${row.bizDay}号` : `每月${row.bizDay}号` }}
          </template>
        </el-table-column>
        <el-table-column label="生效期间" min-width="150">
          <template #default="{ row }">
            {{ periodLabel(String(row.startDate).slice(0, 7)) }} 起
            {{ row.endDate ? `至 ${periodLabel(String(row.endDate).slice(0, 7))}` : '· 长期' }}
          </template>
        </el-table-column>
        <el-table-column label="入账进度" min-width="140">
          <template #default="{ row }">
            <template v-if="row.pendingPeriods?.length">
              <el-tag size="small" type="warning">待生成 {{ row.pendingPeriods.length }} 期</el-tag>
            </template>
            <template v-else-if="row.generatedCount > 0">
              <el-tag size="small" type="success">已生成 {{ row.generatedCount }} 期</el-tag>
            </template>
            <span v-else class="text-muted">尚未生成</span>
          </template>
        </el-table-column>
        <el-table-column label="最近生成" width="100">
          <template #default="{ row }">
            {{ row.lastPeriod ? periodLabel(row.lastPeriod) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="启用" width="70" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 1"
              :disabled="!canUpdate"
              @change="(v: any) => onToggle(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onShowLogs(row)">生成历史</el-button>
            <el-button v-permission="'fixed-expense:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'fixed-expense:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="handleSize"
        />
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item v-if="!editId" label="快速填入">
          <div class="quick-chips">
            <el-tag
              v-for="q in QUICK_TEMPLATES"
              :key="q"
              class="quick-chip"
              :type="form.name === q ? 'primary' : 'info'"
              effect="plain"
              @click="onQuickFill(q)"
            >
              {{ q }}
            </el-tag>
          </div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="费用名称" prop="name">
              <el-input v-model="form.name" maxlength="100" placeholder="如：办公室房租" @blur="onNameBlur" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发生频率" prop="frequency">
              <el-select v-model="form.frequency" style="width: 100%">
                <el-option label="一次性" value="once" />
                <el-option label="每月" value="monthly" />
                <el-option label="每季度" value="quarterly" />
                <el-option label="每年" value="yearly" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="固定金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="扣费日" prop="bizDay">
              <el-input-number v-model="form.bizDay" :min="1" :max="31" :step="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="费用科目" prop="accountId">
          <el-select v-model="form.accountId" filterable placeholder="输入费用名称可智能推荐" style="width: 100%">
            <el-option
              v-for="acc in accountOptionsFiltered"
              :key="acc.id"
              :label="`${acc.code} ${acc.fullName}`"
              :value="acc.id"
            />
          </el-select>
          <div v-if="suggestTip" class="suggest-tip">
            <el-icon><MagicStick /></el-icon>
            {{ suggestTip }}
          </div>
        </el-form-item>

        <el-form-item label="支付账户">
          <el-select v-model="form.bankAccountId" filterable clearable placeholder="不选则默认现金科目" style="width: 100%">
            <el-option v-for="b in basicStore.banks" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开始期间" prop="startDate">
              <el-date-picker
                v-model="form.startDate"
                type="month"
                value-format="YYYY-MM-01"
                placeholder="从哪个月开始"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束期间">
              <el-date-picker
                v-model="form.endDate"
                type="month"
                value-format="YYYY-MM-01"
                :disabled="form.frequency === 'once'"
                :placeholder="form.frequency === 'once' ? '一次性费用无需选择' : '留空为长期有效'"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-alert
          v-if="backfillCount > 0"
          type="info"
          :closable="false"
          show-icon
          class="mb12"
          :title="`起始期间早于当前月，保存后首次生成将自动补录 ${backfillCount} 期凭证`"
        />

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="往来单位">
              <el-select v-model="form.partnerId" filterable clearable placeholder="可选，如房东" style="width: 100%">
                <el-option v-for="p in basicStore.partners" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="form.departmentId" filterable clearable placeholder="可选" style="width: 100%">
                <el-option v-for="d in basicStore.departments" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="自动审核">
          <el-switch v-model="form.autoApprove" active-text="生成后直接审核入账" inactive-text="生成草稿待审核" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成历史 -->
    <el-dialog v-model="logsVisible" :title="`生成历史 - ${logsTemplate?.name ?? ''}`" width="560px">
      <el-table :data="logsList" v-loading="logsLoading" empty-text="尚未生成过" size="small">
        <el-table-column label="期间" width="100">
          <template #default="{ row }">{{ periodLabel(row.period) }}</template>
        </el-table-column>
        <el-table-column prop="bizDate" label="凭证日期" width="110" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="凭证" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.voucherId" type="success" size="small">已生成</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowDown, MagicStick, Plus, Search } from '@element-plus/icons-vue'
import { accountApi, fixedExpenseApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'
import { useUserStore } from '@/stores/user'

const basicStore = useBasicStore()
const userStore = useUserStore()

/** 常用固定费用快捷模板 */
const QUICK_TEMPLATES = ['办公室房租', '物业费', '宽带费', '水电费', '停车费', '服务器费用']

const canUpdate = computed(() => userStore.hasPermission('fixed-expense:update'))

const { list, total, loading, query, load, search, handleSize } = usePagedList({
  fetcher: (params) => fixedExpenseApi.list(params),
  defaultParams: { page: 1, pageSize: 20, status: '' },
})

const allAccounts = ref<any[]>([])
const pendingInfo = ref<any>(null)
const autoGenerating = ref(false)
const generating = ref(false)

const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()
const suggestTip = ref('')

const todayPeriod = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const initialForm = {
  name: '',
  frequency: 'monthly',
  amount: 0,
  accountId: '',
  bankAccountId: '',
  partnerId: '',
  departmentId: '',
  projectId: '',
  bizDay: 1,
  startDate: `${todayPeriod()}-01`,
  endDate: '',
  autoApprove: true,
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请填写费用名称', trigger: 'blur' }],
  frequency: [{ required: true, message: '请选择频率', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  accountId: [{ required: true, message: '请选择费用科目', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始期间', trigger: 'change' }],
}

const accountOptionsFiltered = computed(() => {
  const codes = ['6601', '6602', '6603', '6701', '6301', '6401']
  return allAccounts.value.filter((a) => a.category === 'profit' && codes.some((c) => a.code.startsWith(c)))
})

/** 起始期早于当月时，预计补生成期数 */
const backfillCount = computed(() => {
  if (!form.startDate) return 0
  const start = String(form.startDate).slice(0, 7)
  if (start >= todayPeriod()) return 0
  if (form.frequency === 'once') return 1 // 一次性：仅补录起始期 1 期
  const [sy, sm] = start.split('-').map(Number)
  const [ty, tm] = todayPeriod().split('-').map(Number)
  const diff = (ty * 12 + tm) - (sy * 12 + sm)
  const step = form.frequency === 'quarterly' ? 3 : form.frequency === 'yearly' ? 12 : 1
  return Math.floor(diff / step) + 1
})

const dialogTitle = computed(() => `${editId.value ? '编辑' : '新增'}固定费用`)

// ============ 生成历史 ============
const logsVisible = ref(false)
const logsLoading = ref(false)
const logsList = ref<any[]>([])
const logsTemplate = ref<any>(null)

function frequencyLabel(f: string) {
  return f === 'once' ? '一次性' : f === 'quarterly' ? '每季' : f === 'yearly' ? '每年' : '每月'
}

function periodLabel(p: string) {
  if (!p || p.length < 7) return p
  return `${p.slice(0, 4)}年${Number(p.slice(5, 7))}月`
}

function onQuickCreate(name: string) {
  editId.value = ''
  Object.assign(form, { ...initialForm })
  suggestTip.value = ''
  if (name) onQuickFill(name)
  dialogVisible.value = true
}

/** 快捷模板：预填名称并智能推荐科目 */
async function onQuickFill(name: string) {
  form.name = name
  await doSuggest()
}

/** 名称失焦智能推荐科目 */
async function doSuggest() {
  const name = form.name.trim()
  if (!name) return
  try {
    const res = await fixedExpenseApi.suggest(name)
    if (res?.accountId) {
      form.accountId = res.accountId
      suggestTip.value = res.reason || '已按名称智能推荐科目'
    } else {
      suggestTip.value = ''
    }
  } catch {
    suggestTip.value = ''
  }
}

function onNameBlur() {
  // 未选科目时才自动推荐，避免覆盖用户选择
  if (!form.accountId) void doSuggest()
}

function onEdit(row: any) {
  editId.value = row.id
  Object.assign(form, {
    name: row.name,
    frequency: row.frequency,
    amount: Number(row.amount),
    accountId: row.accountId,
    bankAccountId: row.bankAccountId ?? '',
    partnerId: row.partnerId ?? '',
    departmentId: row.departmentId ?? '',
    projectId: row.projectId ?? '',
    bizDay: row.bizDay ?? 1,
    startDate: String(row.startDate).slice(0, 10),
    endDate: row.endDate ? String(row.endDate).slice(0, 10) : '',
    autoApprove: !!row.autoApprove,
    remark: row.remark ?? '',
  })
  suggestTip.value = ''
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.amount <= 0) {
    ElMessage.warning('金额必须大于 0')
    return
  }
  saving.value = true
  try {
    const payload: any = { ...form }
    for (const k of ['bankAccountId', 'partnerId', 'departmentId', 'projectId', 'endDate', 'remark']) {
      if (!payload[k]) delete payload[k]
    }
    if (editId.value) await fixedExpenseApi.update(editId.value, payload)
    else await fixedExpenseApi.create(payload)
    ok(editId.value ? '已保存' : '已保存，到期将自动生成凭证')
    dialogVisible.value = false
    await Promise.all([load(), refreshPending()])
  } finally {
    saving.value = false
  }
}

async function onToggle(row: any, v: any) {
  try {
    await fixedExpenseApi.toggleStatus(row.id, v ? 1 : 0)
    ok(v ? '已启用，到期将自动生成' : '已停用')
    await Promise.all([load(), refreshPending()])
  } catch {
    /* 错误已提示 */
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`固定费用「${row.name}」`))) return
  try {
    await fixedExpenseApi.remove(row.id)
    ok('已删除')
    await Promise.all([load(), refreshPending()])
  } catch {
    /* 错误已提示 */
  }
}

async function onShowLogs(row: any) {
  logsTemplate.value = row
  logsVisible.value = true
  logsLoading.value = true
  try {
    logsList.value = await fixedExpenseApi.logs(row.id)
  } finally {
    logsLoading.value = false
  }
}

/** 手动触发生成 */
async function onGenerate() {
  generating.value = true
  try {
    const res = await fixedExpenseApi.generate()
    notifyGenerateResult(res)
    await Promise.all([load(), refreshPending()])
  } finally {
    generating.value = false
  }
}

function notifyGenerateResult(res: any) {
  if (!res) return
  if (res.createdCount > 0) {
    const total = (res.results ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    ok(`已自动生成 ${res.createdCount} 期固定费用凭证，合计 ${formatAmount(total)}`)
  }
  if (res.failedCount > 0) {
    ElMessage.warning(
      `${res.failedCount} 期生成失败：${(res.failures ?? []).map((f: any) => `${f.name}（${f.message}）`).join('；')}`,
    )
  }
  if (!res.createdCount && !res.failedCount) ElMessage.info('没有需要生成的固定费用')
}

async function refreshPending() {
  try {
    pendingInfo.value = await fixedExpenseApi.pending()
  } catch {
    pendingInfo.value = null
  }
}

/** 进入页面自动检测并生成到期固定费用（幂等，重复调用安全） */
async function autoGenerate() {
  if (!userStore.hasPermission('fixed-expense:create')) return
  if (!pendingInfo.value || pendingInfo.value.count <= 0) return
  autoGenerating.value = true
  try {
    const res = await fixedExpenseApi.generate()
    notifyGenerateResult(res)
    await Promise.all([load(), refreshPending()])
  } catch {
    /* 自动生成失败不打扰，用户可手动点击 */
  } finally {
    autoGenerating.value = false
  }
}

onMounted(async () => {
  allAccounts.value = await accountApi.options()
  await basicStore.loadAll()
  await load()
  await refreshPending()
  void autoGenerate()
})
</script>

<style scoped lang="scss">
.text-muted {
  color: #9ca3af;
}

.pending-items {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pending-tag {
  cursor: default;
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  cursor: pointer;
}

.suggest-tip {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  color: #e6a23c;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
