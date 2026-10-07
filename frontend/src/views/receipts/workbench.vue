<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-alert type="info" :closable="false" show-icon class="page-toolbar__alert"
          title="票据识别结果一律先到「待确认」：确认入账后才计入账簿与报表；确认前可修改分录科目与金额。" />
        <el-button type="primary" :disabled="!selectedDrafted.length" :loading="confirming" @click="onConfirmBatch">
          <el-icon><Select /></el-icon>批量确认（{{ selectedDrafted.length }}）
        </el-button>
        <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无待确认票据" row-key="id" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="45" :selectable="(row: any) => row.status === 'drafted'" />
        <el-table-column prop="fileName" label="票据文件" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="link" @click="openImage(row)">{{ row.fileName }}</span>
            <el-tag v-if="row.status === 'drafted'" type="warning" size="small" class="ml6">草稿</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <span>{{ row.receiptTypeName }}</span>
            <el-tooltip v-if="row.confidence != null" :content="`识别置信度 ${(row.confidence * 100).toFixed(1)}%`" placement="top">
              <span class="confidence" :class="{ 'confidence--low': row.confidence < 0.6 }">{{ (row.confidence * 100).toFixed(0) }}%</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="开票日期" width="110">
          <template #default="{ row }">{{ row.issueDate || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="归类建议" min-width="260">
          <template #default="{ row }">
            <template v-if="row.suggestion">
              <div class="suggest-line">
                <el-tag size="small" :type="SUGGEST_TAG[row.suggestion.kind]">{{ row.suggestion.kindLabel }}</el-tag>
                <span class="suggest-text">{{ row.suggestion.message }}</span>
              </div>
              <div v-if="row.suggestion.counterparty" class="suggest-sub">对手：{{ row.suggestion.counterparty }}</div>
              <div v-if="row.suggestion.hitChain?.length" class="suggest-sub">
                命中：<el-tag v-for="h in row.suggestion.hitChain" :key="`${h.ruleName}-${h.priority}`" size="small" type="info" class="mr4">
                  {{ h.ruleName }}
                </el-tag>
              </div>
            </template>
            <span v-else class="text-muted">无法自动归类</span>
          </template>
        </el-table-column>
        <el-table-column label="凭证草稿" min-width="180">
          <template #default="{ row }">
            <template v-if="row.draft">
              <div class="suggest-sub">{{ row.draft.voucherDate }} 记{{ row.draft.voucherNo }}</div>
              <div v-if="row.draft.entries" class="suggest-sub">
                <span v-for="(e, i) in row.draft.entries" :key="i" class="entry-line">
                  {{ e.debit ? `借 ${e.accountCode}` : `贷 ${e.accountCode}` }}
                  <span class="text-muted">{{ formatAmount(e.debit || e.credit) }}</span>
                </span>
              </div>
            </template>
            <span v-else class="text-muted">未生成</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'parsed'" v-permission="'receipt:confirm'" link type="primary"
              :loading="draftingId === row.id" @click="onGenerateDraft(row)">生成草稿</el-button>
            <template v-if="row.status === 'drafted'">
              <el-button v-permission="'receipt:confirm'" link type="primary" @click="openEditDraft(row)">修改草稿</el-button>
              <el-button v-permission="'receipt:confirm'" link type="success" @click="onConfirm(row)">确认入账</el-button>
              <el-button v-permission="'receipt:confirm'" link type="danger" @click="onReject(row)">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="onReset" />
      </div>
    </div>

    <!-- 修改草稿弹窗 -->
    <el-dialog v-model="editVisible" title="修改凭证草稿" width="860px" destroy-on-close>
      <template v-if="editing">
        <el-descriptions :column="3" border size="small" class="mb12">
          <el-descriptions-item label="票据">{{ editing.fileName }}</el-descriptions-item>
          <el-descriptions-item label="日期">
            <el-date-picker v-model="draftForm.voucherDate" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
          </el-descriptions-item>
          <el-descriptions-item label="凭证字号">记</el-descriptions-item>
        </el-descriptions>

        <el-table :data="draftForm.entries" size="small" class="mb12">
          <el-table-column label="摘要" min-width="160">
            <template #default="{ row }">
              <el-input v-model="row.summary" size="small" maxlength="200" />
            </template>
          </el-table-column>
          <el-table-column label="会计科目" min-width="230">
            <template #default="{ row }">
              <el-select v-model="row.accountId" filterable size="small" style="width: 100%">
                <el-option v-for="acc in accountOptions" :key="acc.id"
                  :label="`${acc.code} ${acc.fullName}`" :value="acc.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="借方金额" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.debit" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="贷方金额" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.credit" :min="0" :precision="2" :controls="false" size="small" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="删除" width="60" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" :disabled="draftForm.entries.length <= 2" @click="removeEntry($index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="balance-bar" :class="{ 'balance-bar--ok': balanceOk }">
          借方合计 {{ formatAmount(debitTotal) }}　贷方合计 {{ formatAmount(creditTotal) }}
          <el-tag :type="balanceOk ? 'success' : 'danger'" size="small">{{ balanceOk ? '借贷平衡' : '借贷不平' }}</el-tag>
        </div>
      </template>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!balanceOk" :loading="savingDraft" @click="onSaveDraft">保存草稿</el-button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="rejectVisible" title="驳回票据" width="460px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="驳回原因（可选）">
          <el-input v-model="rejectReason" type="textarea" :rows="3" maxlength="200" show-word-limit
            placeholder="例如：发票不清晰 / 非本公司票据 / 需要人工补录" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejecting" @click="onRejectConfirm">确认驳回</el-button>
      </template>
    </el-dialog>

    <!-- 原图预览 -->
    <el-dialog v-model="imageVisible" :title="imageName" width="640px" destroy-on-close>
      <el-image v-if="imageUrl" :src="imageUrl" fit="contain" style="width: 100%; max-height: 70vh" :preview-src-list="[imageUrl]" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Select, Refresh, Delete } from '@element-plus/icons-vue'
