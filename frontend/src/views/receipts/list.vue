<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.receiptType" placeholder="票据类型" clearable style="width: 140px" @change="search">
          <el-option v-for="t in typeOptions" :key="t.type" :label="t.typeName" :value="t.type" />
        </el-select>
        <el-select v-model="query.status" placeholder="处理状态" clearable style="width: 140px" @change="search">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开票开始" end-placeholder="开票结束" style="width: 260px" @change="onDateChange" />
        <el-input v-model="query.keyword" placeholder="文件名 / 购销方 / 内容" clearable style="width: 180px"
          @keyup.enter="search" @clear="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'receipt:list'" type="primary" @click="uploadVisible = true">
          <el-icon><Upload /></el-icon>上传票据
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无票据">
        <el-table-column prop="fileName" label="文件" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="link" @click="openImage(row)">{{ row.fileName }}</span>
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
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">
            <span class="amount amount--total">{{ formatAmount(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="销售方" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.sellerName || '-' }}</div>
            <div v-if="row.sellerTaxNo" class="cell-sub">{{ row.sellerTaxNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="购买方" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.buyerName || '-' }}</div>
            <div v-if="row.buyerTaxNo" class="cell-sub">{{ row.buyerTaxNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_META[row.status]?.type" size="small">{{ STATUS_META[row.status]?.label ?? row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="175" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'parsed' || row.status === 'drafted'" link type="primary"
              @click="goWorkbench(row)">待确认</el-button>
            <el-button v-if="row.status !== 'confirmed'"
              v-permission="'receipt:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="handleSize" />
      </div>
    </div>

    <!-- 上传弹窗 -->
    <el-dialog v-model="uploadVisible" title="上传票据，AI 自动识别并记账" width="760px" destroy-on-close @closed="onUploadClose">
      <el-upload drag multiple :auto-upload="false" :limit="20" webkitdirectory accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/pdf"
        :on-change="onFileChange" :on-remove="onFileRemove" :file-list="fileList" :on-exceed="onExceed">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽文件到此处，或<em>点击选择文件夹</em></div>
        <template #tip>
          <div class="el-upload__tip">
            支持 jpg/png/webp/bmp/tiff/pdf，单文件 ≤ 20MB，一次最多 20 个。
            <strong>可直接选整个文件夹</strong>，系统递归读取并按文件夹名智能判断用途（采购/报销/工资/银行）与归属人；
            识别结果进入「待确认」。
          </div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="uploadVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!fileList.length" :loading="uploading" @click="onUpload">
          {{ results.length ? '重新识别' : '开始识别' }}
        </el-button>
      </template>

      <!-- 识别结果：区分「可直接记账」与「需人工处理」 -->
      <div v-if="results.length" class="result-panel">
        <div class="result-summary">
          <el-tag type="success" size="small">凭证已就绪 {{ draftedResults.length }}</el-tag>
          <el-tag type="warning" size="small">待人工 {{ pendingResults.length }}</el-tag>
          <el-tag v-if="otherResults.length" type="info" size="small">其他 {{ otherResults.length }}</el-tag>
        </div>
        <el-table :data="results" size="small" max-height="260">
          <el-table-column prop="fileName" label="文件" min-width="160" show-overflow-tooltip />
          <el-table-column label="识别结果" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.bookable ? 'success' : row.status === 'duplicate' ? 'info' : 'warning'">
                {{ row.receiptTypeName || '未识别' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="AI 判断" min-width="260">
            <template #default="{ row }">
              <!-- 已自动生成草稿：直接展示凭证摘要 -->
              <template v-if="row.drafted && row.draft">
                <div class="suggest-line">
                  <el-tag size="small" type="success">凭证已就绪</el-tag>
                  <span class="text-muted">记{{ row.draft.voucherNo }} · {{ row.draft.voucherDate }}</span>
                </div>
                <div class="entry-line text-muted">
                  {{ row.draft.entries.map((e: any) => `${Number(e.debit) ? '借' : '贷'} ${e.accountName} ${Number(e.debit || e.credit)}`).join('；') }}
                </div>
              </template>
              <template v-else-if="row.suggestKindLabel">
                <div class="suggest-line">
                  <el-tag size="small" type="warning">{{ row.suggestKindLabel }}</el-tag>
                </div>
                <div class="entry-line text-muted">{{ row.draftMessage || row.blockReason }}</div>
              </template>
              <span v-else-if="row.status === 'duplicate'" class="text-muted">{{ row.message || '重复票据' }}</span>
              <span v-else class="text-danger">{{ row.blockReason || row.message || '需人工处理' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="80" align="center">
            <template #default="{ row }">
              <span v-if="row.confidence != null">{{ (row.confidence * 100).toFixed(0) }}%</span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="result-actions">
          <el-button v-if="draftedResults.length" type="primary" size="small" @click="goWorkbench">
            <el-icon><Right /></el-icon>去确认入账（{{ draftedResults.length }}）
          </el-button>
          <span v-if="pendingResults.length" class="text-muted">
            待人工的单据尚未入账，可在工作台核对或手工生成凭证
          </span>
        </div>
      </div>
    </el-dialog>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="票据详情" width="720px" destroy-on-close>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small" class="mb12">
          <el-descriptions-item label="文件">{{ detail.fileName }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="STATUS_META[detail.status]?.type" size="small">{{ STATUS_META[detail.status]?.label ?? detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ detail.receiptTypeName }}</el-descriptions-item>
          <el-descriptions-item label="开票日期">{{ detail.issueDate || '-' }}</el-descriptions-item>
          <el-descriptions-item label="金额">{{ formatAmount(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="税额">{{ formatAmount(detail.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="销售方">{{ detail.sellerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="销售方税号">{{ detail.sellerTaxNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="购买方">{{ detail.buyerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="购买方税号">{{ detail.buyerTaxNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="发票代码">{{ detail.invoiceCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="发票号码">{{ detail.invoiceNo || '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.confirmedByName" label="确认人">{{ detail.confirmedByName }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.rejectReason" label="驳回原因">{{ detail.rejectReason }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="detail.fields ?? []" size="small" max-height="300">
          <el-table-column prop="label" label="字段" width="180" />
          <el-table-column prop="value" label="识别值" min-width="220" show-overflow-tooltip />
          <el-table-column label="置信度" width="90" align="center">
            <template #default="{ row: f }">
              <span v-if="f.confidence != null" :class="{ 'text-danger': f.confidence < 0.6 }">
                {{ (f.confidence * 100).toFixed(1) }}%
              </span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
        </el-table>
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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type UploadFile, type UploadFiles } from 'element-plus'
import { Search, Upload, UploadFilled, Right } from '@element-plus/icons-vue'
import { receiptApi } from '@/api'
import service from '@/api/http'
import { usePagedList, ok, confirmDelete } from '@/composables/useList'
import { formatAmount } from '@/utils/format'

const router = useRouter()

const STATUS_META: Record<string, { label: string; type: 'info' | 'success' | 'danger' | 'warning' }> = {
  parsed: { label: '待处理', type: 'warning' },
  drafted: { label: '草稿待确认', type: 'warning' },
  confirmed: { label: '已入账', type: 'success' },
  rejected: { label: '已驳回', type: 'info' },
  duplicate: { label: '重复', type: 'info' },
  failed: { label: '解析失败', type: 'danger' },
}

const typeOptions = [
  { type: 'invoice', typeName: '增值税发票' },
  { type: 'payroll', typeName: '工资表' },
  { type: 'bank_statement', typeName: '银行对账单' },
  { type: 'id_card', typeName: '身份证' },
  { type: 'business_license', typeName: '营业执照' },
  { type: 'train_ticket', typeName: '火车票' },
  { type: 'receipt', typeName: '通用收据' },
  { type: 'unknown', typeName: '未识别' },
]
const statusOptions = [
  { label: '待处理', value: 'parsed' },
  { label: '草稿待确认', value: 'drafted' },
  { label: '已入账', value: 'confirmed' },
  { label: '已驳回', value: 'rejected' },
  { label: '解析失败', value: 'failed' },
]

const dateRange = ref<[string, string] | null>(null)

const { list, total, loading, query, load, search, handleSize, reset: onReset } = usePagedList({
  fetcher: (params) => receiptApi.list(params),
  defaultParams: { page: 1, pageSize: 20 },
})

function onDateChange(val: [string, string] | null) {
  if (val) {
    query.value.startDate = val[0]
    query.value.endDate = val[1]
  } else {
    delete query.value.startDate
    delete query.value.endDate
  }
  search()
}

// ============ 上传 ============
const uploadVisible = ref(false)
const uploading = ref(false)
const fileList = ref<UploadFile[]>([])
/** 识别结果：保留在弹窗内供用户逐条查看原因，不直接关闭弹窗 */
const results = ref<any[]>([])

/** 凭证已自动生成 / 仍需人工（低置信度或不可归类）/ 重复或失败 */
const draftedResults = computed(() => results.value.filter((r) => r.drafted))
const pendingResults = computed(() => results.value.filter((r) => r.status === 'parsed' && !r.drafted))
const otherResults = computed(() => results.value.filter((r) => r.status !== 'parsed'))

function onFileChange(_file: UploadFile, files: UploadFiles) {
  fileList.value = files
  results.value = []
}

function onFileRemove(_file: UploadFile, files: UploadFiles) {
  fileList.value = files
  results.value = []
}

function onExceed() {
  ElMessage.warning('一次最多上传 20 个文件')
}

/** 与后端 ALLOWED_MIME 对齐的扩展名白名单（文件夹上传时 accept 不生效，需前端过滤） */
const UPLOAD_EXT = /\.(jpe?g|png|webp|bmp|tiff|pdf)$/i

async function onUpload() {
  const items = fileList.value.filter((f) => f.raw instanceof File)
  if (!items.length) return
  // 选文件夹时目录里的所有文件都会进列表，先按扩展名过滤，避免挤占 20 个名额还报错
  const supported = items.filter((f) => UPLOAD_EXT.test(f.name))
  const skipped = items.length - supported.length
  if (skipped > 0) ElMessage.info(`已跳过 ${skipped} 个不支持的文件（仅支持 jpg/png/webp/bmp/tiff/pdf）`)
  if (!supported.length) return
  const raws: File[] = supported.map((f) => f.raw as File)
  // 文件夹上传时带上每个文件的相对路径，供后端做目录智能判定
  const paths = supported.map((f) => (f.raw as any).webkitRelativePath || null)
  uploading.value = true
  try {
    const res = await receiptApi.upload(raws, paths)
    results.value = res ?? []
    const drafted = draftedResults.value.length
    const pending = pendingResults.value.length
    if (drafted > 0) {
      ElMessage.success(
        `识别完成：${drafted} 个已自动生成凭证${pending ? `，${pending} 个需人工确认` : ''}`,
      )
    } else if (pending > 0) {
      ElMessage.warning(`识别完成：${pending} 个单据需人工确认，原因见下方`)
    } else {
      ElMessage.info('识别完成：没有新增可记账的单据')
    }
    await load()
  } finally {
    uploading.value = false
  }
}

/** 关闭弹窗时清理状态 */
function onUploadClose() {
  fileList.value = []
  results.value = []
}

// ============ 详情 / 原图 ============
const detailVisible = ref(false)
const detail = ref<any>(null)

async function openDetail(row: any) {
  detail.value = await receiptApi.detail(row.id)
  detailVisible.value = true
}

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

function goWorkbench(row?: any) {
  void row
  uploadVisible.value = false
  router.push('/receipts/workbench')
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`票据「${row.fileName}」`))) return
  await receiptApi.remove(row.id)
  ok('票据已删除')
  await load()
}
</script>

<style scoped>
.link {
  color: var(--el-color-primary);
  cursor: pointer;
}
.confidence {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-color-success);
}
.confidence--low {
  color: var(--el-color-danger);
}
.text-muted {
  color: var(--el-text-color-secondary);
}
.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.text-danger {
  color: var(--el-color-danger);
}
.mb12 {
  margin-bottom: 12px;
}
.result-panel {
  margin-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.result-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.result-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 13px;
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
</style>
