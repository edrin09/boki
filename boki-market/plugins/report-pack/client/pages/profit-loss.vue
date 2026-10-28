<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="startPeriod" width="140px" />
        <span class="sep">至</span>
        <PeriodPicker v-model="endPeriod" width="140px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <div v-loading="loading">
        <template v-if="data">
          <div class="report-title">
            <h2>利润表</h2>
            <div class="report-title__meta">
              {{ periodLabel(startPeriod) }} 至 {{ periodLabel(endPeriod) }}
            </div>
            <div class="report-title__unit">单位：元</div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 38%">项目</th>
                <th style="width: 15%">本期金额</th>
                <th style="width: 15%">本年累计金额</th>
                <th style="width: 32%">备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayRows" :key="row.key" :class="{ 'report-table__total': row.bold }">
                <td :class="row.indent ? 'report-table__indent-1' : ''">{{ row.title }}</td>
                <td class="amount text-right">{{ row.current ? formatAmount(row.current) : '' }}</td>
                <td class="amount text-right">{{ row.ytd ? formatAmount(row.ytd) : '' }}</td>
                <td class="text-muted">{{ row.remark }}</td>
              </tr>
            </tbody>
          </table>
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
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const loading = ref(false)
const data = ref<any>(null)

/** 需要展示的小计项（与后端结构对应） */
const SUMMARY_KEYS = [
  { key: 'operatingRevenue', title: '一、营业收入', bold: true },
  { key: 'operatingCost', title: '减：营业成本' },
  { key: 'taxAndSurcharge', title: '减：税金及附加' },
  { key: 'sellingExpense', title: '减：销售费用' },
  { key: 'adminExpense', title: '减：管理费用' },
  { key: 'rdExpense', title: '减：研发费用' },
  { key: 'financialExpense', title: '减：财务费用' },
  { key: 'investmentIncome', title: '加：投资收益' },
  { key: 'operatingProfit', title: '二、营业利润', bold: true },
  { key: 'nonOperatingIncome', title: '加：营业外收入' },
  { key: 'nonOperatingExpense', title: '减：营业外支出' },
  { key: 'totalProfit', title: '三、利润总额', bold: true },
  { key: 'incomeTax', title: '减：所得税费用' },
  { key: 'netProfit', title: '四、净利润', bold: true },
]

const displayRows = computed(() => {
  if (!data.value) return []
  const cur = data.value.currentPeriod?.totals ?? {}
  const ytd = data.value.yearToDate?.totals ?? {}

  const rows: any[] = []
  for (const item of SUMMARY_KEYS) {
    const curVal = Number(cur[item.key] ?? 0)
    const ytdVal = Number(ytd[item.key] ?? 0)
    if (!curVal && !ytdVal && !item.bold) continue
    rows.push({
      key: item.key,
      title: item.title,
      current: curVal,
      ytd: ytdVal,
      bold: item.bold,
      indent: !item.bold,
      remark: '',
    })
  }

  // 附：收入与成本明细行
  const detail = (data.value.sections ?? [])
    .filter((s: any) => s.lines.length)
    .flatMap((s: any) => s.lines.map((l: any) => ({ ...l, section: s.title })))
  rows.unshift({
    key: '__detail__',
    title: '明细科目',
    bold: true,
    current: 0,
    ytd: 0,
    indent: false,
    children: detail,
  })
  return rows
})

async function load() {
  loading.value = true
  try {
    const [year] = [Math.floor(endPeriod.value / 100)]
    data.value = await reportApi.profitLoss({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      fiscalYear: year,
    })
  } finally {
    loading.value = false
  }
}

watch([startPeriod, endPeriod], load)

function onExport() {
  if (!data.value) {
    ElMessage.warning('请先查询数据')
    return
  }
  const rows: any[] = []
  for (const s of data.value.sections ?? []) {
    for (const l of s.lines ?? []) {
      rows.push({ section: s.title, name: l.name, code: l.code, amount: l.amount })
    }
  }
  for (const item of SUMMARY_KEYS) {
    rows.push({
      section: '汇总',
      name: item.title,
      code: '',
      current: Number(data.value.currentPeriod?.totals?.[item.key] ?? 0),
      ytd: Number(data.value.yearToDate?.totals?.[item.key] ?? 0),
      bold: true,
    })
  }

  exportExcel({
    filename: `利润表_${endPeriod.value}.xlsx`,
    sheetName: '利润表',
    title: `利润表（${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}）`,
    columns: [
      { title: '类别', prop: 'section', width: 20 },
      { title: '编码', prop: 'code', width: 12 },
      { title: '项目', prop: 'name', width: 30 },
      { title: '本期金额', prop: 'current', width: 16, amount: true },
      { title: '本年累计', prop: 'ytd', width: 16, amount: true },
    ],
    rows,
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

.text-muted {
  color: #9ca3af;
  font-size: 12px;
}
</style>