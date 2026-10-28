<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <span class="label">结账期间</span>
        <PeriodPicker v-model="period" width="140px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>检查月结</el-button>
        <div class="page-toolbar__spacer" />
        <el-button :disabled="!data || !data.ready" type="success" @click="onExport">
          <el-icon><Download /></el-icon>生成月度报表包
        </el-button>
      </div>

      <div v-loading="loading">
        <template v-if="data">
          <el-row :gutter="12" class="mb12">
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card" :class="{ 'summary-card--warn': data.checks.pendingReceipts > 0 }">
                <div class="summary-card__value">{{ data.checks.pendingReceipts }}</div>
                <div class="summary-card__label">待确认票据</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card" :class="{ 'summary-card--warn': data.checks.unapprovedVouchers > 0 }">
                <div class="summary-card__value">{{ data.checks.unapprovedVouchers }}</div>
                <div class="summary-card__label">未审核凭证</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card" :class="{ 'summary-card--warn': data.checks.openPayrolls > 0 }">
                <div class="summary-card__value">{{ data.checks.openPayrolls }}</div>
                <div class="summary-card__label">未发放工资单</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card shadow="hover" class="summary-card" :class="{ 'summary-card--warn': data.checks.unapprovedExpenseClaims > 0 }">
                <div class="summary-card__value">{{ data.checks.unapprovedExpenseClaims }}</div>
                <div class="summary-card__label">未审核报销单</div>
              </el-card>
            </el-col>
            <el-col :xs="12" :sm="8" :md="6">
              <el-card
                shadow="hover"
                class="summary-card summary-card--link"
                :class="{ 'summary-card--warn': data.checks.pendingFixedExpenses > 0 }"
                @click="data.checks.pendingFixedExpenses > 0 && $router.push('/cash/fixed-expense')"
              >
                <div class="summary-card__value">{{ data.checks.pendingFixedExpenses ?? 0 }}</div>
                <div class="summary-card__label">固定费用待生成</div>
                <div v-if="data.checks.pendingFixedExpenses > 0" class="summary-card__hint">
                  预计 {{ formatAmount(data.checks.pendingFixedExpenseAmount ?? 0) }}，点击去生成
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-alert
            v-if="data.issues.length"
            type="warning"
            :closable="false"
            show-icon
            class="mb12"
            :title="`存在 ${data.issues.length} 项未结账事项`"
          >
            <ul class="issue-list">
              <li v-for="(issue, i) in data.issues" :key="i">{{ issue }}</li>
            </ul>
          </el-alert>
          <el-alert v-else type="success" :closable="false" show-icon class="mb12"
            title="检查通过，可生成月度报表包" />

          <div v-if="data.report">
            <div class="block-title">月度报表预览（{{ periodLabel(period) }}）</div>

            <el-row :gutter="12">
              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="report-card">
                  <template #header>资产负债表</template>
                  <el-descriptions :column="1" size="small">
                    <el-descriptions-item label="资产总计">
                      <span class="amount amount--total">{{ formatAmount(data.report.balanceSheet.totalAssets) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="负债总计">
                      <span class="amount">{{ formatAmount(data.report.balanceSheet.totalLiabilities) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="所有者权益">
                      <span class="amount">{{ formatAmount(data.report.balanceSheet.totalEquity) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="平衡校验">
                      <el-tag :type="data.report.balanceSheet.balanced ? 'success' : 'danger'" size="small">
                        {{ data.report.balanceSheet.balanced ? '平衡' : '不平衡' }}
                      </el-tag>
                    </el-descriptions-item>
                  </el-descriptions>
                </el-card>
              </el-col>

              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="report-card">
                  <template #header>利润表</template>
                  <el-descriptions :column="1" size="small">
                    <el-descriptions-item label="营业收入">
                      <span class="amount">{{ formatAmount(data.report.profitLoss.operatingRevenue) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="营业利润">
                      <span class="amount">{{ formatAmount(data.report.profitLoss.operatingProfit) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="净利润">
                      <span class="amount amount--total">{{ formatAmount(data.report.profitLoss.netProfit) }}</span>
                    </el-descriptions-item>
                  </el-descriptions>
                </el-card>
              </el-col>

              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="report-card">
                  <template #header>现金流量简表</template>
                  <table class="mini-table">
                    <thead>
                      <tr><th>项目</th><th>金额</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>期初现金余额</td>
                        <td class="amount text-right">{{ formatAmount(data.report.cashFlow.openingBalance) }}</td>
                      </tr>
                      <tr v-for="c in data.report.cashFlow.categories" :key="c.key">
                        <td>{{ c.title }}净额</td>
                        <td class="amount text-right">{{ formatAmount(c.net) }}</td>
                      </tr>
                      <tr class="mini-table__total">
                        <td>现金净增加额</td>
                        <td class="amount text-right">{{ formatAmount(data.report.cashFlow.netIncrease) }}</td>
                      </tr>
                      <tr>
                        <td>期末现金余额</td>
                        <td class="amount text-right">{{ formatAmount(data.report.cashFlow.closingBalance) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </el-card>
              </el-col>

              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="report-card">
                  <template #header>票据台账汇总</template>
                  <el-descriptions :column="1" size="small">
                    <el-descriptions-item label="票据张数">
                      {{ data.report.receiptSummary.count }}
                    </el-descriptions-item>
                    <el-descriptions-item label="价税合计">
                      <span class="amount amount--total">{{ formatAmount(data.report.receiptSummary.amount) }}</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="税额合计">
                      <span class="amount">{{ formatAmount(data.report.receiptSummary.taxAmount) }}</span>
                    </el-descriptions-item>
                  </el-descriptions>
                  <el-table v-if="data.report.receiptSummary.byType?.length" :data="data.report.receiptSummary.byType" size="small" class="mt8">
                    <el-table-column prop="typeName" label="类型" min-width="90" />
                    <el-table-column prop="count" label="张数" width="60" align="center" />
                    <el-table-column label="金额" width="110" align="right">
                      <template #default="{ row }"><span class="amount">{{ formatAmount(row.amount) }}</span></template>
                    </el-table-column>
                  </el-table>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download } from '@element-plus/icons-vue'
import * as XLSX from 'xlsx'
import { reportApi } from '@/api'
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const period = ref<number>(currentPeriod())
const loading = ref(false)
const data = ref<any>(null)

async function load() {
  loading.value = true
  try {
    data.value = await reportApi.monthlyClose({ endPeriod: period.value })
  } finally {
    loading.value = false
  }
}

/** 生成月度报表包（多工作表 Excel） */
function onExport() {
  if (!data.value || !data.value.ready) {
    ElMessage.warning('请先通过月结检查')
    return
  }
  const d = data.value
  const wb = XLSX.utils.book_new()
  const subtitle = `会计期间：${periodLabel(period.value)}  单位：元`

  const appendSheet = (name: string, title: string, aoa: any[][]) => {
    const rows = [[title], [subtitle], [], ...aoa]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = (aoa[0] ?? []).map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  // 资产负债表
  const bs = d.report.balanceSheet
  appendSheet('资产负债表', '资产负债表', [
    ['项目', '金额', '说明'],
    ['资产总计', bs.totalAssets, ''],
    ['负债总计', bs.totalLiabilities, ''],
    ['所有者权益合计', bs.totalEquity, ''],
    ['平衡校验', bs.balanced ? '平衡' : '不平衡', ''],
  ])

  // 利润表
  const pl = d.report.profitLoss
  appendSheet('利润表', '利润表', [
    ['项目', '本期金额'],
    ['营业收入', pl.operatingRevenue],
    ['营业利润', pl.operatingProfit],
    ['净利润', pl.netProfit],
  ])

  // 现金流量简表
  const cf = d.report.cashFlow
  appendSheet('现金流量简表', '现金流量简表', [
    ['项目', '金额'],
    ['期初现金及现金等价物余额', cf.openingBalance],
    ...(cf.categories ?? []).map((c: any) => [`${c.title}净额`, c.net]),
    ['现金净增加额', cf.netIncrease],
    ['期末现金及现金等价物余额', cf.closingBalance],
  ])

  // 票据台账汇总
  const rs = d.report.receiptSummary
  appendSheet('票据台账', '票据台账汇总', [
    ['类型', '张数', '价税合计', '税额'],
    ...(rs.byType ?? []).map((t: any) => [t.typeName, t.count, t.amount, t.taxAmount]),
    ['合计', rs.count, rs.amount, rs.taxAmount],
  ])

  XLSX.writeFile(wb, `月度报表包_${period.value}.xlsx`)
  ElMessage.success('月度报表包已生成')
}

onMounted(load)
</script>

<style scoped lang="scss">
.label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.mb12 {
  margin-bottom: 12px;
}

.mt8 {
  margin-top: 8px;
}

.block-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 4px 0 8px;
}

.issue-list {
  margin: 6px 0 0;
  padding-left: 18px;
}

.summary-card--link {
  cursor: pointer;
}

.summary-card__hint {
  margin-top: 4px;
  font-size: 12px;
  color: #e6a23c;
}

.report-card {
  margin-bottom: 12px;

  :deep(.el-card__header) {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
  }
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    border: 1px solid var(--app-border);
    padding: 5px 8px;
  }

  th {
    background: #f8fafc;
    font-weight: 600;
    text-align: center;
  }

  &__total {
    background: #f8fafc;
    font-weight: 600;
  }
}
</style>
