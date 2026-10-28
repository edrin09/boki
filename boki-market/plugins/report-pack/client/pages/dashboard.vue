<template>
  <div class="page">
    <!-- 欢迎条 -->
    <el-card shadow="never" class="welcome">
      <div class="welcome__inner">
        <div>
          <div class="welcome__hello">{{ greeting }}，{{ userStore.nickname }}</div>
          <div class="welcome__sub">
            当前公司：{{ userStore.companyName || '未选择公司' }} ·
            {{ periodLabel(period) }} · 共 {{ stats.voucherCount }} 张凭证 ·
            {{ stats.accountCount }} 个会计科目
          </div>
        </div>
        <div class="welcome__quick">
          <el-button
            v-permission="'voucher:create'"
            type="primary"
            @click="router.push('/voucher/create')"
          >
            <el-icon><EditPen /></el-icon>录入凭证
          </el-button>
          <el-button
            v-permission="'books:trial-balance'"
            @click="router.push('/books/trial-balance')"
          >
            <el-icon><DataAnalysis /></el-icon>试算平衡
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="12" class="stat-row">
      <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card" @click="card.to && router.push(card.to)">
          <div class="stat-card__icon" :style="{ background: card.color }">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-card__body">
            <div class="stat-card__value">{{ card.value }}</div>
            <div class="stat-card__label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 经营看板 -->
    <el-card shadow="never" class="overview">
      <template #header>
        <div class="overview__header">
          <span>经营看板（{{ periodLabel(period) }}）</span>
          <el-link v-permission="'reports:monthly-close'" type="primary" @click="router.push('/reports/monthly-close')">
            一键月结
          </el-link>
        </div>
      </template>
      <el-row :gutter="12">
        <el-col v-for="m in overviewMetrics" :key="m.key" :xs="12" :sm="8" :md="4">
          <div class="overview-metric">
            <div class="overview-metric__label">{{ m.label }}</div>
            <div class="overview-metric__value" :class="m.class">{{ m.value }}</div>
          </div>
        </el-col>
      </el-row>
      <el-alert
        v-if="overview?.pendingReceipts"
        type="warning"
        :closable="false"
        show-icon
        class="overview__alert"
        :title="`AI 已识别 ${overview.pendingReceipts} 张单据，凭证待你确认入账`"
      >
        <template #default>
          <el-button v-permission="'receipts:workbench'" size="small" @click="router.push('/receipts/workbench')">
            去确认入账
          </el-button>
        </template>
      </el-alert>
    </el-card>

    <el-row :gutter="12" class="mt12">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="快捷入口">
          <div class="quick-grid">
            <div
              v-for="item in quickLinks"
              :key="item.path"
              class="quick-item"
              @click="router.push(item.path)"
            >
              <el-icon class="quick-item__icon"><component :is="item.icon" /></el-icon>
              <span class="quick-item__text">{{ item.title }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="使用提示">
          <ul class="tips">
            <li>日常记账首选「AI 智能记账 → 上传记账」：拖入发票、工资表、银行对账单，AI 自动识别并生成借贷平衡的凭证，你只需核对后点一次「确认入账」。</li>
            <li>AI 拿不准的单据会标出原因并留在待确认，可手工调整科目或改用「凭证管理 → 手动录入」。</li>
            <li>凭证保存为草稿后需「审核」，已审核凭证才会计入账簿与报表。</li>
            <li>收付款业务建议使用「资金往来 → 现金银行」，系统会自动生成记账凭证。</li>
            <li>客户/供应商往来请使用「应收应付」核销，便于对账与余额查询。</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { reportApi, systemApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { currentPeriod, formatAmount, periodLabel } from '@/utils/format'

const router = useRouter()
const userStore = useUserStore()
const period = ref(currentPeriod())

const stats = ref({
  accountCount: 0,
  partnerCount: 0,
  voucherCount: 0,
  draftCount: 0,
  todayVoucherCount: 0,
  monthVoucherCount: 0,
  companyCount: 0,
})

/** P18.5 经营看板数据 */
const overview = ref<any>(null)

const overviewMetrics = computed(() => {
  const m = overview.value?.month ?? {}
  const b = overview.value?.balance ?? {}
  const metrics = [
    {
      key: 'income',
      label: '本月收入',
      value: formatAmount(m.income),
      class: 'overview-metric__value--income',
    },
    {
      key: 'expense',
      label: '本月支出',
      value: formatAmount(m.expense),
      class: 'overview-metric__value--expense',
    },
    {
      key: 'netProfit',
      label: '本月净利润',
      value: formatAmount(m.netProfit),
      class: (m.netProfit ?? 0) >= 0 ? 'overview-metric__value--income' : 'overview-metric__value--expense',
    },
    {
      key: 'taxPaid',
      label: '本期实缴税额',
      value: formatAmount(m.taxPaid),
    },
    {
      key: 'cash',
      label: '现金余额',
      value: formatAmount(b.cash),
    },
    {
      key: 'ar',
      label: '应收账款',
      value: formatAmount(b.receivable),
      class: (b.receivable ?? 0) > 0 ? 'overview-metric__value--expense' : '',
    },
  ]
  return metrics
})

const greeting = computed(() => {
  const hour = dayjs().hour()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const cards = computed(() => [
  {
    key: 'voucher',
    label: '凭证总数',
    value: stats.value.voucherCount,
    icon: 'Tickets',
    color: '#2563eb',
  },
  {
    key: 'month',
    label: '本月凭证',
    value: stats.value.monthVoucherCount,
    icon: 'Calendar',
    color: '#059669',
  },
  {
    key: 'today',
    label: '今日凭证',
    value: stats.value.todayVoucherCount,
    icon: 'Clock',
    color: '#7c3aed',
  },
  {
    key: 'draft',
    label: '待审核',
    value: stats.value.draftCount,
    icon: 'Warning',
    color: '#d97706',
    to: '/voucher/list',
  },
  {
    key: 'account',
    label: '会计科目',
    value: stats.value.accountCount,
    icon: 'FolderOpened',
    color: '#0ea5e9',
    to: '/settings/accounts',
  },
  {
    key: 'partner',
    label: '往来单位',
    value: stats.value.partnerCount,
    icon: 'User',
    color: '#db2777',
    to: '/settings/partners',
  },
])

const quickLinks = computed(() => {
  const all = [
    // AI 记账置顶，作为默认的记账路径
    { title: 'AI 上传记账', path: '/receipts/workbench', icon: 'MagicStick', permission: 'receipts:workbench' },
    { title: '手动录入凭证', path: '/voucher/create', icon: 'EditPen', permission: 'voucher:create' },
    { title: '凭证列表', path: '/voucher/list', icon: 'Tickets', permission: 'voucher:list' },
    { title: '现金银行', path: '/cash-bank', icon: 'Money', permission: 'cash-bank' },
    { title: '应收应付', path: '/ar-ap', icon: 'Connection', permission: 'ar-ap' },
    { title: '科目余额表', path: '/books/balance', icon: 'Notebook', permission: 'books:balance' },
    { title: '资产负债表', path: '/reports/balance-sheet', icon: 'DataAnalysis', permission: 'reports:balance-sheet' },
    { title: '利润表', path: '/reports/profit-loss', icon: 'TrendCharts', permission: 'reports:profit-loss' },
    { title: '会计科目', path: '/settings/accounts', icon: 'FolderOpened', permission: 'settings:account' },
  ]
  const perms = userStore.profile?.permissions ?? []
  return all.filter((item) => perms.includes(item.permission))
})

onMounted(async () => {
  try {
    stats.value = await systemApi.dashboard()
  } catch (error) {
    console.warn('加载工作台数据失败', error)
  }
  try {
    overview.value = await reportApi.overview({ endPeriod: period.value })
  } catch (error) {
    console.warn('加载经营看板失败', error)
  }
})
</script>

<style scoped lang="scss">
.welcome {
  margin-bottom: 12px;

  &__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  &__hello {
    font-size: 17px;
    font-weight: 600;
    color: #111827;
  }

  &__sub {
    margin-top: 4px;
    font-size: 13px;
    color: var(--app-text-secondary);
  }

  &__quick {
    display: flex;
    gap: 8px;
  }
}

.stat-row {
  margin-bottom: 12px;
}

.stat-card {
  cursor: pointer;

  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }

  &__icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
    flex-shrink: 0;
  }

  &__value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
    color: #111827;
  }

  &__label {
    font-size: 12px;
    color: var(--app-text-secondary);
    margin-top: 2px;
  }
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 6px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;

  &:hover {
    border-color: var(--app-primary);
    color: var(--app-primary);
    background: #eff6ff;
  }

  &__icon {
    font-size: 20px;
  }
}

.tips {
  margin: 0;
  padding-left: 18px;
  color: #4b5563;
  line-height: 2;
  font-size: 13px;
}

.mt12 {
  margin-top: 12px;
}

.overview {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }

  &__alert {
    margin-top: 12px;
  }
}

.overview-metric {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #fbfcfe;

  &__label {
    font-size: 12px;
    color: var(--app-text-secondary);
  }

  &__value {
    margin-top: 4px;
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    white-space: nowrap;

    &--income {
      color: #059669;
    }

    &--expense {
      color: #dc2626;
    }
  }
}
</style>