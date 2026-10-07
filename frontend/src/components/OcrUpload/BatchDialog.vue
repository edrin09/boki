<template>
  <el-dialog
    :model-value="modelValue"
    :title="`批量建档 · ${targetLabel}`"
    width="960px"
    destroy-on-close
    @update:model-value="close"
    @open="onOpen"
  >
    <el-upload
      drag
      multiple
      action="#"
      :auto-upload="false"
      :show-file-list="false"
      :accept="ACCEPT"
      :on-change="onFileChange"
    >
      <el-icon class="batch__icon"><UploadFilled /></el-icon>
      <div class="batch__text">将多张证件拖到此处，或<em>点击选择</em>，系统逐张识别后进入预览表格</div>
    </el-upload>

    <div class="batch__actions">
      <el-button @click="triggerCamera"><el-icon><Camera /></el-icon>拍照</el-button>
      <el-button v-if="rows.length" text type="info" @click="rows = []">清空</el-button>
      <span class="batch__hint">识别完成后可在表格中逐条修改，确认无误再批量入库</span>
    </div>
    <input
      ref="cameraRef"
      type="file"
      class="batch__camera"
      accept="image/*"
      capture="environment"
      @change="onCameraChange"
    />

    <el-table v-if="rows.length" v-loading="recognizing" :data="rows" size="small" max-height="360" class="batch__table">
      <el-table-column label="入库" width="56" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.included" :disabled="row.loading || Boolean(row.error) || row.done" />
        </template>
      </el-table-column>
      <el-table-column label="识别证件" width="150">
        <template #default="{ row }">
          <div class="batch__file">{{ row.fileName }}</div>
          <el-tag v-if="row.docTypeName" size="small" :type="row.docTypeMatched ? 'primary' : 'warning'">
            {{ row.docTypeName }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in columns"
        :key="col.key"
        :label="col.label"
        :min-width="col.width ?? 150"
      >
        <template #default="{ row }">
          <el-select
            v-if="col.type === 'gender'"
            v-model="row.values[col.key]"
            size="small"
            style="width: 100%"
            :disabled="!canEdit(row)"
          >
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="未知" value="unknown" />
          </el-select>
          <el-input
            v-else
            v-model="row.values[col.key]"
            size="small"
            :disabled="!canEdit(row)"
            :placeholder="col.required ? '必填' : ''"
          />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="150">
        <template #default="{ row }">
          <span v-if="row.loading" class="batch__muted">识别中…</span>
          <el-tag v-else-if="row.done" type="success" size="small">{{ row.message }}</el-tag>
          <el-tag v-else-if="row.error" type="danger" size="small">{{ row.error }}</el-tag>
          <el-tag v-else-if="!row.included" type="info" size="small">不入库</el-tag>
          <el-tag v-else type="warning" size="small">待入库</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="70">
        <template #default="{ $index }">
          <el-button text type="danger" size="small" @click="rows.splice($index, 1)">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="尚未选择证件" :image-size="80" />

    <template #footer>
      <span class="batch__summary">已识别 {{ rows.length }} 张，待入库 {{ pendingCount }} 条</span>
      <el-button @click="close(false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="pendingCount === 0" @click="onSubmit">
        批量入库
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { Camera, UploadFilled } from '@element-plus/icons-vue'
import { employeeApi, ocrApi, partnerApi, type ExtractResult, type ExtractTarget } from '@/api'

const props = defineProps<{
  modelValue: boolean
  target: ExtractTarget
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}>()

const ACCEPT = '.jpg,.jpeg,.png,.webp,.bmp,.tiff,.pdf,image/*,application/pdf'
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/

const targetLabel = computed(() => (props.target === 'partner' ? '往来单位' : '员工'))

interface Column {
  key: string
  label: string
  required?: boolean
  width?: number
  type?: 'text' | 'gender'
}

const COLUMNS: Record<ExtractTarget, Column[]> = {
  partner: [
    { key: 'name', label: '名称', required: true, width: 200 },
    { key: 'taxNo', label: '纳税人识别号', width: 190 },
    { key: 'legalPerson', label: '法定代表人', width: 120 },
    { key: 'address', label: '地址', width: 200 },
  ],
  employee: [
    { key: 'name', label: '姓名', required: true, width: 120 },
    { key: 'gender', label: '性别', width: 110, type: 'gender' },
    { key: 'idCard', label: '身份证号', width: 190 },
  ],
}

const columns = computed(() => COLUMNS[props.target])

interface BatchRow {
  id: string
  fileName: string
  loading: boolean
  included: boolean
  done?: boolean
  error?: string
  message?: string
  docTypeName?: string
  docTypeMatched?: boolean
  values: Record<string, any>
}

const rows = ref<BatchRow[]>([])
const recognizing = ref(false)
const submitting = ref(false)
const cameraRef = ref<HTMLInputElement>()

let seq = 0
function nextId(): string {
  seq += 1
  return `batch-${Date.now()}-${seq}`
}

function emptyValues(): Record<string, any> {
  const values: Record<string, any> = {}
  for (const col of columns.value) values[col.key] = col.type === 'gender' ? 'unknown' : ''
  return values
}

const pendingCount = computed(
  () => rows.value.filter((r) => r.included && !r.loading && !r.error && !r.done).length,
)

function canEdit(row: BatchRow): boolean {
  return !row.loading && !row.error && !row.done
}

function onOpen(): void {
  rows.value = []
}

function close(value = false): void {
  emit('update:modelValue', value)
}

function onFileChange(file: UploadFile): void {
  const raw = file.raw
  if (raw) void recognize([raw])
}

function onCameraChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) void recognize(files)
}

