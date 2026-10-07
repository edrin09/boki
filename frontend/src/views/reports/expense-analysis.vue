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
            <h2>费用结构分析</h2>
            <div class="report-title__meta">
              {{ periodLabel(startPeriod) }} 至 {{ periodLabel(endPeriod) }}
            </div>
            <div class="report-title__unit">单位：元</div>
          </div>

          <el-row :gutter="12" class="mb12">
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value amount amount--total">{{ formatAmount(data.total) }}</div>
                <div class="summary-card__label">费用总额</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value">{{ data.byAccount.length }}</div>
                <div class="summary-card__label">涉及科目（一级）</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value">{{ data.byPartner.length }}</div>
                <div class="summary-card__label">交易对手数</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card">
                <div class="summary-card__value">{{ data.rows.length }}</div>
                <div class="summary-card__label">明细笔数</div>
              </el-card>
            </el-col>
          </el-row>

          <el-row :gutter="12" class="mb12">
            <el-col :xs="24" :md="12">
              <div class="block-title">按费用科目</div>
              <el-table :data="data.byAccount" size="small" border max-height="320px">
                <el-table-column prop="name" label="科目" min-width="130" show-overflow-tooltip />
                <el-table-column label="金额" width="120" align="right">
                  <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
                </el-table-column>
                <el-table-column label="占比" min-width="130">
                  <template #default="{ row }">
                    <el-progress :percentage="row.percent" :stroke-width="10" />
                  </template>
                </el-table-column>
                <el-table-column label="占比%" width="70" align="center">
                  <template #default="{ row }">
                    <span class="text-muted">{{ row.percent.toFixed(2) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </el-col>
            <el-col :xs="24" :md="12">
              <div class="block-title">按交易对手</div>
              <el-table :data="data.byPartner" size="small" border max-height="320px">
                <el-table-column prop="partnerName" label="交易对手" min-width="130" show-overflow-tooltip />
                <el-table-column label="金额" width="120" align="right">
                  <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
                </el-table-column>
                <el-table-column label="占比" min-width="130">
                  <template #default="{ row }">
                    <el-progress :percentage="row.percent" :stroke-width="10" />
                  </template>
                </el-table-column>
                <el-table-column label="占比%" width="70" align="center">
                  <template #default="{ row }">
                    <span class="text-muted">{{ row.percent.toFixed(2) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </el-col>
          </el-row>

          <el-table :data="data.rows" size="small" max-height="360px">
            <el-table-column prop="voucherDate" label="日期" width="100" />
            <el-table-column prop="voucherNo" label="凭证号" width="120" />
            <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
            <el-table-column prop="accountName" label="费用科目" width="140" show-overflow-tooltip />
            <el-table-column prop="partnerName" label="交易对手" width="140" show-overflow-tooltip />
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">
                <span class="amount amount--credit">{{ formatAmount(row.amount) }}</span>
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
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const startPeriod = ref<number>(currentPeriod())
const endPeriod = ref<number>(currentPeriod())
const loading = ref(false)
const data = ref<any>(null)

async function load() {
  loading.value = true
  try {
    data.value = await reportApi.expenseAnalysis({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
    })
  } finally {
    loading.value = false
  }
}

function onExport() {
  if (!data.value) return
  exportExcel({
    filename: `费用结构分析_${startPeriod.value}-${endPeriod.value}.xlsx`,
    sheetName: '明细',
    title: '费用结构分析',
    subtitle: `${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}  单位：元`,
    columns: [
      { title: '日期', prop: 'voucherDate', width: 12 },
      { title: '凭证号', prop: 'voucherNo', width: 12 },
      { title: '摘要', prop: 'summary', width: 28 },
      { title: '费用科目', prop: 'accountName', width: 18 },
      { title: '交易对手', prop: 'partnerName', width: 18 },
      { title: '金额', prop: 'amount', width: 14, amount: true },
    ],
    rows: data.value.rows,
    summary: { amount: data.value.total },
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}

.block-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 4px 0 8px;
}

.text-muted {
  color: var(--app-text-secondary);
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
