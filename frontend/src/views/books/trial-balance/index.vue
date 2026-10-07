<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="startPeriod" width="140px" />
        <span class="sep">至</span>
        <PeriodPicker v-model="endPeriod" width="140px" />
        <el-checkbox v-model="includeUnapproved" @change="load">含未审核</el-checkbox>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-tag v-if="data" :type="data.balanced ? 'success' : 'danger'" size="default">
          <el-icon v-if="data.balanced"><CircleCheckFilled /></el-icon>
          <el-icon v-else><CircleCloseFilled /></el-icon>
          {{ data.balanced ? '借贷平衡' : `不平衡，差额 ${formatAmount(data.difference)}` }}
        </el-tag>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <el-table v-loading="loading" :data="data?.rows ?? []" show-summary :summary-method="summaryMethod"
        empty-text="暂无发生额数据">
        <el-table-column prop="code" label="科目编码" width="120" />
        <el-table-column prop="name" label="科目名称" min-width="200" />
        <el-table-column label="类别" width="110">
          <template #default="{ row }">
            <el-tag :type="CATEGORY_TAG_TYPE[row.category]" size="small">
              {{ CATEGORY_LABELS[row.category] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="期初借方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--debit">{{ row.openingDebit ? formatAmount(row.openingDebit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期初贷方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--credit">{{ row.openingCredit ? formatAmount(row.openingCredit) : '' }}</span>
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
        <el-table-column label="期末借方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--total amount--debit">{{ row.closingDebit ? formatAmount(row.closingDebit) : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期末贷方" width="150" align="right">
          <template #default="{ row }">
            <span class="amount amount--total amount--credit">{{ row.closingCredit ? formatAmount(row.closingCredit) : '' }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { booksApi } from '@/api'
import { currentPeriod, formatAmount, periodLabel, CATEGORY_LABELS, CATEGORY_TAG_TYPE } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const includeUnapproved = ref(false)
const loading = ref(false)
const data = ref<any>(null)

async function load() {
  loading.value = true
  try {
    data.value = await booksApi.trialBalance({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      includeUnapproved: includeUnapproved.value ? true : undefined,
    })
  } finally {
    loading.value = false
  }
}

function summaryMethod({ columns }: any) {
  const totals = data.value?.totals ?? {}
  return columns.map((_col: any, index: number) => {
    if (index === 0) return '合计'
    if (index <= 2) return ''
    const key = [
      'openingDebit',
      'openingCredit',
      'periodDebit',
      'periodCredit',
      'closingDebit',
      'closingCredit',
    ][index - 3]
    const value = Number(totals?.[key] ?? 0)
    return value ? formatAmount(value) : ''
  })
}

watch([startPeriod, endPeriod], load)

function onExport() {
  if (!data.value?.rows?.length) {
    ElMessage.warning('请先查询数据')
    return
  }
  exportExcel({
    filename: `试算平衡表_${endPeriod.value}.xlsx`,
    sheetName: '试算平衡表',
    title: '试算平衡表',
    subtitle: `期间：${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}`,
    columns: [
      { title: '科目编码', prop: 'code', width: 12 },
      { title: '科目名称', prop: 'name', width: 26 },
      { title: '类别', prop: 'category', width: 12, format: (r) => CATEGORY_LABELS[r.category] ?? '' },
      { title: '期初借方', prop: 'openingDebit', width: 16, amount: true },
      { title: '期初贷方', prop: 'openingCredit', width: 16, amount: true },
      { title: '本期借方', prop: 'periodDebit', width: 16, amount: true },
      { title: '本期贷方', prop: 'periodCredit', width: 16, amount: true },
      { title: '期末借方', prop: 'closingDebit', width: 16, amount: true },
      { title: '期末贷方', prop: 'closingCredit', width: 16, amount: true },
    ],
    rows: data.value.rows,
    summary: data.value.totals,
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