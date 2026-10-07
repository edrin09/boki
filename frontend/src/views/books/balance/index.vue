<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="startPeriod" width="140px" />
        <span class="sep">至</span>
        <PeriodPicker v-model="endPeriod" width="140px" />
        <el-select v-model="category" placeholder="科目类别" clearable style="width: 130px" @change="load">
          <el-option v-for="(label, key) in CATEGORY_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-checkbox v-model="includeUnapproved" @change="load">含未审核</el-checkbox>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" max-height="calc(100vh - 260px)" show-summary
        :summary-method="summaryMethod" empty-text="暂无数据">
        <el-table-column prop="code" label="科目编码" width="105" />
        <el-table-column prop="name" label="科目名称" min-width="180" />
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">{{ row.direction === 'debit' ? '借' : '贷' }}</template>
        </el-table-column>
        <el-table-column label="期初余额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount" :class="row.openingDirection === 'debit' ? 'amount--debit' : 'amount--credit'">
              {{ row.openingBalance ? `${row.openingDirection === 'debit' ? '借' : '贷'} ${formatAmount(row.openingBalance)}` : '' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="本期借方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.periodDebit ? formatAmount(row.periodDebit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本期贷方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.periodCredit ? formatAmount(row.periodCredit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期末余额" width="160" align="right">
          <template #default="{ row }">
            <span class="amount amount--total" :class="row.closingDirection === 'debit' ? 'amount--debit' : 'amount--credit'">
              {{ row.closingBalance ? `${row.closingDirection === 'debit' ? '借' : '贷'} ${formatAmount(row.closingBalance)}` : '' }}
            </span>
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
import { booksApi } from '@/api'
import { currentPeriod, formatAmount, periodLabel, CATEGORY_LABELS } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const category = ref('')
const includeUnapproved = ref(false)
const loading = ref(false)

const rows = ref<any[]>([])
const totals = ref<any>({})

async function load() {
  loading.value = true
  try {
    const res = await booksApi.balance({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      accountCodes: category.value ? [`${category.value === 'asset' ? '1' : category.value === 'liability' ? '2' : category.value === 'equity' ? '3' : category.value === 'cost' ? '4' : '6'}`] : undefined,
      includeUnapproved: includeUnapproved.value ? true : undefined,
    })
    rows.value = res.rows ?? []
    totals.value = res.totals ?? {}
  } finally {
    loading.value = false
  }
}

function summaryMethod({ columns }: any) {
  return columns.map((_col: any, index: number) => {
    if (index === 0) return '合计'
    if (index === 1) return ''
    if (index === 2) return ''
    const key = ['openingBalance', 'periodDebit', 'periodCredit', 'closingBalance'][index - 3]
    if (!key) return ''
    const value = Number(totals.value?.[key] ?? 0)
    return value ? formatAmount(value) : ''
  })
}

watch([startPeriod, endPeriod], load)

function onExport() {
  if (!rows.value.length) {
    ElMessage.warning('请先查询数据')
    return
  }
  exportExcel({
    filename: `科目余额表_${endPeriod.value}.xlsx`,
    sheetName: '科目余额表',
    title: '科目余额表',
    subtitle: `期间：${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}`,
    columns: [
      { title: '科目编码', prop: 'code', width: 12 },
      { title: '科目名称', prop: 'name', width: 26 },
      { title: '级次', prop: 'level', width: 8 },
      { title: '方向', prop: 'direction', width: 8, format: (r) => (r.direction === 'debit' ? '借' : '贷') },
      { title: '期初借方', prop: 'openingDebit', width: 16, amount: true },
      { title: '期初贷方', prop: 'openingCredit', width: 16, amount: true },
      { title: '本期借方', prop: 'periodDebit', width: 16, amount: true },
      { title: '本期贷方', prop: 'periodCredit', width: 16, amount: true },
      { title: '期末借方', prop: 'closingDebit', width: 16, amount: true },
      { title: '期末贷方', prop: 'closingCredit', width: 16, amount: true },
    ],
    rows: rows.value,
    summary: totals.value,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.sep {
  color: var(--app-text-secondary);
  margin: 0 4px;
}
</style>