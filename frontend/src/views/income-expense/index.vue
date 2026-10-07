<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-radio-group v-model="query.bizType" @change="search">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="income">其他收入</el-radio-button>
          <el-radio-button value="expense">其他支出</el-radio-button>
        </el-radio-group>
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
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'income-expense:create'" type="primary" @click="onCreate('income')">
          <el-icon><Plus /></el-icon>新增收入
        </el-button>
        <el-button v-permission="'income-expense:create'" @click="onCreate('expense')">新增支出</el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无单据">
        <el-table-column prop="bizDate" label="业务日期" width="115" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.bizType === 'income' ? 'success' : 'warning'" size="small">
              {{ row.bizType === 'income' ? '收入' : '支出' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="accountName" label="收入/费用科目" min-width="200" />
        <el-table-column prop="bankAccountName" label="收付账户" min-width="130">
          <template #default="{ row }">{{ row.bankAccountName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip />
        <el-table-column label="金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount" :class="row.bizType === 'income' ? 'amount--debit' : 'amount--credit'">
              {{ formatAmount(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="制单" width="100" />
        <el-table-column label="凭证" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.voucherId" type="success" size="small">已生成</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'income-expense:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'income-expense:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
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
          @size-change="onReset"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="580px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="类型">
              <el-radio-group v-model="form.bizType">
                <el-radio value="income">收入</el-radio>
                <el-radio value="expense">支出</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期" prop="bizDate">
              <el-date-picker v-model="form.bizDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="form.bizType === 'income' ? '收入科目' : '费用科目'" prop="accountId">
          <el-select
            v-model="form.accountId"
            filterable
            placeholder="选择损益类科目"
            style="width: 100%"
            @change="onAccountChange"
          >
            <el-option
              v-for="acc in accountOptionsFiltered"
              :key="acc.id"
              :label="`${acc.code} ${acc.fullName}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="收付账户">
          <el-select v-model="form.bankAccountId" filterable clearable placeholder="不选则使用默认资金科目" style="width: 100%">
            <el-option v-for="b in basicStore.banks" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>

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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { accountApi, incomeExpenseApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const dateRange = ref<[string, string] | null>(null)
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, bizType: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return incomeExpenseApi.list(params)
  },
})

const allAccounts = ref<any[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()

const initialForm = {
  bizType: 'income' as string,
  bizDate: new Date().toISOString().slice(0, 10),
  accountId: '',
  bankAccountId: '',
  partnerId: '',
  departmentId: '',
  amount: 0,
  summary: '',
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  bizDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
  accountId: [{ required: true, message: '请选择科目', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
}

/** 收入：收入类科目；支出：费用类科目 */
const accountOptionsFiltered = computed(() => {
  const incomeCodes = ['6001', '6051', '6111', '6201']
  const expenseCodes = ['6301', '6401', '6601', '6602', '6603', '6701', '6801', '6901']
  const allowed = form.bizType === 'income' ? incomeCodes : expenseCodes
  return allAccounts.value.filter((a) => a.category === 'profit' && allowed.some((c) => a.code.startsWith(c)))
})

const dialogTitle = computed(() => {
  const word = form.bizType === 'income' ? '其他收入' : '其他支出'
  return `${editId.value ? '编辑' : '新增'}${word}`
})

function onReset() {
  query.bizType = ''
  dateRange.value = null
  reset()
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
    accountId: row.accountId,
    bankAccountId: row.bankAccountId ?? '',
    partnerId: row.partnerId ?? '',
    departmentId: row.departmentId ?? '',
    amount: Number(row.amount),
    summary: row.summary ?? '',
    remark: row.remark ?? '',
  })
  dialogVisible.value = true
}

function onAccountChange() {
  // 切换科目时清空不适用的辅助核算
  form.partnerId = ''
  form.departmentId = ''
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
    for (const k of ['bankAccountId', 'partnerId', 'departmentId', 'summary', 'remark']) {
      if (!payload[k]) delete payload[k]
    }
    if (editId.value) await incomeExpenseApi.update(editId.value, payload)
    else await incomeExpenseApi.create(payload)
    ok('已保存并生成记账凭证')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`单据（${formatAmount(row.amount)}）`))) return
  try {
    await incomeExpenseApi.remove(row.id)
    ok('已删除，对应凭证同步删除')
    load()
  } catch {
    /* 错误已提示 */
  }
}

onMounted(async () => {
  allAccounts.value = await accountApi.options()
  await basicStore.loadAll()
  load()
})
</script>

<style scoped lang="scss">
.text-muted {
  color: #9ca3af;
}
</style>