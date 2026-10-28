<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="startPeriod" width="140px" />
        <span class="sep">至</span>
        <PeriodPicker v-model="endPeriod" width="140px" />
        <el-select v-model="receiptType" placeholder="票据类型" clearable style="width: 150px">
          <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <div v-loading="loading">
        <template v-if="data">
          <el-row :gutter="12" class="summary-row">
            <el-col :xs="8" :sm="8" :md="8">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value">{{ data.summary.count }}</div>
                <div class="summary-card__label">票据张数</div>
              </el-card>
            </el-col>
            <el-col :xs="8" :sm="8" :md="8">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value amount amount--total">{{ formatAmount(data.summary.amount) }}</div>
                <div class="summary-card__label">价税合计（元）</div>
              </el-card>
            </el-col>
            <el-col :xs="8" :sm="8" :md="8">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value amount amount--credit">{{ formatAmount(data.summary.taxAmount) }}</div>
                <div class="summary-card__label">税额合计（元）</div>
              </el-card>
            </el-col>
          </el-row>

          <el-table :data="data.summary.byType" size="small" border class="mb12">
            <el-table-column prop="typeName" label="票据类型" min-width="120" />
            <el-table-column prop="count" label="张数" width="90" align="center" />
            <el-table-column label="价税合计" width="140" align="right">
              <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
            </el-table-column>
            <el-table-column label="税额" width="120" align="right">
              <template #default="{ row }"><span class="amount">{{ formatAmount(row.taxAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="占比" width="120">
              <template #default="{ row }">
                <el-progress :percentage="percentOf(row.amount)" :stroke-width="10" />
              </template>
            </el-table-column>
          </el-table>

          <el-table :data="data.rows" size="small" max-height="480px">
            <el-table-column prop="issueDate" label="开票日期" width="110" />
            <el-table-column prop="receiptTypeName" label="类型" width="110" />
            <el-table-column prop="fileName" label="文件名" min-width="180" show-overflow-tooltip />
            <el-table-column prop="sellerName" label="销售方" min-width="160" show-overflow-tooltip />
            <el-table-column prop="buyerName" label="购买方" min-width="160" show-overflow-tooltip />
            <el-table-column label="价税合计" width="130" align="right">
              <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
            </el-table-column>
            <el-table-column label="税额" width="110" align="right">
              <template #default="{ row }"><span class="amount">{{ formatAmount(row.taxAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="STATUS_TAG[row.status] ?? 'info'" size="small">{{ row.statusLabel }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import { reportApi } from '@/api'
import { currentPeriod, formatAmount } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const STATUS_TAG: Record<string, string> = {
  parsed: 'info',
  drafted: 'warning',
  confirmed: 'success',
  rejected: 'danger',
}

const typeOptions = [
  { label: '增值税发票', value: 'invoice' },
  { label: '身份证', value: 'id_card' },
  { label: '营业执照', value: 'business_license' },
  { label: '火车票/行程单', value: 'train_ticket' },
  { label: '通用收据', value: 'receipt' },
  { label: '未识别', value: 'unknown' },
]

const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const receiptType = ref('')
const loading = ref(false)
const data = ref<any>(null)

function percentOf(amount: number): number {
  if (!data.value || data.value.summary.amount <= 0) return 0
  return Math.round((amount / data.value.summary.amount) * 1000) / 10
}

async function load() {
  loading.value = true
  try {
    data.value = await reportApi.ledger({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
      receiptType: receiptType.value || undefined,
    })
  } finally {
    loading.value = false
  }
}

function onExport() {
  if (!data.value) return
  const { summary, rows } = data.value
  exportExcel({
    filename: `票据台账_${startPeriod.value}-${endPeriod.value}.xlsx`,
    sheetName: '票据台账',
    title: '票据台账',
    subtitle: `${startPeriod.value / 100} 年 ${startPeriod.value % 100} 月 至 ${endPeriod.value / 100} 年 ${endPeriod.value % 100} 月  单位：元`,
    columns: [
      { title: '开票日期', prop: 'issueDate', width: 12 },
      { title: '票据类型', prop: 'receiptTypeName', width: 12 },
      { title: '文件名', prop: 'fileName', width: 30 },
      { title: '销售方', prop: 'sellerName', width: 22 },
      { title: '购买方', prop: 'buyerName', width: 22 },
      { title: '价税合计', prop: 'amount', width: 14, amount: true },
      { title: '税额', prop: 'taxAmount', width: 12, amount: true },
      { title: '状态', prop: 'statusLabel', width: 10 },
    ],
    rows,
    summary: {
      count: summary.count,
      amount: summary.amount,
      taxAmount: summary.taxAmount,
    },
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.summary-row {
  margin-bottom: 12px;
}
.summary-card {
  text-align: center;

  :deep(.el-card__body) {
    padding: 16px;
  }

  &__value {
    font-size: 22px;
    font-weight: 600;
    color: #111827;
  }

  &__label {
    font-size: 12px;
    color: var(--app-text-secondary);
    margin-top: 4px;
  }
}
.mb12 {
  margin-bottom: 12px;
}
</style>
