<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <PeriodPicker v-model="period" width="150px" />
        <el-select v-model="query.status" placeholder="凭证状态" clearable style="width: 120px" @change="search">
          <el-option label="未审核" value="draft" />
          <el-option label="已审核" value="approved" />
          <el-option label="已作废" value="cancelled" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="搜索摘要 / 科目 / 备注"
          clearable
          style="width: 200px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'voucher:create'" type="primary" @click="router.push('/voucher/create')">
          <el-icon><Plus /></el-icon>新增凭证
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
      </div>

      <!-- 凭证列表（按凭证分组展示分录） -->
      <div v-loading="loading">
        <el-empty v-if="!loading && list.length === 0" description="暂无凭证数据" />

        <div v-for="voucher in list" :key="voucher.id" class="voucher-card">
          <div class="voucher-card__head">
            <div class="voucher-card__no">
              <el-tag v-if="voucher.isReversal" type="danger" size="small">红冲</el-tag>
              <el-tag :type="voucherStatusMeta(voucher.status).type" size="small">
                {{ voucherStatusMeta(voucher.status).label }}
              </el-tag>
              <span class="voucher-card__word">{{ voucher.word }}</span>
              <span class="voucher-card__no-text">
                第 {{ pad(voucher.voucherNo) }} 号
              </span>
              <span class="voucher-card__date">{{ formatDate(voucher.voucherDate) }}</span>
            </div>
            <div class="voucher-card__actions">
              <el-button
                v-if="canReverse(voucher)"
                v-permission="'voucher:reverse'"
                link
                type="danger"
                @click="onReverse(voucher)"
              >
                红冲
              </el-button>
              <el-button
                v-if="voucher.reversedById"
                link
                type="info"
                disabled
              >
                已红冲
              </el-button>
              <el-button v-permission="'voucher:copy'" link type="primary" @click="onCopy(voucher)">
                复制
              </el-button>
              <el-button
                v-if="voucher.status === 'draft'"
                v-permission="'voucher:approve'"
                link
                type="success"
                @click="onApprove(voucher)"
              >
                审核
              </el-button>
              <el-button
                v-if="voucher.status === 'approved'"
                v-permission="'voucher:unapprove'"
                link
                type="warning"
                @click="onUnapprove(voucher)"
              >
                反审核
              </el-button>
              <el-button
                v-if="voucher.status !== 'cancelled'"
                v-permission="'voucher:cancel'"
                link
                type="info"
                @click="onCancel(voucher)"
              >
                作废
              </el-button>
              <el-button
                v-if="voucher.status === 'draft'"
                v-permission="'voucher:update'"
                link
                type="primary"
                @click="onEdit(voucher)"
              >
                修改
              </el-button>
              <el-button
                v-if="voucher.status === 'draft'"
                v-permission="'voucher:delete'"
                link
                type="danger"
                @click="onRemove(voucher)"
              >
                删除
              </el-button>
            </div>
          </div>

          <el-table :data="voucher.entries ?? []" size="small" class="voucher-card__table">
            <el-table-column type="index" label="#" width="50" align="center" />
            <el-table-column prop="summary" label="摘要" min-width="180" />
            <el-table-column label="会计科目" min-width="200">
              <template #default="{ row }">
                {{ row.accountCode }} {{ row.accountName }}
              </template>
            </el-table-column>
            <el-table-column label="辅助核算" min-width="150">
              <template #default="{ row }">
                <span v-if="!row.partnerId && !row.departmentId && !row.projectId">-</span>
                <el-tag v-if="row.partnerId" size="small" class="aux-tag">{{ row.partnerName }}</el-tag>
                <el-tag v-if="row.departmentId" size="small" class="aux-tag">{{ row.departmentName }}</el-tag>
                <el-tag v-if="row.projectId" size="small" class="aux-tag">{{ row.projectName }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="借方金额" width="140" align="right">
              <template #default="{ row }">
                <span class="amount amount--debit">{{ row.debit ? formatAmount(row.debit) : '' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="贷方金额" width="140" align="right">
              <template #default="{ row }">
                <span class="amount amount--credit">{{ row.credit ? formatAmount(row.credit) : '' }}</span>
              </template>
            </el-table-column>
          </el-table>

          <div class="voucher-card__foot">
            <span>制单：{{ voucher.createdByName || '-' }}</span>
            <span v-if="voucher.approvedByName">审核：{{ voucher.approvedByName }}</span>
            <span v-if="voucher.remark" class="voucher-card__remark">备注：{{ voucher.remark }}</span>
            <span v-if="voucher.sourceReceipt" class="voucher-card__receipt">
              <el-icon><Paperclip /></el-icon>
              <span class="link" @click="openReceiptPreview(voucher)">
                原始票据：{{ voucher.sourceReceipt.fileName }}
              </span>
            </span>
            <div class="voucher-card__totals">
              <span>借方合计 <b class="amount amount--debit">{{ formatAmount(voucher.debitTotal) }}</b></span>
              <span>贷方合计 <b class="amount amount--credit">{{ formatAmount(voucher.creditTotal) }}</b></span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="list.length > 0" class="page-pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="onReset"
        />
      </div>
    </div>

    <!-- 原始票据预览（复用票据预览逻辑：PDF 用 iframe，图片用 el-image） -->
    <el-dialog v-model="receiptVisible" :title="receiptName" width="720px" destroy-on-close @closed="onReceiptClosed">
      <iframe v-if="receiptIsPdf && receiptUrl" :src="receiptUrl" style="width: 100%; height: 70vh; border: none" />
      <el-image
        v-else-if="receiptUrl"
        :src="receiptUrl"
        fit="contain"
        style="width: 100%; max-height: 70vh"
        :preview-src-list="[receiptUrl]"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Download, Paperclip } from '@element-plus/icons-vue'
import { voucherApi, receiptApi } from '@/api'
import service from '@/api/http'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { exportExcel } from '@/utils/export'
import { currentPeriod, formatAmount, formatDate, voucherStatusMeta } from '@/utils/format'
import PeriodPicker from '@/components/common/PeriodPicker.vue'

const router = useRouter()

const period = ref<number>(currentPeriod())
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, status: '', keyword: '' })

