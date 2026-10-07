<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <span class="label">资产负债表日</span>
        <PeriodPicker v-model="period" width="150px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-tag v-if="data" :type="data.balanced ? 'success' : 'warning'" size="default">
          {{ data.balanced ? '已平衡' : `差额 ${formatAmount(data.difference)}（未结转损益）` }}
        </el-tag>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <div v-loading="loading">
        <template v-if="data">
          <div class="report-title">
            <h2>资产负债表</h2>
            <div class="report-title__meta">
              编制单位：—&nbsp;&nbsp;&nbsp;&nbsp;{{ formatDate(data.date) }}
            </div>
            <div class="report-title__unit">单位：元</div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 38%">资产</th>
                <th style="width: 12%">期末余额</th>
                <th style="width: 38%">负债和所有者权益</th>
                <th style="width: 12%">期末余额</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="index in Math.max(assetRows.length, rightRows.length)"
                :key="index"
              >
                <td :class="indentClass(assetRows[index - 1])">
                  {{ assetRows[index - 1]?.label ?? '' }}
                </td>
                <td class="amount text-right">{{ amountCell(assetRows[index - 1]) }}</td>
                <td :class="indentClass(rightRows[index - 1])">{{ rightRows[index - 1]?.label ?? '' }}</td>
                <td class="amount text-right">{{ amountCell(rightRows[index - 1]) }}</td>
              </tr>
              <tr class="report-table__total">
                <td>资产总计</td>
                <td class="amount text-right">{{ formatAmount(data.totals.totalAssets) }}</td>
                <td>负债和所有者权益总计</td>
                <td class="amount text-right">{{ formatAmount(data.totals.totalLiabilityEquity) }}</td>
              </tr>
            </tbody>
          </table>

          <el-alert type="info" :closable="false" show-icon class="mt12" :title="data.note" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import { reportApi } from '@/api'
import { currentPeriod, formatAmount, formatDate } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const period = ref<number>(currentPeriod())
const loading = ref(false)
const data = ref<any>(null)

const assetRows = computed<any[]>(() => {
  const section = data.value?.sections?.find((s: any) => s.key === 'asset')
  if (!section) return []
  return [
    ...section.lines.map((l: any) => ({ label: l.name, amount: l.amount, level: l.level })),
    { label: '资产总计', amount: section.total, level: 0, bold: true },
  ]
})

const rightRows = computed<any[]>(() => {
  const liability = data.value?.sections?.find((s: any) => s.key === 'liability')
  const equity = data.value?.sections?.find((s: any) => s.key === 'equity')
  const rows: any[] = []
  if (liability) {
    rows.push({ label: '流动负债：', amount: null, level: 0, group: true })
    rows.push(...liability.lines.map((l: any) => ({ label: l.name, amount: l.amount, level: l.level })))
    rows.push({ label: '负债合计', amount: liability.total, level: 0, bold: true })
  }
  if (equity) {
    rows.push({ label: '所有者权益：', amount: null, level: 0, group: true })
    rows.push(...equity.lines.map((l: any) => ({ label: l.name, amount: l.amount, level: l.level })))
    rows.push({ label: '所有者权益合计', amount: equity.total, level: 0, bold: true })
  }
  rows.push({
    label: '负债和所有者权益总计',
    amount: data.value?.totals?.totalLiabilityEquity,
    level: 0,
    bold: true,
  })
  return rows
})

function indentClass(row?: any): string {
  if (!row) return ''
  if (row.bold) return 'report-table__total'
  if (row.group) return ''
  return row.level === 2 ? 'report-table__indent-2' : 'report-table__indent-1'
}

function amountCell(row?: any): string {
  if (!row || row.amount === null || row.amount === undefined) return ''
  return row.amount ? formatAmount(row.amount) : ''
}

async function load() {
  loading.value = true
  try {
    const [year] = [Math.floor(period.value / 100)]
    data.value = await reportApi.balanceSheet({ endPeriod: period.value, fiscalYear: year })
  } finally {
    loading.value = false
  }
}

watch(period, load)

function onExport() {
  if (!data.value) {
    ElMessage.warning('请先查询数据')
    return
  }
  const rows: any[] = []
  for (const s of data.value.sections) {
    for (const l of s.lines) {
      rows.push({ section: s.title, code: l.code, name: l.name, amount: l.amount })
    }
    rows.push({ section: s.title, code: '', name: `${s.title}合计`, amount: s.total, bold: true })
  }
  exportExcel({
    filename: `资产负债表_${period.value}.xlsx`,
    sheetName: '资产负债表',
    title: `资产负债表（${formatDate(data.value.date)}）`,
    columns: [
      { title: '类别', prop: 'section', width: 14 },
      { title: '编码', prop: 'code', width: 12 },
      { title: '项目', prop: 'name', width: 30 },
      { title: '期末余额', prop: 'amount', width: 18, amount: true },
    ],
    rows,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.mt12 {
  margin-top: 12px;
}

.report-title {
  text-align: center;
  margin-bottom: 12px;
  position: relative;

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }

  &__meta {
    font-size: 12px;
    color: var(--app-text-secondary);
  }

  &__unit {
    position: absolute;
    right: 0;
    top: 4px;
    font-size: 12px;
    color: var(--app-text-secondary);
  }
}
</style>