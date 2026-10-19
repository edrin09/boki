<template>
  <!-- 悬浮 FAB（登录后布局内显示，权限不足自动移除） -->
  <div class="voice-fab" :class="{ 'is-recording': state.phase === 'recording' }">
    <el-tooltip content="语音助手：问收支/往来/借款/费用，一句话出统计+Excel" placement="left">
      <button class="voice-fab__btn" :disabled="dialog.loading" @click="onFabClick">
        <span v-if="state.phase !== 'recording'" class="voice-fab__icon">🎙️</span>
        <span v-else class="voice-fab__wave">
          <i /><i /><i /><i />
        </span>
      </button>
    </el-tooltip>
    <span v-if="state.phase === 'recording'" class="voice-fab__tip">
      {{ recordingHint }}（松开空格结束）
    </span>
  </div>

  <!-- 结果 dialog -->
  <el-dialog
    v-model="dialog.visible"
    :title="dialog.title"
    width="760px"
    append-to-body
    destroy-on-close
    @closed="onDialogClosed"
  >
    <div v-loading="dialog.loading" class="voice-dialog" element-loading-text="正在识别与统计…">
      <el-alert
        v-if="dialog.transcript"
        :title="`你说的是：“${dialog.transcript}”`"
        type="info"
        :closable="false"
        class="voice-dialog__transcript"
      />
      <el-alert
        v-if="dialog.reply"
        :title="dialog.reply"
        :type="dialog.replyType"
        :closable="false"
        show-icon
        class="voice-dialog__reply"
      />
      <el-alert
        v-else
        title="按住键盘【空格】键开始说话，语音逐字上屏；松开终稿出来后可修正错别字，按回车查询。不方便说话也可直接打字"
        type="info"
        :closable="false"
        class="voice-dialog__transcript"
      />

      <el-table
        v-if="dialog.card?.columns?.length"
        :data="dialog.card.rows"
        :show-summary="!!dialog.card.totals"
        :summary-method="summaryMethod"
        size="small"
        max-height="360"
        class="voice-dialog__table"
      >
        <el-table-column type="index" label="#" width="46" />
        <el-table-column
          v-for="col in dialog.card.columns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :min-width="col.width ? col.width : undefined"
          :align="col.numeric ? 'right' : 'left'"
        >
          <template #default="{ row }">
            {{ col.numeric ? formatAmount(Number(row[col.key] ?? 0)) : (row[col.key] ?? '') }}
          </template>
        </el-table-column>
      </el-table>

      <div class="voice-dialog__actions">
        <el-button type="primary" :disabled="!dialog.exportId" @click="onDownload">
          <el-icon><Download /></el-icon>下载 Excel
        </el-button>
        <el-button @click="onAskAgain">重新说</el-button>
      </div>

      <div class="voice-dialog__text">
        <el-input
          ref="textInputRef"
          v-model="dialog.textContent"
          placeholder="说话或打字（修正错别字后按回车查询），比如“看看这个月的收支”"
          :clearable="true"
          @keyup.enter="onSubmitText"
        />
        <el-button type="primary" plain :loading="dialog.loading" @click="onSubmitText">查询</el-button>
      </div>
      <div class="voice-dialog__cmds">
        <el-tag
          v-for="cmd in SAMPLE_CMDS"
          :key="cmd"
          class="voice-dialog__cmd"
          @click="onSampleCmd(cmd)"
        >{{ cmd }}</el-tag>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, type InputInstance } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { startStreamingVoice, type VoiceStreamSession } from '@/utils/voice-stream'
import { speak, stopSpeaking } from '@/utils/tts'
import { voiceApi, type VoiceCard, type VoiceQueryResult } from '@/api/voice'
import { formatAmount } from '@/utils/format'

const SAMPLE_CMDS = [
  '看看这个月的收支',
  '今年盈亏怎么样',
  '谁还欠我钱',
  '我欠供应商多少',
  '员工还有哪笔借款没还',
  '账上还剩多少钱',
  '这个月费用花在哪',
  '这个月记了几笔凭证',
  '导出这个月的凭证',
  '导出上个月的报销单',
]

