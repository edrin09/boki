<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="accountId" filterable placeholder="选择会计科目" style="width: 280px" @change="load">
          <el-option
            v-for="acc in accountOptions"
            :key="acc.id"
            :label="`${acc.code} ${acc.fullName}`"
            :value="acc.id"
          />
        </el-select>
        <PeriodPicker v-model="startPeriod" width="140px" />
        <span class="sep">至</span>
        <PeriodPicker v-model="endPeriod" width="140px" />
        <el-select v-model="partnerId" clearable filterable placeholder="往来单位" style="width: 160px" @change="load">
          <el-option v-for="p in basicStore.partners" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <el-table v-loading="loading" :data="groups" empty-text="暂无数据">
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-table :data="row.entries ?? []" size="small" border>
              <el-table-column prop="voucherDate" label="日期" width="110" />
              <el-table-column label="凭证号" width="110">
                <template #default="scope">
                  {{ scope.row.word }} {{ String(scope.row.voucherNo).padStart(4, '0') }}
                </template>
              </el-table-column>
              <el-table-column prop="summary" label="摘要" min-width="180" />
              <el-table-column label="借方" width="130" align="right">
                <template #default="scope">
                  <span class="amount amount--debit">{{ scope.row.debit ? formatAmount(scope.row.debit) : '' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="贷方" width="130" align="right">
                <template #default="scope">
                  <span class="amount amount--credit">{{ scope.row.credit ? formatAmount(scope.row.credit) : '' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="余额" width="140" align="right">
                <template #default="scope">
                  <span class="amount amount--total">{{ formatAmount(scope.row.balance) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-table-column>
        <el-table-column label="往来单位" min-width="150">
          <template #default="{ row }">{{ row.partnerName || '（无）' }}</template>
        </el-table-column>
        <el-table-column label="部门" width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column label="项目" width="130">
          <template #default="{ row }">{{ row.projectName || '-' }}</template>
        </el-table-column>
        <el-table-column label="期初借方" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.openingDebit ? formatAmount(row.openingDebit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期初贷方" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.openingCredit ? formatAmount(row.openingCredit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本期借方" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.periodDebit ? formatAmount(row.periodDebit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本期贷方" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.periodCredit ? formatAmount(row.periodCredit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期末余额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">
              {{ formatAmount(row.closingDebit || row.closingCredit) }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="totals" class="totals">
        <span>期初借方：<b class="amount amount--debit">{{ formatAmount(totals.openingDebit) }}</b></span>
        <span>期初贷方：<b class="amount amount--credit">{{ formatAmount(totals.openingCredit) }}</b></span>
        <span>本期借方：<b class="amount amount--debit">{{ formatAmount(totals.periodDebit) }}</b></span>
        <span>本期贷方：<b class="amount amount--credit">{{ formatAmount(totals.periodCredit) }}</b></span>
        <span>
          期末余额：<b class="amount amount--total">{{ formatAmount(totals.closingDebit || totals.closingCredit) }}</b>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import { accountApi, booksApi } from '@/api'
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import { useBasicStore } from '@/stores/basic'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const basicStore = useBasicStore()

const accountId = ref('')
const partnerId = ref('')
const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const loading = ref(false)

const accountOptions = ref<any[]>([])
const groups = ref<any[]>([])
const totals = ref<any>(null)

async function load() {
  if (!accountId.value) {
    ElMessage.warning('请先选择会计科目')
    return
  }
  loading.value = true
  try {
    const res = await booksApi.subLedger({
      accountId: accountId.value,
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      partnerIds: partnerId.value || undefined,
    })
    groups.value = res.groups ?? []
    totals.value = res.totals
  } finally {
    loading.value = false
  }
}

watch([startPeriod, endPeriod], load)

function onExport() {
  if (!groups.value.length) {
    ElMessage.warning('请先查询数据')
    return
  }
  const rows = groups.value.map((g) => ({
    partnerName: g.partnerName ?? '（无）',
    departmentName: g.departmentName ?? '',
    projectName: g.projectName ?? '',
    openingDebit: g.openingDebit,
    openingCredit: g.openingCredit,
    periodDebit: g.periodDebit,
    periodCredit: g.periodCredit,
    closing: g.closingDebit || g.closingCredit,
  }))
  exportExcel({
    filename: `明细账_${accountId.value}_${endPeriod.value}.xlsx`,
    sheetName: '明细账',
    title: `明细账 - ${accountOptions.value.find((a) => a.id === accountId.value)?.fullName ?? ''}`,
    subtitle: `期间：${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}`,
    columns: [
      { title: '往来单位', prop: 'partnerName', width: 18 },
      { title: '部门', prop: 'departmentName', width: 14 },
      { title: '项目', prop: 'projectName', width: 14 },
      { title: '期初借方', prop: 'openingDebit', width: 15, amount: true },
      { title: '期初贷方', prop: 'openingCredit', width: 15, amount: true },
      { title: '本期借方', prop: 'periodDebit', width: 15, amount: true },
      { title: '本期贷方', prop: 'periodCredit', width: 15, amount: true },
      { title: '期末余额', prop: 'closing', width: 15, amount: true },
    ],
    rows,
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  accountOptions.value = await accountApi.options()
  basicStore.loadPartners()
  if (accountOptions.value.length) {
    accountId.value = accountOptions.value[0].id
    load()
  }
})
</script>

<style scoped lang="scss">
.sep {
  color: var(--app-text-secondary);
  margin: 0 4px;
}

.totals {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 10px 12px;
  margin-top: 12px;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
}
</style>