import { receiptApi } from '@/api'
import service from '@/api/http'
import { usePagedList, ok } from '@/composables/useList'
import { accountApi } from '@/api'
import { formatAmount } from '@/utils/format'

const SUGGEST_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
  input_vat: 'danger',
  output_vat: 'success',
  expense: 'warning',
  bank_fee: 'info',
  unknown: 'info',
}

const { list, total, loading, query, load, reset: onReset } = usePagedList({
  fetcher: (params) => receiptApi.pending(params),
  defaultParams: { page: 1, pageSize: 20 },
})

const accountOptions = ref<any[]>([])
async function loadAccounts() {
  try {
    accountOptions.value = await accountApi.options()
  } catch {
    accountOptions.value = []
  }
}

// ============ 批量确认 ============
const selected = ref<any[]>([])
const confirming = ref(false)
const selectedDrafted = computed(() => selected.value.filter((r) => r.status === 'drafted'))

function onSelectionChange(rows: any[]) {
  selected.value = rows
}

async function onConfirmBatch() {
  const ids = selectedDrafted.value.map((r) => r.id)
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(`确定批量确认 ${ids.length} 张票据入账？确认后进入账簿与报表。`, '批量确认', {
      type: 'warning',
      confirmButtonText: '确认入账',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  confirming.value = true
  try {
    const res = await receiptApi.confirmBatch(ids)
    if (res.failed > 0) {
      ElMessage.warning(`成功 ${res.success} 张，失败 ${res.failed} 张：${res.results.filter((r: any) => !r.success).map((r: any) => r.message).join('；')}`)
    } else {
      ok(`已确认入账 ${res.success} 张票据`)
    }
    await load()
  } finally {
    confirming.value = false
  }
}

// ============ 生成草稿 ============
const draftingId = ref('')

async function onGenerateDraft(row: any) {
  draftingId.value = row.id
  try {
    const res = await receiptApi.generateDraft(row.id)
    const updated = res as any
    if (updated.draft) {
      ok('凭证草稿已生成，借贷平衡')
    }
    await load()
  } finally {
    draftingId.value = ''
  }
}

// ============ 修改草稿 ============
const editVisible = ref(false)
const editing = ref<any>(null)
const draftForm = reactive<{ voucherDate: string; entries: any[] }>({ voucherDate: '', entries: [] })
const savingDraft = ref(false)

const debitTotal = computed(() => draftForm.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0))
const creditTotal = computed(() => draftForm.entries.reduce((s, e) => s + (Number(e.credit) || 0), 0))
const balanceOk = computed(() => draftForm.entries.length >= 2 && Math.abs(debitTotal.value - creditTotal.value) < 0.005)

function openEditDraft(row: any) {
  editing.value = row
  draftForm.voucherDate = row.draft?.voucherDate || row.issueDate || ''
  draftForm.entries = (row.draft?.entries ?? []).map((e: any) => ({
    summary: e.summary ?? '',
    accountId: e.accountId,
    debit: Number(e.debit) || 0,
    credit: Number(e.credit) || 0,
  }))
  editVisible.value = true
}

function removeEntry(index: number) {
  if (draftForm.entries.length <= 2) return
  draftForm.entries.splice(index, 1)
}

async function onSaveDraft() {
  if (!balanceOk.value) {
    ElMessage.warning('借贷不平，无法保存')
    return
  }
  savingDraft.value = true
  try {
    await receiptApi.updateDraft(editing.value.id, {
      voucherDate: draftForm.voucherDate,
      entries: draftForm.entries,
    })
    ok('草稿已保存')
    editVisible.value = false
    await load()
  } finally {
    savingDraft.value = false
  }
}

// ============ 确认入账 ============
async function onConfirm(row: any) {
  try {
    await ElMessageBox.confirm(`确定「${row.fileName}」确认入账？`, '确认入账', {
      type: 'warning',
      confirmButtonText: '确认入账',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await receiptApi.confirm(row.id)
  ok('已确认入账')
  await load()
}

// ============ 驳回 ============
const rejectVisible = ref(false)
const rejectTarget = ref<any>(null)
const rejectReason = ref('')
const rejecting = ref(false)

function onReject(row: any) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectVisible.value = true
}

async function onRejectConfirm() {
  rejecting.value = true
  try {
    await receiptApi.reject(rejectTarget.value.id, rejectReason.value || undefined)
    ok('已驳回，该票据不会生成凭证')
    rejectVisible.value = false
    await load()
  } finally {
    rejecting.value = false
  }
}

// ============ 原图预览 ============
const imageVisible = ref(false)
const imageUrl = ref('')
const imageName = ref('')

async function openImage(row: any) {
  try {
    const res = await service.get(receiptApi.fileUrl(row.id), { responseType: 'blob' })
    imageUrl.value = URL.createObjectURL(new Blob([res.data]))
    imageName.value = row.fileName
    imageVisible.value = true
  } catch {
    ElMessage.error('无法加载票据原图')
  }
}

onMounted(loadAccounts)
</script>

<style scoped>
.page-toolbar__alert {
  flex: 1;
  margin-right: 12px;
  min-width: 420px;
}
.link {
  color: var(--el-color-primary);
  cursor: pointer;
}
.ml6 {
  margin-left: 6px;
}
.mr4 {
  margin-right: 4px;
}
.confidence {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-color-success);
}
.confidence--low {
  color: var(--el-color-danger);
}
.suggest-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.suggest-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.suggest-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.entry-line {
  display: block;
  line-height: 1.5;
}
.text-muted {
  color: var(--el-text-color-secondary);
}
.balance-bar {
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.balance-bar--ok {
  background: var(--el-color-success-light-9);
}
.mb12 {
  margin-bottom: 12px;
}
</style>