/** idle：待录音；recording：按住空格录音中（逐字上屏） */
type Phase = 'idle' | 'recording'

const state = reactive({
  phase: 'idle' as Phase,
  elapsedMs: 0,
})

/** WS 流式录音会话（按住空格期间存在） */
let streamSession: VoiceStreamSession | null = null
/** 转写结果落进输入框后聚焦，方便直接改错别字 */
const textInputRef = ref<InputInstance | null>(null)

const dialog = reactive({
  visible: false,
  loading: false,
  title: '语音助手',
  transcript: '',
  reply: '',
  replyType: 'success' as 'success' | 'warning' | 'info',
  card: null as VoiceCard | null,
  exportId: undefined as string | undefined,
  textContent: '',
})

const recordingHint = computed(() => {
  const seconds = Math.floor(state.elapsedMs / 1000)
  return `正在录音 ${seconds}s`
})

/** FAB 点击：只打开弹窗，不自动开录；等待用户按住空格 */
function onFabClick(): void {
  openVoiceDialog()
}

/** 打开弹窗并回到待录音状态（提示按住空格说话） */
function openVoiceDialog(): void {
  stopSpeaking()
  state.phase = 'idle'
  state.elapsedMs = 0
  dialog.visible = true
  dialog.title = '语音助手'
  openDialogLoading()
}

/** 按下空格：开始录音逐字上屏（按住说话，松开结束） */
async function startVoice(): Promise<void> {
  stopSpeaking()
  state.phase = 'recording'
  state.elapsedMs = 0
  dialog.visible = true
  openDialogLoading()
  streamSession = await startStreamingVoice({
    onStatus: (s) => {
      state.elapsedMs = s.ms
    },
    onPartial: (text) => {
      // 逐字上屏；松开后终稿会覆盖此内容
      dialog.textContent = text
    },
    onError: (message) => {
      ElMessage.warning(message)
    },
  })
}

/** 松开空格：拿终稿进输入框（可改错别字）→ 回车由用户手动检索 */
async function stopVoice(): Promise<void> {
  const s = streamSession
  streamSession = null
  if (!s) return
  const { text, wav } = await s.stop()
  state.phase = 'idle'
  const final = text.trim()
  if (final) {
    dialog.textContent = final
    await nextTick()
    textInputRef.value?.focus()
    return
  }
  // WS 终稿为空：REST 整段兜底；仍无内容才提示没有听清
  if (wav.size) {
    dialog.loading = true
    try {
      const { text: rest } = await voiceApi.transcribe(wav)
      if (rest.trim()) {
        dialog.textContent = rest.trim()
        await nextTick()
        textInputRef.value?.focus()
        return
      }
    } catch {
      ElMessage.error('语音识别失败，请稍后重试，或直接打字查询')
      return
    } finally {
      dialog.loading = false
    }
  }
  ElMessage.info('没有听清内容，可以按住空格重试，或直接打字')
}

function openDialogLoading(): void {
  dialog.loading = false
  dialog.transcript = ''
  dialog.reply = ''
  dialog.replyType = 'info'
  dialog.card = null
  dialog.exportId = undefined
}

async function submit(run: () => Promise<VoiceQueryResult>): Promise<void> {
  dialog.loading = true
  try {
    const result = await run()
    showResult(result)
    // TTS 失败时静默降级为仅展示
    speak(result.reply)
  } catch {
    ElMessage.error('查询失败，请稍后重试，或换个说法试试')
  } finally {
    dialog.loading = false
  }
}

function showResult(result: VoiceQueryResult): void {
  dialog.title = result.card?.title ? `${result.card.title} · 语音助手` : '语音助手'
  dialog.transcript = result.transcript ?? ''
  dialog.reply = result.reply
  dialog.replyType = result.intentId === 'fallback' || /出了点问题/.test(result.reply) ? 'warning' : 'success'
  dialog.card = result.intentId === 'fallback' ? null : result.card ?? null
  dialog.exportId = result.exportId
  dialog.visible = true
  dialog.loading = false
}