const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => voucherApi.list(params),
})

function pad(n: number): string {
  return String(n ?? 0).padStart(4, '0')
}

function onReset() {
  query.status = ''
  query.keyword = ''
  reset()
}

watch(period, () => {
  query.page = 1
  load()
})

async function onApprove(voucher: any) {
  try {
    await ElMessageBox.confirm(
      `确认审核「${voucher.word} 第 ${pad(voucher.voucherNo)} 号」凭证吗？审核后将计入账簿与报表。`,
      '审核凭证',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await voucherApi.approve(voucher.id)
    ok('审核成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onUnapprove(voucher: any) {
  try {
    await ElMessageBox.confirm('确认反审核该凭证吗？反审核后将不再计入账簿与报表。', '反审核', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await voucherApi.unapprove(voucher.id)
    ok('反审核成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onCancel(voucher: any) {
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('请输入作废原因（可选）', '作废凭证', {
      confirmButtonText: '确认作废',
      cancelButtonText: '取消',
      inputPlaceholder: '如：金额录入错误',
    })
    reason = res.value ?? ''
  } catch {
    return
  }
  try {
    await voucherApi.cancel(voucher.id, reason || undefined)
    ok('已作废')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onEdit(voucher: any) {
  router.push({ path: '/voucher/create', query: { id: voucher.id } })
}

/** 复制凭证：跳转到录入页并按复制数据预填（作为新凭证） */
function onCopy(voucher: any) {
  router.push({ path: '/voucher/create', query: { copyFrom: voucher.id } })
}

/** 只有「已审核、未被红冲、且不是红冲凭证本身」才可红冲 */
function canReverse(voucher: any): boolean {
  return (
    voucher.status === 'approved' &&
    !voucher.isReversal &&
    !voucher.reversedById
  )
}

async function onReverse(voucher: any) {
  let reason = ''
  let reversalDate = ''
  try {
    const res = await ElMessageBox.prompt(
      `将按「${voucher.word}-${pad(voucher.voucherNo)}」生成一张借贷方向相反的已审核红冲凭证。请填写冲销原因（必填）：`,
      '红字冲销',
      {
        confirmButtonText: '确认红冲',
        cancelButtonText: '取消',
        inputPlaceholder: '如：金额录入错误',
        inputValidator: (v: string) => (v && v.trim() ? true : '请填写冲销原因'),
      },
    )
    reason = res.value ?? ''
  } catch {
    return
  }
  try {
    await voucherApi.reverse(voucher.id, { reason, reversalDate: reversalDate || undefined })
    ElMessage.success('红字冲销成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onRemove(voucher: any) {
  if (!(await confirmDelete(`「${voucher.word} 第 ${pad(voucher.voucherNo)} 号」凭证`))) return
  try {
    await voucherApi.remove(voucher.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

// ============ 原始票据预览（票据自动生成的凭证才有 sourceReceipt） ============
const receiptVisible = ref(false)
const receiptUrl = ref('')
const receiptName = ref('')
const receiptIsPdf = ref(false)

async function openReceiptPreview(voucher: any) {
  const receipt = voucher.sourceReceipt
  if (!receipt) return
  try {
    const res = await service.get(receiptApi.fileUrl(receipt.id), { responseType: 'blob' })
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    receiptIsPdf.value = blob.type === 'application/pdf' || /\.pdf$/i.test(receipt.fileName ?? '')
    receiptUrl.value = URL.createObjectURL(blob)
    receiptName.value = receipt.fileName
    receiptVisible.value = true
  } catch {
    ElMessage.error('无法加载原始票据文件')
  }
}

/** 关闭预览时释放 blob URL */
function onReceiptClosed() {
  if (receiptUrl.value) {
    URL.revokeObjectURL(receiptUrl.value)
    receiptUrl.value = ''
  }
}

function onExport() {
  const rows: any[] = []
  for (const v of list.value as any[]) {
    for (const e of v.entries ?? []) {
      rows.push({
        date: v.voucherDate,
        word: v.word,
        no: pad(v.voucherNo),
        summary: e.summary,
        account: `${e.accountCode} ${e.accountName}`,
        debit: e.debit,
        credit: e.credit,
      })
    }
  }
  exportExcel({
    filename: `凭证列表_${period.value}.xlsx`,
    sheetName: '凭证',
    title: `凭证列表（${period.value}）`,
    columns: [
      { title: '日期', prop: 'date', width: 12 },
      { title: '凭证字', prop: 'word', width: 8 },
      { title: '凭证号', prop: 'no', width: 10 },
      { title: '摘要', prop: 'summary', width: 26 },
      { title: '会计科目', prop: 'account', width: 26 },
      { title: '借方金额', prop: 'debit', width: 15, amount: true },
      { title: '贷方金额', prop: 'credit', width: 15, amount: true },
    ],
    rows,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.voucher-card {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
  background: #fff;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f8fafc;
    border-bottom: 1px solid var(--app-border);
  }

  &__no {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  &__word {
    font-weight: 600;
  }

  &__no-text {
    color: #111827;
    font-weight: 600;
  }

  &__date {
    color: var(--app-text-secondary);
  }

  &__table {
    :deep(.el-table__cell) {
      padding: 5px 0;
    }
  }

  &__foot {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    border-top: 1px solid var(--app-border);
    font-size: 12px;
    color: var(--app-text-secondary);
  }

  &__remark {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__receipt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;

    .link {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--el-color-primary);
      cursor: pointer;
    }
  }

  &__totals {
    margin-left: auto;
    display: flex;
    gap: 16px;
  }
}

.aux-tag {
  margin-right: 4px;
}
</style>