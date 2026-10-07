<template>
  <div class="page">
    <el-card shadow="never" class="mb12">
      <div class="page-toolbar">
        <el-radio-group v-model="tab" @change="load">
          <el-radio-button value="receivable">应收余额</el-radio-button>
          <el-radio-button value="payable">应付余额</el-radio-button>
          <el-radio-button value="write-offs">核销记录</el-radio-button>
        </el-radio-group>

        <PeriodPicker v-model="period" width="140px" />
        <el-select
          v-if="tab !== 'write-offs'"
          v-model="partnerFilter"
          placeholder="往来单位"
          clearable
          filterable
          style="width: 200px"
          @change="load"
        >
          <el-option
            v-for="p in basicStore.partners"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
        <el-checkbox v-if="tab !== 'write-offs'" v-model="onlyWithBalance" @change="load">
          仅显示有余额
        </el-checkbox>

        <div class="page-toolbar__spacer" />
        <el-button v-permission="'ar-ap:write-off'" type="primary" @click="onWriteOff">
          <el-icon><Connection /></el-icon>往来核销
        </el-button>
      </div>
    </el-card>

    <!-- 余额列表 -->
    <div v-if="tab !== 'write-offs'" class="page-card">
      <el-alert
        v-if="balanceData"
        type="info"
        :closable="false"
        show-icon
        class="mb12"
        :title="`${balanceData.account.code} ${balanceData.account.name} · ${periodLabel(period)} 余额合计 ${formatAmount(balanceData.totals.balance)} 元`"
      />
      <el-table v-loading="loading" :data="balanceData?.rows ?? []" empty-text="暂无往来数据">
        <el-table-column prop="partnerName" label="往来单位" min-width="200" />
        <el-table-column label="期初余额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount">{{ row.openingBalance ? formatAmount(row.openingBalance) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本期增加" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.periodDebit ? formatAmount(row.periodDebit) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本期减少" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.periodCredit ? formatAmount(row.periodCredit) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期末余额" width="160" align="right">
          <template #default="{ row }">
            <span class="amount amount--total" :class="row.direction === 'debit' ? 'amount--debit' : 'amount--credit'">
              {{ row.closingBalance ? formatAmount(row.closingBalance) : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'debit' ? 'success' : 'warning'" size="small">
              {{ row.direction === 'debit' ? '借' : '贷' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-permission="'ar-ap:write-off'"
              link
              type="primary"
              :disabled="!row.closingBalance"
              @click="onWriteOff(row)"
            >
              核销
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 核销记录 -->
    <div v-else class="page-card">
      <el-table v-loading="loading" :data="writeOffList" empty-text="暂无核销记录">
        <el-table-column prop="bizDate" label="核销日期" width="115" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'receivable' ? 'success' : 'warning'" size="small">
              {{ row.type === 'receivable' ? '应收核销' : '应付核销' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="partnerName" label="往来单位" min-width="180" />
        <el-table-column prop="accountName" label="往来科目" width="140" />
        <el-table-column prop="bankAccountName" label="收付账户" min-width="140" />
        <el-table-column label="金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="制单" width="100" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'ar-ap:write-off'" link type="danger" @click="onRemoveWriteOff(row)">
              撤销
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination
          v-model:current-page="woPage.page"
          v-model:page-size="woPage.pageSize"
          :total="woTotal"
          layout="total, prev, pager, next"
          @current-change="loadWriteOffs"
        />
      </div>
    </div>

    <!-- 核销弹窗 -->
    <el-dialog v-model="dialogVisible" title="往来核销" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="核销类型">
          <el-radio-group v-model="form.type">
            <el-radio value="receivable">应收核销（收款）</el-radio>
            <el-radio value="payable">应付核销（付款）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="往来单位" prop="partnerId">
          <el-select v-model="form.partnerId" filterable placeholder="选择往来单位" style="width: 100%">
            <el-option
              v-for="p in basicStore.partners"
              :key="p.id"
              :label="p.name"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="往来科目" prop="accountId">
          <el-select v-model="form.accountId" filterable placeholder="如 1122 应收账款" style="width: 100%">
            <el-option
              v-for="acc in arApAccountOptions"
              :key="acc.id"
              :label="`${acc.code} ${acc.fullName}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="收付账户" prop="bankAccountId">
          <el-select v-model="form.bankAccountId" filterable placeholder="选择资金账户" style="width: 100%">
            <el-option v-for="b in basicStore.banks" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="核销日期" prop="bizDate">
          <el-date-picker v-model="form.bizDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="核销金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
        <el-alert
          v-if="selectedRow?.closingBalance"
          type="info"
          :closable="false"
          :title="`当前余额 ${formatAmount(selectedRow.closingBalance)} 元，可支持部分核销`"
        />
        <el-form-item label="摘要">
          <el-input v-model="form.summary" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">确认核销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Connection } from '@element-plus/icons-vue'
import { accountApi, arApApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { currentPeriod, formatAmount, periodLabel, periodToYearMonth } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const basicStore = useBasicStore()

const tab = ref<'receivable' | 'payable' | 'write-offs'>('receivable')
const period = ref<number>(currentPeriod())
const partnerFilter = ref('')
const onlyWithBalance = ref(true)

const loading = ref(false)
const balanceData = ref<any>(null)

const writeOffList = ref<any[]>([])
const woTotal = ref(0)
const woPage = reactive({ page: 1, pageSize: 20 })

const accountOptions = ref<any[]>([])

/** 往来科目：应收（资产）与应付（负债） */
const arApAccountOptions = computed(() =>
  accountOptions.value.filter((a) => ['asset', 'liability'].includes(a.category)),
)

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const selectedRow = ref<any>(null)

const initialForm = {
  type: 'receivable' as 'receivable' | 'payable',
  partnerId: '',
  accountId: '',
  bankAccountId: '',
  bizDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  summary: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  partnerId: [{ required: true, message: '请选择往来单位', trigger: 'change' }],
  bankAccountId: [{ required: true, message: '请选择收付账户', trigger: 'change' }],
  bizDate: [{ required: true, message: '请选择核销日期', trigger: 'change' }],
  amount: [{ required: true, message: '请输入核销金额', trigger: 'blur' }],
}

async function load() {
  if (tab.value === 'write-offs') {
    await loadWriteOffs()
    return
  }
  loading.value = true
  try {
    const [year] = periodToYearMonth(period.value)
    const params: any = {
      endPeriod: period.value,
      fiscalYear: year,
      partnerIds: partnerFilter.value || undefined,
      onlyWithBalance: onlyWithBalance.value ? 'true' : undefined,
    }
    balanceData.value =
      tab.value === 'receivable'
        ? await arApApi.receivable(params)
        : await arApApi.payable(params)
  } finally {
    loading.value = false
  }
}

async function loadWriteOffs() {
  loading.value = true
  try {
    const res = await arApApi.writeOffs({ page: woPage.page, pageSize: woPage.pageSize })
    writeOffList.value = res.list ?? []
    woTotal.value = res.total ?? 0
  } finally {
    loading.value = false
  }
}

function onWriteOff(row?: any) {
  selectedRow.value = row ?? null
  Object.assign(form, { ...initialForm })
  if (row) {
    form.type = tab.value === 'payable' ? 'payable' : 'receivable'
    form.partnerId = row.partnerId
    form.amount = Number(row.closingBalance ?? 0)
  } else if (tab.value !== 'receivable') {
    form.type = 'payable'
  }
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.amount <= 0) {
    ElMessage.warning('核销金额必须大于 0')
    return
  }
  if (selectedRow.value?.closingBalance && form.amount > selectedRow.value.closingBalance) {
    ElMessage.warning('核销金额不能超过当前余额')
    return
  }

  saving.value = true
  try {
    const payload: any = { ...form }
    if (!payload.accountId) delete payload.accountId
    if (!payload.summary) delete payload.summary
    await arApApi.createWriteOff(payload)
    ok('核销成功，已生成记账凭证')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onRemoveWriteOff(row: any) {
  if (!(await confirmDelete('该核销记录'))) return
  try {
    await arApApi.removeWriteOff(row.id)
    ok('已撤销，对应凭证同步删除')
    load()
  } catch {
    /* 错误已提示 */
  }
}

watch(period, load)

onMounted(async () => {
  accountOptions.value = await accountApi.options()
  await basicStore.loadAll()
  load()
})
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}
</style>