function triggerCamera(): void {
  cameraRef.value?.click()
}

async function recognize(files: File[]): Promise<void> {
  recognizing.value = true
  try {
    for (const file of files) {
      const row: BatchRow = {
        id: nextId(),
        fileName: file.name,
        loading: true,
        included: true,
        values: emptyValues(),
      }
      rows.value.push(row)

      if (!ALLOWED.test(file.type)) {
        row.loading = false
        row.included = false
        row.error = '不支持的格式'
        continue
      }
      if (file.size > MAX_BYTES) {
        row.loading = false
        row.included = false
        row.error = '超过 20MB'
        continue
      }

      try {
        const result = await ocrApi.extract(file, props.target)
        applyResult(row, result)
      } catch (err) {
        row.included = false
        row.error = (err as Error).message || '识别失败'
      } finally {
        row.loading = false
      }
    }
  } finally {
    recognizing.value = false
  }
}

function applyResult(row: BatchRow, result: ExtractResult): void {
  row.docTypeName = result.docTypeName
  row.docTypeMatched = result.docTypeMatched
  for (const [key, value] of Object.entries(result.values)) {
    row.values[key] = value
  }
  const required = columns.value.find((c) => c.required)
  if (required && !String(row.values[required.key] ?? '').trim()) {
    row.included = false
    row.error = `未识别到${required.label}`
  }
}

function buildPayload(row: BatchRow): Record<string, any> {
  const payload: Record<string, any> = {}
  for (const col of columns.value) {
    const value = row.values[col.key]
    if (value !== null && value !== undefined && String(value).trim() !== '') payload[col.key] = value
  }
  return payload
}

async function onSubmit(): Promise<void> {
  const targets = rows.value.filter((r) => r.included && !r.loading && !r.error && !r.done)
  if (targets.length === 0) return

  submitting.value = true
  try {
    const payload = targets.map((r) => buildPayload(r))
    const res =
      props.target === 'partner'
        ? await partnerApi.batchCreate(payload)
        : await employeeApi.batchCreate(payload)

    targets.forEach((row, index) => {
      const item = res?.results?.[index]
      if (item?.success) {
        row.done = true
        row.included = false
        row.message = `已建档 ${item.code ?? ''}`
      } else {
        row.error = item?.message ?? '入库失败'
        row.included = false
      }
    })

    if (res?.created > 0) emit('success')
    ElMessage.success(`批量入库完成：成功 ${res?.created ?? 0} 条，失败 ${res?.failed ?? 0} 条`)

    if (rows.value.every((r) => r.done || r.error)) {
      if (rows.value.every((r) => r.done)) {
        rows.value = []
        close(false)
      }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.batch__icon {
  font-size: 34px;
  color: var(--el-color-primary);
}

.batch__text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--app-text-secondary, #606266);

  em {
    color: var(--el-color-primary);
    font-style: normal;
  }
}

.batch__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}

.batch__hint {
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
}

.batch__camera {
  display: none;
}

.batch__table {
  margin-top: 4px;
}

.batch__file {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch__muted {
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
}

.batch__summary {
  float: left;
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
  line-height: 32px;
}
</style>