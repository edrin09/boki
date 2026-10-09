<template>
  <div class="page">
    <div class="page-card">
      <!-- AI 上传区：主入口，上传即自动生成凭证 -->
      <div class="ai-upload">
        <el-upload drag multiple :auto-upload="false" :limit="20"
          accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/pdf"
          :on-change="onFileChange" :on-remove="onFileRemove" :file-list="fileList" :on-exceed="onExceed">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            拖拽发票、工资表、银行对账单到此处，或<em>点击选择文件</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 jpg/png/webp/bmp/tiff/pdf，单文件 ≤ 20MB，一次最多 20 个。
              AI 自动识别并生成借贷平衡的凭证，你只需核对后点一次「确认入账」。
            </div>
          </template>
        </el-upload>
        <el-button v-if="fileList.length" type="primary" class="ai-upload__go" :loading="uploading" @click="onUpload">
          <el-icon><MagicStick /></el-icon>{{ uploading ? 'AI 识别中…' : `AI 识别并生成凭证（${fileList.length}）` }}
        </el-button>
      </div>

      <div v-if="results.length" class="ai-result">
        <div class="result-summary">
          <el-tag type="success" size="small">凭证已就绪 {{ draftedResults.length }}</el-tag>
          <el-tag type="warning" size="small">待人工 {{ pendingResults.length }}</el-tag>
          <el-tag v-if="otherResults.length" type="info" size="small">其他 {{ otherResults.length }}</el-tag>
          <el-button size="small" @click="clearResults">清空结果</el-button>
        </div>
        <el-table :data="results" size="small" max-height="240">
          <el-table-column prop="fileName" label="文件" min-width="150" show-overflow-tooltip />
          <el-table-column label="识别" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.drafted ? 'success' : row.status === 'duplicate' ? 'info' : 'warning'">
                {{ row.receiptTypeName || '未识别' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="AI 判断" min-width="280">
            <template #default="{ row }">
              <template v-if="row.drafted && row.draft">
                <div class="suggest-line">
                  <el-tag size="small" type="success">凭证已生成</el-tag>
                  <span class="text-muted">记{{ row.draft.voucherNo }} · {{ row.draft.voucherDate }}</span>
                </div>
                <div class="entry-line text-muted">
                  {{ row.draft.entries.map((e: any) => `${Number(e.debit) ? '借' : '贷'} ${e.accountName} ${Number(e.debit || e.credit)}`).join('；') }}
                </div>
              </template>
              <template v-else-if="row.suggestKindLabel">
                <div class="suggest-line"><el-tag size="small" type="warning">{{ row.suggestKindLabel }}</el-tag></div>
                <div class="entry-line text-muted">{{ row.draftMessage || row.blockReason }}</div>
              </template>
              <span v-else class="text-muted">{{ row.blockReason || row.message || '需人工处理' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="80" align="center">
            <template #default="{ row }">
              <span v-if="row.confidence != null">{{ (row.confidence * 100).toFixed(0) }}%</span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
        </el-table>
        <el-button v-if="draftedResults.length" type="primary" size="small" class="mt8" @click="load">
          <el-icon><Refresh /></el-icon>刷新下方列表，确认入账
        </el-button>
      </div>

      <div class="page-toolbar">
        <div class="page-toolbar__hint">
          <strong>待确认入账</strong>
          <span class="text-muted">AI 已生成凭证草稿，核对科目与金额后点「确认入账」即可计入账簿。</span>
        </div>
        <el-button type="primary" :disabled="!selectedDrafted.length" :loading="confirming" @click="onConfirmBatch">
          <el-icon><Select /></el-icon>批量确认入账（{{ selectedDrafted.length }}）
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
            <!-- 不能自动入账时直接给出原因，避免用户点进去才报错 -->
            <div v-if="row.blockReason" class="suggest-sub text-danger">{{ row.blockReason }}</div>
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
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-tooltip v-if="row.bookable === false" content="该单据无法自动生成凭证，请查看左侧原因；可先「修正识别」纠正类型或方向" placement="top">
              <span class="disabled-hint">不可自动入账</span>
            </el-tooltip>
            <el-button v-if="row.status === 'parsed'" link type="primary" @click="openCorrect(row)">修正识别</el-button>
            <el-button v-if="row.status === 'parsed' && row.bookable !== false" v-permission="'receipt:confirm'" link type="primary"
              :loading="draftingId === row.id" @click="onGenerateDraft(row)">生成草稿</el-button>
            <template v-if="row.status === 'drafted'">
              <el-button v-permission="'receipt:confirm'" link type="primary" :loading="draftingId === row.id"
                @click="onGenerateDraft(row)">重新生成</el-button>
              <el-button v-permission="'receipt:confirm'" link type="primary" @click="openEditDraft(row)">修改草稿</el-button>
              <el-button v-permission="'receipt:confirm'" link type="success" @click="onConfirm(row)">确认入账</el-button>
              <el-button v-permission="'receipt:confirm'" link type="danger" @click="onReject(row)">驳回</el-button>
            </template>
            <el-button v-if="row.status === 'parsed' || row.status === 'drafted'" v-permission="'receipt:delete'"
              link type="danger" @click="onRemove(row)">删除</el-button>
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

    <!-- 修正识别弹窗 -->
    <el-dialog v-model="correctVisible" title="修正识别结果" width="460px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="票据类型">
          <el-select v-model="correctForm.receiptType" style="width: 100%" @change="onCorrectTypeChange">
            <el-option v-for="t in TYPE_OPTIONS" :key="t.type" :label="t.typeName" :value="t.type" />
          </el-select>
        </el-form-item>
        <el-form-item label="进项 / 销项方向（增值税发票适用）">
          <el-select v-model="correctForm.direction" style="width: 100%" clearable placeholder="跟随识别（默认）">
            <el-option label="进项（本公司为购买方）" value="input" />
            <el-option label="销项（本公司为销售方）" value="output" />
          </el-select>
          <div class="text-muted" style="font-size: 12px; line-height: 1.6">
            方向判定错误（进项/销项颠倒或无法判定）时可在此人工指定，保存后重新参与自动记账。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="correctVisible = false">取消</el-button>
        <el-button type="primary" :loading="correcting" @click="onCorrectSave">保存修正</el-button>
      </template>
    </el-dialog>

    <!-- 原图预览 -->
    <el-dialog v-model="imageVisible" :title="imageName" width="720px" destroy-on-close>
      <iframe v-if="isPdf && imageUrl" :src="imageUrl" style="width: 100%; height: 70vh; border: none" />
      <el-image v-else-if="imageUrl" :src="imageUrl" fit="contain" style="width: 100%; max-height: 70vh" :preview-src-list="[imageUrl]" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadFile, type UploadFiles } from 'element-plus'
import { Select, Refresh, Delete, UploadFilled, MagicStick } from '@element-plus/icons-vue'
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
  payroll: 'success',
  unknown: 'info',
}

const { list, total, loading, query, load, reset: onReset } = usePagedList({
  fetcher: (params) => receiptApi.pending(params),
  defaultParams: { page: 1, pageSize: 20 },
})

// ============ AI 上传 ============
const fileList = ref<UploadFile[]>([])
const uploading = ref(false)
/** 识别结果：保留在页面内供逐条查看原因 */
const results = ref<any[]>([])

const draftedResults = computed(() => results.value.filter((r) => r.drafted))
const pendingResults = computed(() => results.value.filter((r) => r.status === 'parsed' && !r.drafted))
const otherResults = computed(() => results.value.filter((r) => r.status !== 'parsed'))

function onFileChange(_f: UploadFile, files: UploadFiles) {
  fileList.value = files
  results.value = []
}

function onFileRemove(_f: UploadFile, files: UploadFiles) {
  fileList.value = files
  results.value = []
}

function onExceed() {
  ElMessage.warning('一次最多上传 20 个文件')
}

function clearResults() {
  results.value = []
  fileList.value = []
}

async function onUpload() {
  const raws: File[] = fileList.value.filter((f) => f.raw instanceof File).map((f) => f.raw as File)
  if (!raws.length) return
  uploading.value = true
  try {
    const res = await receiptApi.upload(raws)
    results.value = res ?? []
    const drafted = draftedResults.value.length
    const pending = pendingResults.value.length
    if (drafted > 0) {
      ElMessage.success(`AI 已生成 ${drafted} 张凭证${pending ? `，${pending} 个需人工确认` : ''}`)
    } else if (pending > 0) {
      ElMessage.warning(`${pending} 个单据需人工确认，原因见上方`)
    } else {
      ElMessage.info('没有新增可记账的单据')
    }
    await load()
  } finally {
    uploading.value = false
  }
}

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
  if (row.status === 'drafted') {
    try {
      await ElMessageBox.confirm('将按最新识别与归类重新生成凭证草稿，现有草稿（含手工修改）会被覆盖。继续？', '重新生成草稿', {
        type: 'warning',
        confirmButtonText: '重新生成',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
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
    // 辅助核算必须原样带出：应付账款/费用类科目缺往来单位或部门会被后端拒绝
    partnerId: e.partnerId ?? null,
    departmentId: e.departmentId ?? null,
    projectId: e.projectId ?? null,
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

// ============ 修正识别 ============
const TYPE_OPTIONS = [
  { type: 'invoice', typeName: '增值税发票' },
  { type: 'payroll', typeName: '工资表' },
  { type: 'bank_statement', typeName: '银行对账单' },
  { type: 'train_ticket', typeName: '火车票' },
  { type: 'receipt', typeName: '通用收据' },
  { type: 'unknown', typeName: '未识别' },
]

const correctVisible = ref(false)
const correcting = ref(false)
const correctingRow = ref<any>(null)
const correctForm = reactive<{ receiptType: string; direction: 'input' | 'output' | null }>({
  receiptType: '',
  direction: null,
})

function openCorrect(row: any) {
  correctingRow.value = row
  correctForm.receiptType = row.receiptType || 'unknown'
  correctForm.direction = row.directionOverride ?? null
  correctVisible.value = true
}

/** 类型改为非发票时清空方向（方向仅对增值税发票有意义） */
function onCorrectTypeChange(type: string) {
  if (type !== 'invoice') correctForm.direction = null
}

async function onCorrectSave() {
  if (!correctingRow.value) return
  correcting.value = true
  try {
    await receiptApi.update(correctingRow.value.id, {
      receiptType: correctForm.receiptType,
      direction: correctForm.direction ?? undefined,
    })
    ok('识别结果已修正，已重新评估能否自动入账')
    correctVisible.value = false
    await load()
  } finally {
    correcting.value = false
  }
}

// ============ 删除未入账票据 ============
async function onRemove(row: any) {
  try {
    await ElMessageBox.confirm(
      `确定删除票据「${row.fileName}」？删除后识别记录与原文件不可恢复。`,
      '删除票据',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await receiptApi.remove(row.id)
  ok('票据已删除')
  await load()
}

// ============ 原图预览 ============
const imageVisible = ref(false)
const imageUrl = ref('')
const imageName = ref('')
const isPdf = ref(false)

async function openImage(row: any) {
  try {
    const res = await service.get(receiptApi.fileUrl(row.id), { responseType: 'blob' })
    // axios responseType:'blob' 返回 Blob，自带后端 Content-Type
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    isPdf.value = blob.type === 'application/pdf' || /\.pdf$/i.test(row.fileName ?? '')
    imageUrl.value = URL.createObjectURL(blob)
    imageName.value = row.fileName
    imageVisible.value = true
  } catch {
    ElMessage.error('无法加载票据原图')
  }
}

onMounted(loadAccounts)
</script>

<style scoped>
.page-toolbar__hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: 12px;
  min-width: 320px;
  font-size: 14px;
}
.page-toolbar__hint .text-muted {
  font-size: 12px;
}

/* AI 上传区：作为页面主入口，视觉权重高于下方待确认表格 */
.ai-upload {
  padding: 16px 16px 8px;
  margin-bottom: 12px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
}
.ai-upload :deep(.el-upload-dragger) {
  padding: 22px 12px;
  background: var(--el-bg-color);
}
.ai-upload__go {
  margin: 12px 0 6px;
}
.ai-result {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.result-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.suggest-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.entry-line {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
}
.mt8 {
  margin-top: 8px;
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
.text-danger {
  color: var(--el-color-danger);
}
.disabled-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: help;
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
