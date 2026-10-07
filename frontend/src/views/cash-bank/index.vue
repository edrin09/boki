<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.bizType" placeholder="单据类型" clearable style="width: 140px" @change="search">
          <el-option v-for="(label, key) in BIZ_TYPES" :key="key" :label="label" :value="key" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 240px"
          @change="search"
        />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'cash-bank:create'" type="primary" @click="onCreate('receipt')">
          <el-icon><Plus /></el-icon>新增收款
        </el-button>
        <el-dropdown v-permission="'cash-bank:create'" @command="onCreate">
          <el-button>
            其他单据<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="payment">新增付款</el-dropdown-item>
              <el-dropdown-item command="transfer">新增转账</el-dropdown-item>
              <el-dropdown-item command="expense">费用报销</el-dropdown-item>
              <el-dropdown-item command="income">其他收入</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无单据">
        <el-table-column prop="bizDate" label="业务日期" width="115" />
        <el-table-column label="类型" width="105">
          <template #default="{ row }">
            <el-tag :type="bizTag(row.bizType)" size="small">{{ BIZ_TYPES[row.bizType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bankAccountName" label="资金账户" min-width="140" />
        <el-table-column label="对方科目" min-width="200">
          <template #default="{ row }">
            <template v-if="row.bizType === 'transfer'">
              → {{ row.toBankAccountName }}
            </template>
            <span v-else-if="row.accountName">{{ row.accountCode }} {{ row.accountName }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip />
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="制单" width="100" />
        <el-table-column label="凭证" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.voucherId" type="success" size="small">已生成</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'cash-bank:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button
              v-if="row.voucherId"
              link
              type="warning"
              @click="viewVoucher(row)"
            >
              查看凭证
            </el-button>
            <el-button v-permission="'cash-bank:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
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
          @size-change="reset"
        />
      </div>
    </div>

    <!-- 单据弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="640px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="业务类型">
              <el-select v-model="form.bizType" style="width: 100%" @change="onBizTypeChange">
                <el-option v-for="(label, key) in BIZ_TYPES" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期" prop="bizDate">
              <el-date-picker v-model="form.bizDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="资金账户" prop="bankAccountId">
          <el-select v-model="form.bankAccountId" filterable placeholder="选择收付款账户" style="width: 100%">
            <el-option
              v-for="b in basicStore.banks"
              :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`"
              :value="b.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.bizType === 'transfer'" label="转入账户" prop="toBankAccountId">
          <el-select v-model="form.toBankAccountId" filterable placeholder="选择转入账户" style="width: 100%">
            <el-option
              v-for="b in basicStore.banks.filter((x) => x.id !== form.bankAccountId)"
              :key="b.id"
              :label="`${b.name}${b.accountCode ? `（${b.accountCode}）` : '（未关联科目）'}`"
              :value="b.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-else label="对方科目" prop="accountId">
          <el-select
            v-model="form.accountId"
            filterable
            placeholder="选择对方会计科目"
            style="width: 100%"
          >
            <el-option
              v-for="acc in counterAccountOptions"
              :key="acc.id"
              :label="`${acc.code} ${acc.fullName}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="自动审核">
              <el-switch v-model="form.autoApprove" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="往来单位">
              <el-select v-model="form.partnerId" filterable clearable placeholder="可选" style="width: 100%">
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

        <el-form-item label="摘要">
          <el-input v-model="form.summary" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存并生成凭证</el-button>
      </template>
    </el-dialog>

    <!-- 凭证查看 -->
    <el-dialog v-model="voucherVisible" title="关联凭证" width="720px">
      <el-descriptions v-if="voucherDetail" :column="3" border size="small">
        <el-descriptions-item label="凭证字">{{ voucherDetail.word }}</el-descriptions-item>
        <el-descriptions-item label="凭证号">
          {{ String(voucherDetail.voucherNo).padStart(4, '0') }}
        </el-descriptions-item>
        <el-descriptions-item label="日期">{{ voucherDetail.voucherDate }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(voucherDetail.status) }}</el-descriptions-item>
        <el-descriptions-item label="借方合计">{{ formatAmount(voucherDetail.debitTotal) }}</el-descriptions-item>
        <el-descriptions-item label="贷方合计">{{ formatAmount(voucherDetail.creditTotal) }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="voucherDetail?.entries ?? []" size="small" class="mt8">
        <el-table-column prop="summary" label="摘要" min-width="140" />
        <el-table-column label="科目" min-width="180">
          <template #default="{ row }">{{ row.accountCode }} {{ row.accountName }}</template>
        </el-table-column>
        <el-table-column label="借方" width="120" align="right">
          <template #default="{ row }">{{ row.debit ? formatAmount(row.debit) : '' }}</template>
        </el-table-column>
        <el-table-column label="贷方" width="120" align="right">
          <template #default="{ row }">{{ row.credit ? formatAmount(row.credit) : '' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, ArrowDown } from '@element-plus/icons-vue'
import { accountApi, cashBankApi, voucherApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount, voucherStatusMeta } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const BIZ_TYPES: Record<string, string> = {
  receipt: '收款单',
  payment: '付款单',
  transfer: '转账单',
  expense: '费用报销',
  income: '其他收入',
}
const BIZ_TAGS: Record<string, any> = {
  receipt: 'success',
  payment: 'warning',
  transfer: 'primary',
  expense: 'danger',
  income: 'info',
}
const bizTag = (t: string) => BIZ_TAGS[t] ?? 'info'
const statusLabel = (s: string) => voucherStatusMeta(s).label

const dateRange = ref<[string, string] | null>(null)
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, bizType: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return cashBankApi.list(params)
  },
})

const accountOptions = ref<any[]>([])

/** 对方科目：转账不需要，其他按业务类型给出建议范围 */
const counterAccountOptions = computed(() => {
  const type = form.bizType
  if (type === 'expense') {
    return accountOptions.value.filter((a) => ['cost', 'profit'].includes(a.category))
  }
  if (type === 'income') {
    return accountOptions.value.filter((a) => a.category === 'profit')
  }
  if (type === 'receipt') {
    return accountOptions.value.filter((a) => ['asset', 'liability'].includes(a.category))
  }
  if (type === 'payment') {
    return accountOptions.value.filter((a) => ['asset', 'liability', 'cost', 'profit'].includes(a.category))
  }
  return accountOptions.value
})

const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()

const initialForm = {
  bizType: 'receipt' as string,
  bizDate: new Date().toISOString().slice(0, 10),
  bankAccountId: '',
  accountId: '',
  toBankAccountId: '',
  partnerId: '',
  departmentId: '',
  amount: 0,
  summary: '',
  remark: '',
  autoApprove: true,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  bizDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
  bankAccountId: [{ required: true, message: '请选择资金账户', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
}

const dialogTitle = computed(() => {
  const name = editId.value ? '编辑' : '新增'
  return `${name}${BIZ_TYPES[form.bizType] ?? '单据'}`
})

function onBizTypeChange() {
  form.accountId = ''
  form.toBankAccountId = ''
}

function onCreate(bizType: string) {
  editId.value = ''
  Object.assign(form, { ...initialForm, bizType })
  dialogVisible.value = true
}

function onEdit(row: any) {
  editId.value = row.id
  Object.assign(form, {
    bizType: row.bizType,
    bizDate: String(row.bizDate).slice(0, 10),
    bankAccountId: row.bankAccountId,
    accountId: row.accountId ?? '',
    toBankAccountId: row.toBankAccountId ?? '',
    partnerId: row.partnerId ?? '',
    departmentId: row.departmentId ?? '',
    amount: Number(row.amount),
    summary: row.summary ?? '',
    remark: row.remark ?? '',
    autoApprove: true,
  })
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.amount <= 0) {
    ElMessage.warning('金额必须大于 0')
    return
  }
  if (form.bizType === 'transfer' && !form.toBankAccountId) {
    ElMessage.warning('转账单据请选择转入账户')
    return
  }
  if (form.bizType !== 'transfer' && !form.accountId) {
    ElMessage.warning('请选择对方会计科目')
    return
  }

  saving.value = true
  try {
    const payload: any = { ...form }
    if (!payload.accountId) delete payload.accountId
    if (!payload.toBankAccountId) delete payload.toBankAccountId
    if (!payload.partnerId) delete payload.partnerId
    if (!payload.departmentId) delete payload.departmentId
    if (!payload.summary) delete payload.summary
    if (!payload.remark) delete payload.remark

    if (editId.value) await cashBankApi.update(editId.value, payload)
    else await cashBankApi.create(payload)
    ok('已保存并生成记账凭证')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`${BIZ_TYPES[row.bizType]}（${formatAmount(row.amount)}）`))) return
  try {
    await cashBankApi.remove(row.id)
    ok('已删除，对应凭证同步删除')
    load()
  } catch {
    /* 错误已提示 */
  }
}

const voucherVisible = ref(false)
const voucherDetail = ref<any>(null)

async function viewVoucher(row: any) {
  if (!row.voucherId) return
  voucherDetail.value = await voucherApi.detail(row.voucherId)
  voucherVisible.value = true
}

onMounted(async () => {
  accountOptions.value = await accountApi.options()
  await basicStore.loadAll()
  load()
})
</script>

<style scoped lang="scss">
.text-muted {
  color: #9ca3af;
}

.mt8 {
  margin-top: 8px;
}
</style>