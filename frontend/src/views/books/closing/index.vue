<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <span class="label">结转期间</span>
        <PeriodPicker v-model="period" width="140px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查看结转</el-button>
        <div class="page-toolbar__spacer" />
        <el-tag v-if="data?.closed" type="success" size="default">
          已结转 {{ data.existingVoucher?.word }}-{{ pad(data.existingVoucher?.voucherNo) }} 号
        </el-tag>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button
          v-if="data?.closed"
          v-permission="'books:closing'"
          type="warning"
          :loading="busy"
          @click="onRollback"
        >
          取消结转
        </el-button>
        <el-button
          v-else
          v-permission="'books:closing'"
          type="primary"
          :loading="busy"
          :disabled="!canExecute"
          @click="onExecute"
        >
          <el-icon><Check /></el-icon>生成结转凭证
        </el-button>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="mb12"
        title="结转规则：月末把损益类科目余额全部转入「本年利润」（3102）。收入类 借 收入 / 贷 本年利润，费用类 借 本年利润 / 贷 费用；结转后损益类科目余额为 0。"
      />

      <div v-loading="loading">
        <template v-if="data">
          <el-alert
            v-if="data.draftCount > 0"
            type="warning"
            show-icon
            :closable="false"
            class="mb12"
            :title="`本期还有 ${data.draftCount} 张未审核凭证，审核完成后才能结转损益`"
          />
          <el-alert
            v-else-if="!data.rows.length && !data.closed"
            type="success"
            show-icon
            :closable="false"
            class="mb12"
            title="本期没有损益类发生额，无需结转"
          />

          <el-row :gutter="12" class="mb12">
            <el-col :xs="24" :sm="8">
              <el-card shadow="never" class="stat-card">
                <div class="stat-card__label">收入类结转合计</div>
                <div class="stat-card__value amount amount--credit">
                  {{ formatAmount(data.revenueTotal) }}
                </div>
              </el-card>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-card shadow="never" class="stat-card">
                <div class="stat-card__label">费用类结转合计</div>
                <div class="stat-card__value amount amount--debit">
                  {{ formatAmount(data.expenseTotal) }}
                </div>
              </el-card>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-card shadow="never" class="stat-card">
                <div class="stat-card__label">本期利润</div>
                <div
                  class="stat-card__value"
                  :class="data.netProfit >= 0 ? 'amount amount--credit' : 'amount amount--debit'"
                >
                  {{ formatAmount(data.netProfit) }}
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-alert
            v-if="data.yearEnd && data.yearEnd.entries.length"
            type="info"
            :closable="false"
            show-icon
            class="mb12"
            :title="`12 月年末结转：本年利润 ${formatAmount(data.yearEnd.profitBalance)} 元将转入「未分配利润 3103.01」，并自动生成下一年期初余额。`"
          />

          <el-table :data="data.rows" size="small" empty-text="本期没有需要结转的损益发生额">
            <el-table-column type="index" label="#" width="50" align="center" />
            <el-table-column prop="accountCode" label="科目编码" width="110" />
            <el-table-column prop="accountName" label="科目名称" min-width="160" />
            <el-table-column label="辅助核算" min-width="140">
              <template #default="{ row }">
                <span
                  v-if="!row.partnerName && !row.departmentName && !row.projectName && !row.employeeName"
                >
                  -
                </span>
                <el-tag v-if="row.partnerName" size="small" class="aux-tag">{{ row.partnerName }}</el-tag>
                <el-tag v-if="row.departmentName" size="small" class="aux-tag">
                  {{ row.departmentName }}
                </el-tag>
                <el-tag v-if="row.projectName" size="small" class="aux-tag">{{ row.projectName }}</el-tag>
                <el-tag v-if="row.employeeName" size="small" type="warning" class="aux-tag">
                  {{ row.employeeName }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="科目余额" width="150" align="right">
              <template #default="{ row }">
                <span class="amount" :class="`amount--${row.direction}`">
                  {{ formatAmount(row.amount) }}
                </span>
                <span class="dir">{{ row.direction === 'debit' ? '借' : '贷' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="结转分录" width="170" align="right">
              <template #default="{ row }">
                <span class="amount" :class="`amount--${row.closingDirection}`">
                  {{ row.closingDirection === 'debit' ? '借' : '贷' }} {{ formatAmount(row.amount) }}
                </span>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="data.closed || data.rows.length" class="voucher-hint">
            <template v-if="data.closed">
              本期已结转，凭证
              <b>{{ data.existingVoucher?.word }}-{{ pad(data.existingVoucher?.voucherNo) }}</b>
              号 · 共 {{ data.entries.length }} 条分录
              <span class="voucher-hint__closed">（如需重做请先取消结转）</span>
            </template>
            <template v-else>
              将生成凭证：{{ data.voucherDate }} · 记 {{ pad(nextNo) }} 号 · 共 {{ data.entries.length }} 条分录
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, Check } from '@element-plus/icons-vue'
import { closingApi, voucherApi } from '@/api'
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const period = ref<number>(currentPeriod())
const loading = ref(false)
const busy = ref(false)
const data = ref<any>(null)
const nextNo = ref<number | null>(null)

const pad = (n?: number | null) => String(n ?? 0).padStart(4, '0')

const canExecute = computed(
  () => !!data.value && !data.value.closed && data.value.rows.length > 0 && data.value.draftCount === 0,
)

async function load() {
  loading.value = true
  try {
    data.value = await closingApi.preview(period.value)
    nextNo.value = data.value?.closed ? null : await voucherApi.nextNo(period.value, '记').catch(() => null)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

async function onExecute() {
  const d = data.value
  if (!d) return
  try {
    const yearEndTip =
      d.yearEnd && d.yearEnd.entries.length
        ? `；同时将本年利润 ${formatAmount(d.yearEnd.profitBalance)} 元转入「未分配利润」，并生成下一年期初余额`
        : ''
    await ElMessageBox.confirm(
      `将把 ${periodLabel(period.value)} 的损益类科目余额 ${formatAmount(d.netProfit)} 元结转入「本年利润」，并生成一张已审核的结转凭证${yearEndTip}。确认继续？`,
      '期末结转',
      { type: 'warning', confirmButtonText: '确认结转' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const result = await closingApi.execute({ period: period.value, voucherDate: d.voucherDate })
    const cf = result?.yearEnd?.carryForward
    if (cf?.skipped) {
      ElMessage.success('结转成功；下一年期初余额已存在，未覆盖')
    } else if (cf?.created) {
      ElMessage.success(`结转成功，已生成 ${cf.created} 条下一年期初余额`)
    } else {
      ElMessage.success('结转成功，已生成结转凭证')
    }
    await load()
  } catch {
    /* 错误已提示 */
  } finally {
    busy.value = false
  }
}

async function onRollback() {
  try {
    await ElMessageBox.confirm(
      `确认取消 ${periodLabel(period.value)} 的结转？将删除本期结转凭证，损益类科目余额将恢复。`,
      '取消结转',
      { type: 'warning', confirmButtonText: '确认取消' },
    )
  } catch {
    return
  }
  busy.value = true
  try {
    await closingApi.rollback(period.value)
    ElMessage.success('已取消结转')
    await load()
  } catch {
    /* 错误已提示 */
  } finally {
    busy.value = false
  }
}

function onExport() {
  if (!data.value?.rows?.length) {
    ElMessage.warning('本期没有可导出的结转数据')
    return
  }
  exportExcel({
    filename: `期末结转_${period.value}.xlsx`,
    sheetName: '期末结转',
    title: '期末结转损益',
    subtitle: `期间：${periodLabel(period.value)}`,
    columns: [
      { title: '科目编码', prop: 'accountCode', width: 14 },
      { title: '科目名称', prop: 'accountName', width: 24 },
      {
        title: '辅助核算',
        prop: 'aux',
        width: 22,
        format: (r: any) =>
          [r.partnerName, r.departmentName, r.projectName, r.employeeName].filter(Boolean).join('/'),
      },
      { title: '余额方向', prop: 'direction', width: 12, format: (r: any) => (r.direction === 'debit' ? '借' : '贷') },
      { title: '结转金额', prop: 'amount', width: 16, amount: true },
    ],
    rows: data.value.rows,
    summary: { amount: data.value.netProfit },
  })
  ElMessage.success('导出成功')
}

watch(period, load)
onMounted(load)
</script>

<style scoped lang="scss">
.label {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.mb12 {
  margin-bottom: 12px;
}

.stat-card {
  &__label {
    font-size: 12px;
    color: var(--app-text-secondary);
    margin-bottom: 6px;
  }

  &__value {
    font-size: 20px;
    font-weight: 600;
  }
}

.aux-tag {
  margin-right: 4px;
}

.dir {
  margin-left: 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.voucher-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--app-text-secondary);

  &__closed {
    color: var(--el-color-warning);
  }
}
</style>
