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
            <h2>现金流量简表</h2>
            <div class="report-title__meta">
              {{ periodLabel(startPeriod) }} 至 {{ periodLabel(endPeriod) }}
            </div>
            <div class="report-title__unit">单位：元</div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 40%">项目</th>
                <th style="width: 20%">流入</th>
                <th style="width: 20%">流出</th>
                <th style="width: 20%">净额</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="report-table__indent-0">期初现金及现金等价物余额</td>
                <td class="amount text-right">{{ formatAmount(data.openingBalance) }}</td>
                <td></td>
                <td></td>
              </tr>
              <tr v-for="c in data.categories" :key="c.key" class="report-table__total">
                <td>{{ c.title }}</td>
                <td class="amount text-right">{{ formatAmount(c.inflow) }}</td>
                <td class="amount text-right">{{ formatAmount(c.outflow) }}</td>
                <td class="amount text-right">{{ formatAmount(c.net) }}</td>
              </tr>
              <tr class="report-table__total">
                <td>现金净增加额</td>
                <td></td>
                <td></td>
                <td class="amount text-right">{{ formatAmount(data.netIncrease) }}</td>
              </tr>
              <tr>
                <td class="report-table__indent-0">期末现金及现金等价物余额</td>
                <td class="amount text-right">{{ formatAmount(data.closingBalance) }}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <el-alert v-if="!data.balanced" type="warning" :closable="false" show-icon class="mb12"
            title="三分法净额合计与现金净增加额存在差异（差异金额见明细，通常由现金科目间互转或未分类收支引起）" />

          <el-table :data="data.detail" size="small" max-height="360px">
            <el-table-column prop="voucherDate" label="日期" width="100" />
            <el-table-column prop="voucherNo" label="凭证号" width="120" />
            <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
            <el-table-column prop="accountName" label="现金科目" width="140" show-overflow-tooltip />
            <el-table-column label="方向" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.direction === 'inflow' ? 'success' : 'danger'" size="small">
                  {{ row.direction === 'inflow' ? '流入' : '流出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">
                <span class="amount" :class="row.direction === 'inflow' ? 'amount--debit' : 'amount--credit'">
                  {{ formatAmount(row.amount) }}
                </span>
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
    data.value = await reportApi.cashFlow({
      startPeriod: startPeriod.value,
      endPeriod: endPeriod.value,
    })
  } finally {
    loading.value = false
  }
}

function onExport() {
  if (!data.value) return
  const categories = (data.value.categories ?? []).map((c: any) => ({
    category: c.title,
    inflow: c.inflow,
    outflow: c.outflow,
    net: c.net,
  }))
  exportExcel({
    filename: `现金流量简表_${startPeriod.value}-${endPeriod.value}.xlsx`,
    sheetName: '现金流量简表',
    title: '现金流量简表',
    subtitle: `${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}  单位：元`,
    columns: [
      { title: '项目', prop: 'category', width: 16 },
      { title: '流入', prop: 'inflow', width: 14, amount: true },
      { title: '流出', prop: 'outflow', width: 14, amount: true },
      { title: '净额', prop: 'net', width: 14, amount: true },
    ],
    rows: categories,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
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
