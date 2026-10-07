<template>
  <div class="ocr-upload">
    <el-upload
      class="ocr-upload__drop"
      drag
      multiple
      action="#"
      :auto-upload="false"
      :show-file-list="false"
      :disabled="disabled"
      :accept="ACCEPT"
      :on-change="onFileChange"
    >
      <el-icon class="ocr-upload__icon"><UploadFilled /></el-icon>
      <div class="ocr-upload__text">
        将证件拖到此处，或<em>点击选择</em>
      </div>
      <template #tip>
        <div class="ocr-upload__tip">
          支持营业执照、身份证等图片或 PDF，单文件不超过 20MB，可一次选择多张
        </div>
      </template>
    </el-upload>

    <div class="ocr-upload__actions">
      <el-button :disabled="disabled" @click="triggerCamera">
        <el-icon><Camera /></el-icon>拍照
      </el-button>
      <el-button v-if="items.length" text type="info" @click="clearAll">清空</el-button>
      <span class="ocr-upload__hint">识别结果仅作建议，确认后才会写入表单</span>
    </div>
    <input
      ref="cameraRef"
      type="file"
      class="ocr-upload__camera"
      accept="image/*"
      capture="environment"
      @change="onCameraChange"
    />

    <div v-for="(item, index) in items" :key="item.id" class="ocr-card">
      <div class="ocr-card__head">
        <span class="ocr-card__file">{{ item.fileName }}</span>
        <template v-if="item.result">
          <el-tag size="small" type="primary">{{ item.result.docTypeName }}</el-tag>
          <el-tag size="small" :type="item.result.source === 'pdf' ? 'info' : 'success'">
            {{ item.result.source === 'pdf' ? 'PDF 文本层' : 'OCR 识别' }}
          </el-tag>
          <el-tag size="small" :type="confidenceTag(item.result.confidence)">
            置信度 {{ percent(item.result.confidence) }}
          </el-tag>
        </template>
        <div class="ocr-card__spacer" />
        <el-button text type="danger" :disabled="item.loading" @click="removeItem(index)">移除</el-button>
      </div>

      <el-alert
        v-if="item.result && !item.result.docTypeMatched"
        class="ocr-card__alert"
        type="warning"
        :closable="false"
        show-icon
        :title="item.result.message"
      />

      <div v-if="item.loading" class="ocr-card__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>识别中，请稍候…</span>
      </div>

      <el-alert
        v-else-if="item.error"
        class="ocr-card__alert"
        type="error"
        :closable="false"
        show-icon
        :title="item.error"
      />

      <template v-else-if="item.result">
        <el-table :data="item.result.fields" size="small" empty-text="未识别到可用字段">
          <el-table-column label="应用" width="60" align="center">
            <template #default="{ row }">
              <el-checkbox v-if="row.targetKey" v-model="row.selected" />
              <span v-else class="ocr-card__na">—</span>
            </template>
          </el-table-column>
          <el-table-column label="识别项" width="130">
            <template #default="{ row }">{{ row.label }}</template>
          </el-table-column>
          <el-table-column label="识别结果" min-width="200">
            <template #default="{ row }">
              <el-input v-if="row.targetKey" v-model="row.value" size="small" />
              <span v-else>{{ row.value ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="填入档案字段" width="150">
            <template #default="{ row }">
              <span v-if="row.targetKey">{{ row.targetLabel }}</span>
              <span v-else class="ocr-card__na">不适用</span>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="90" align="right">
            <template #default="{ row }">{{ percent(row.confidence) }}</template>
          </el-table-column>
        </el-table>

        <div class="ocr-card__foot">
          <span class="ocr-card__count">已选 {{ selectedCount(item.result) }} 项</span>
          <el-button
            type="primary"
            size="small"
            :disabled="selectedCount(item.result) === 0"
            @click="applyItem(item.result)"
          >
            应用到表单
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { Camera, Loading, UploadFilled } from '@element-plus/icons-vue'
import { ocrApi, type ExtractResult, type ExtractTarget } from '@/api'

const props = withDefaults(
  defineProps<{
    target: ExtractTarget
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  (e: 'apply', payload: { values: Record<string, any>; result: ExtractResult }): void
}>()

const ACCEPT = '.jpg,.jpeg,.png,.webp,.bmp,.tiff,.pdf,image/*,application/pdf'
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/

interface OcrItem {
  id: string
  fileName: string
  loading: boolean
  error?: string
  result?: ExtractResult
}

const items = ref<OcrItem[]>([])
const cameraRef = ref<HTMLInputElement>()

let seq = 0
function nextId(): string {
  seq += 1
  return `ocr-${Date.now()}-${seq}`
}

function onFileChange(file: UploadFile): void {
  const raw = file.raw
  if (!raw) return
  void recognize([raw])
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

function clearAll(): void {
  items.value = []
}

function removeItem(index: number): void {
  items.value.splice(index, 1)
}

/** 逐张识别：OCR 属 CPU 密集，串行处理避免同时压满后端 */
async function recognize(files: File[]): Promise<void> {
  for (const file of files) {
    const item: OcrItem = { id: nextId(), fileName: file.name, loading: true }
    items.value.push(item)

    if (!ALLOWED.test(file.type)) {
      item.loading = false
      item.error = `不支持的文件类型：${file.type || '未知'}`
      continue
    }
    if (file.size > MAX_BYTES) {
      item.loading = false
      item.error = '文件超过 20MB 上限'
      continue
    }

    try {
      item.result = await ocrApi.extract(file, props.target)
    } catch (err) {
      item.error = (err as Error).message || '识别失败'
    } finally {
      item.loading = false
    }
  }
  if (items.value.some((i) => i.error)) ElMessage.warning('部分证件识别失败，可手动填写')
}

function selectedCount(result: ExtractResult): number {
  return result.fields.filter((f) => f.targetKey && f.selected && hasValue(f.value)).length
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function applyItem(result: ExtractResult): void {
  const values: Record<string, any> = {}
  for (const f of result.fields) {
    if (f.targetKey && f.selected && hasValue(f.value)) values[f.targetKey] = f.value
  }
  if (Object.keys(values).length === 0) {
    ElMessage.warning('请先勾选要填入的字段')
    return
  }
  emit('apply', { values, result })
}

function percent(value: number): string {
  return `${Math.round((value || 0) * 100)}%`
}

function confidenceTag(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 0.85) return 'success'
  if (value >= 0.6) return 'warning'
  return 'danger'
}

defineExpose({ clearAll })
</script>

<style scoped lang="scss">
.ocr-upload__drop {
  :deep(.el-upload-dragger) {
    padding: 18px 12px;
  }
}

.ocr-upload__icon {
  font-size: 36px;
  color: var(--el-color-primary);
}

.ocr-upload__text {
  margin-top: 6px;
  font-size: 13px;
  color: var(--app-text-secondary, #606266);

  em {
    color: var(--el-color-primary);
    font-style: normal;
  }
}

.ocr-upload__tip {
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
  line-height: 1.6;
}

.ocr-upload__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.ocr-upload__hint {
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
}

.ocr-upload__camera {
  display: none;
}

.ocr-card {
  margin-top: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}

.ocr-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ocr-card__file {
  font-size: 13px;
  font-weight: 600;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocr-card__spacer {
  flex: 1;
}

.ocr-card__alert {
  margin: 8px 0;
}

.ocr-card__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--app-text-secondary, #909399);
}

.ocr-card__na {
  color: var(--app-text-secondary, #c0c4cc);
}

.ocr-card__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
}

.ocr-card__count {
  font-size: 12px;
  color: var(--app-text-secondary, #909399);
}
</style>