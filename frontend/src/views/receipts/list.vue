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
        <el-table-column label="销售方" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.sellerName || '-' }}</template>
        </el-table-column>
        <el-table-column label="购买方" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.buyerName || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_META[row.status]?.type" size="small">{{ STATUS_META[row.status]?.label ?? row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'parsed' || row.status === 'drafted'" link type="primary"
              @click="goWorkbench(row)">待确认</el-button>
            <el-button v-if="row.status === 'confirmed' || row.status === 'rejected' || row.status === 'parsed' || row.status === 'drafted'"
              v-permission="'receipt:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="onReset" />
      </div>
    </div>

    <!-- 上传弹窗 -->
    <el-dialog v-model="uploadVisible" title="上传并识别票据" width="640px" destroy-on-close>
      <el-upload drag multiple :auto-upload="false" :limit="20" accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/pdf"
        :on-change="onFileChange" :on-remove="onFileRemove" :file-list="fileList" :on-exceed="onExceed">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽文件到此处，或<em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 jpg/png/webp/bmp/tiff/pdf，单文件 ≤ 20MB，一次最多 20 个；识别结果进入「待确认」</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="uploadVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!fileList.length" :loading="uploading" @click="onUpload">开始识别</el-button>
      </template>
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
          <el-descriptions-item label="购买方">{{ detail.buyerName || '-' }}</el-descriptions-item>
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
    <el-dialog v-model="imageVisible" :title="imageName" width="640px" destroy-on-close>
      <el-image v-if="imageUrl" :src="imageUrl" fit="contain" style="width: 100%; max-height: 70vh" :preview-src-list="[imageUrl]" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type UploadFile, type UploadFiles } from 'element-plus'
import { Search, Upload, UploadFilled } from '@element-plus/icons-vue'
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

const { list, total, loading, query, load, search, reset: onReset } = usePagedList({
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

function onFileChange(_file: UploadFile, files: UploadFiles) {
  fileList.value = files
}

function onFileRemove(_file: UploadFile, files: UploadFiles) {
  fileList.value = files
}

function onExceed() {
  ElMessage.warning('一次最多上传 20 个文件')
}

async function onUpload() {
  const raws: File[] = fileList.value.filter((f) => f.raw instanceof File).map((f) => f.raw as File)
  if (!raws.length) return
  uploading.value = true
  try {
    const results = await receiptApi.upload(raws)
    const parsed = results.filter((r) => r.status === 'parsed').length
    const dup = results.filter((r) => r.status === 'duplicate').length
    const failed = results.filter((r) => r.status === 'failed').length
    const failedMsgs = results.filter((r) => r.status === 'failed').map((r) => r.message).join('；')
    ElMessage[failed ? 'warning' : parsed ? 'success' : 'info'](
      `识别完成：成功 ${parsed}，重复 ${dup}，失败 ${failed}${failedMsgs ? `（${failedMsgs}）` : ''}`,
    )
    uploadVisible.value = false
    fileList.value = []
    await load()
  } finally {
    uploading.value = false
  }
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

function goWorkbench(row: any) {
  void row
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
.text-danger {
  color: var(--el-color-danger);
}
.mb12 {
  margin-bottom: 12px;
}
</style>
