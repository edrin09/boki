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
        <el-checkbox v-model="includeUnapproved" @change="load">含未审核</el-checkbox>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <div v-if="summary" class="summary">
        <div class="summary__item">
          <span class="summary__label">科目</span>
          <span class="summary__value">{{ summary.account.code }} {{ summary.account.name }}</span>
        </div>
        <div class="summary__item">
          <span class="summary__label">期初余额</span>
          <span class="summary__value">
            {{ summary.summary.openingDirection === 'debit' ? '借' : '贷' }}
            {{ formatAmount(summary.summary.openingBalance) }}
          </span>
        </div>
        <div class="summary__item">
          <span class="summary__label">本期借方</span>
          <span class="summary__value amount amount--debit">{{ formatAmount(summary.summary.periodDebit) }}</span>
        </div>
        <div class="summary__item">
          <span class="summary__label">本期贷方</span>
          <span class="summary__value amount amount--credit">{{ formatAmount(summary.summary.periodCredit) }}</span>
        </div>
        <div class="summary__item">
          <span class="summary__label">期末余额</span>
          <span class="summary__value amount amount--total">
            {{ summary.summary.closingDirection === 'debit' ? '借' : '贷' }}
            {{ formatAmount(summary.summary.closingBalance) }}
          </span>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" empty-text="暂无数据" max-height="calc(100vh - 320px)">
        <el-table-column prop="voucherDate" label="日期" width="110" />
        <el-table-column label="凭证号" width="110">
          <template #default="{ row }">{{ row.word }} {{ String(row.voucherNo).padStart(4, '0') }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="200" />
        <el-table-column label="借方金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.debit ? formatAmount(row.debit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.credit ? formatAmount(row.credit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'debit' ? 'success' : 'warning'" size="small">
              {{ row.direction === 'debit' ? '借' : '贷' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="160" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.balance) }}</span>
          </template>
        </el-table-column>
      </el-table>
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
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const accountId = ref('')
const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const includeUnapproved = ref(false)
const loading = ref(false)

const accountOptions = ref<any[]>([])
const rows = ref<any[]>([])
const summary = ref<any>(null)

async function load() {
  if (!accountId.value) {
    ElMessage.warning('请先选择会计科目')
    return
  }
  loading.value = true
  try {
    summary.value = await booksApi.ledger({
      accountId: accountId.value,
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      includeUnapproved: includeUnapproved.value ? true : undefined,
    })
    rows.value = summary.value?.rows ?? []
  } finally {
    loading.value = false
  }
}

watch([startPeriod, endPeriod], load)

function onExport() {
  if (!summary.value) {
    ElMessage.warning('请先查询数据')
    return
  }
  exportExcel({
    filename: `总账_${summary.value.account.code}_${endPeriod.value}.xlsx`,
    sheetName: '总账',
    title: `总账 - ${summary.value.account.code} ${summary.value.account.name}`,
    subtitle: `期间：${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}`,
    columns: [
      { title: '日期', prop: 'voucherDate', width: 12 },
      { title: '凭证号', prop: 'voucherNo', width: 12, format: (r) => `${r.word}${String(r.voucherNo).padStart(4, '0')}` },
      { title: '摘要', prop: 'summary', width: 30 },
      { title: '借方金额', prop: 'debit', width: 16, amount: true },
      { title: '贷方金额', prop: 'credit', width: 16, amount: true },
      { title: '方向', prop: 'direction', width: 8, format: (r) => (r.direction === 'debit' ? '借' : '贷') },
      { title: '余额', prop: 'balance', width: 16, amount: true },
    ],
    rows: rows.value,
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  accountOptions.value = await accountApi.options()
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

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f8fafc;
  border-radius: 6px;

  &__item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__label {
    font-size: 12px;
    color: var(--app-text-secondary);
  }

  &__value {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }
}
</style>