function onAskAgain(): void {
  openVoiceDialog()
}

function onSampleCmd(cmd: string): void {
  dialog.textContent = cmd
  void onSubmitText()
}

function onSubmitText(): void {
  const text = dialog.textContent.trim()
  if (!text) return
  dialog.textContent = ''
  void submit(() => voiceApi.queryText(text))
}

function onDownload(): void {
  if (!dialog.exportId) return
  voiceApi.downloadExport(dialog.exportId, `${dialog.card?.title ?? '语音查询'}_${Date.now()}.xlsx`)
}

function summaryMethod({ columns }: { columns: Array<{ property?: string }> }): string[] {
  const totals = dialog.card?.totals ?? {}
  return columns.map((col) => {
    const key = col.property
    if (!key) return '合计'
    const v = totals[key]
    if (typeof v === 'number') return formatAmount(v)
    return v == null ? '' : String(v)
  })
}

function onDialogClosed(): void {
  stopSpeaking()
  // 录音中断（对话框已关）：立即强制结束，结果直接丢弃
  const s = streamSession
  streamSession = null
  void s?.stop(true).then(() => {
    state.phase = 'idle'
  })
}

/** 焦点在输入框/文本域/可编辑元素时空格归打字用，不触发说话 */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.code !== 'Space' || isEditableTarget(e.target)) return
  if (!dialog.visible) return
  // 按住期间挡住页面滚动等默认行为
  e.preventDefault()
  if (e.repeat || state.phase !== 'idle') return
  startVoice().catch(() => {
    state.phase = 'idle'
    ElMessage.warning('无法访问麦克风，可以直接在弹窗里打字查询')
  })
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.code !== 'Space' || isEditableTarget(e.target)) return
  if (state.phase !== 'recording') return
  e.preventDefault()
  void stopVoice()
}

/** 按住录音时窗口失焦会丢 keyup，一直录到 15s 上限，这里兜底停掉 */
function onBlur(): void {
  if (state.phase === 'recording') void stopVoice()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  void streamSession?.stop(true)
  streamSession = null
})
</script>

<style scoped lang="scss">
.voice-fab {
  position: fixed;
  right: 28px;
  bottom: 92px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;

  &__btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    font-size: 22px;
    color: #fff;
    background: var(--app-primary, #409eff);
    box-shadow: 0 6px 16px rgb(64 158 255 / 35%);
    display: flex;
    align-items: center;
    justify-content: center;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
  }

  &__wave {
    display: flex;
    align-items: center;
    gap: 3px;

    i {
      width: 4px;
      border-radius: 2px;
      background: #fff;
      animation: wave 0.9s ease-in-out infinite;

      &:nth-child(1) { height: 12px; }
      &:nth-child(2) { height: 20px; animation-delay: 0.15s; }
      &:nth-child(3) { height: 14px; animation-delay: 0.3s; }
      &:nth-child(4) { height: 22px; animation-delay: 0.45s; }
    }
  }

  &__tip {
    background: rgb(0 0 0 / 65%);
    color: #fff;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 4px;
    white-space: nowrap;
  }

  &.is-recording .voice-fab__btn {
    animation: pulse 1.2s ease-out infinite;
  }
}

.voice-dialog {
  &__transcript {
    margin-bottom: 10px;
  }

  &__reply {
    margin-bottom: 12px;

    :deep(.el-alert__title) {
      font-size: 14px;
      line-height: 1.6;
    }
  }

  &__table {
    margin-bottom: 12px;
  }

  &__actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__text {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  &__cmds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .voice-dialog__cmd {
      cursor: pointer;
    }
  }
}

@keyframes wave {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1.4); }
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgb(64 158 255 / 45%); }
  100% { box-shadow: 0 0 0 18px rgb(64 158 255 / 0%); }
}
</style>
