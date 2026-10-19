<template>
  <!-- 悬浮 FAB（登录后布局内显示，权限不足自动移除） -->
  <div class="voice-fab" :class="{ 'is-recording': state.phase === 'recording' }">
    <el-tooltip content="语音助手：按住 Alt 说话，松开自动查询，一句话出统计+Excel" placement="left">
      <button class="voice-fab__btn" :disabled="dialog.loading" @click="onFabClick">
        <span v-if="state.phase !== 'recording'" class="voice-fab__icon">🎙️</span>
        <span v-else class="voice-fab__wave">
          <i /><i /><i /><i />
        </span>
      </button>
    </el-tooltip>
    <span v-if="state.phase === 'recording'" class="voice-fab__tip">
      {{ recordingHint }}，松开 Alt 自动查询
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
    <div class="voice-dialog">
      <el-alert
        v-if="!chat.items.length"
        title="按住【Alt】键说话，松开自动查询；回答和思考过程会逐字显示，不方便说话也可直接打字"
        type="info"
        :closable="false"
        class="voice-dialog__hint"
      />

      <!-- 对话区：用户问题 + 思考过程 + 回答，全部打字机效果 -->
      <div ref="chatRef" class="voice-dialog__chat">
        <div
          v-for="(msg, idx) in chat.items"
          :key="idx"
          class="voice-dialog__row"
          :class="msg.role === 'user' ? 'is-user' : 'is-assistant'"
        >
          <div class="voice-dialog__bubble">
            <span class="voice-dialog__who">{{
              msg.role === 'user' ? '我' : '助手'
            }}</span>
            <span class="voice-dialog__msgtext">{{ msg.text }}</span>
            <span
              v-if="!msg.done"
              class="voice-dialog__caret"
              :class="{ 'is-thinking': msg.role === 'assistant' && dialog.loading }"
            />
            <span v-if="msg.role === 'assistant' && !msg.done && dialog.loading" class="voice-dialog__dots">
              <i /><i /><i />
            </span>
          </div>
        </div>
      </div>

      <!-- 查询结果：回答打完后展示表格 -->
      <template v-if="dialog.revealed && dialog.card?.columns?.length">
        <el-table
          :data="dialog.card.rows"
          :show-summary="!!dialog.card.totals"
          :summary-method="summaryMethod"
          size="small"
          max-height="300"
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
      </template>

      <div class="voice-dialog__text">
        <el-input
          ref="textInputRef"
          v-model="dialog.textContent"
          placeholder="不方便说话可直接打字，回车查询，比如“看看这个月的收支”"
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

/** 思考过程文案：与真实流水线一致（理解问题 → 查数据 → 汇总 → 生成回答） */
const THINK_STAGES = [
  '收到，正在理解你的问题…',
  '正在查询账务数据…',
  '正在汇总计算…',
  '正在生成回答，AI 查询一般需要几十秒…',
]
/** 打字机速度（ms/次）与每次吐出的字符数 */
const TYPE_INTERVAL = 40
const TYPE_STEP = 2
/** 阶段文案之间的停顿（ms） */
const STAGE_PAUSE = 500

/** idle：待录音；recording：按住 Alt 录音中（逐字上屏） */
type Phase = 'idle' | 'recording'

const state = reactive({
  phase: 'idle' as Phase,
  elapsedMs: 0,
})

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  /** 打字机是否已输出完 */
  done: boolean
}

/** 对话消息流：用户问题 / 思考过程 / 最终回答 */
const chat = reactive<{ items: ChatMsg[] }>({ items: [] })
const chatRef = ref<HTMLElement | null>(null)

/** WS 流式录音会话（按住 Alt 期间存在） */
let streamSession: VoiceStreamSession | null = null
/** 转写结果落进输入框后聚焦，方便直接改错别字 */
const textInputRef = ref<InputInstance | null>(null)

const dialog = reactive({
  visible: false,
  loading: false,
  title: '语音助手',
  transcript: '',
  replyType: 'success' as 'success' | 'warning' | 'info',
  card: null as VoiceCard | null,
  exportId: undefined as string | undefined,
  textContent: '',
  /** 回答是否已输出完（打完后才亮出表格与导出按钮） */
  revealed: false,
})

const recordingHint = computed(() => {
  const seconds = Math.floor(state.elapsedMs / 1000)
  return `正在录音 ${seconds}s`
})

// ==================== 打字机引擎 ====================

let typeTimer: ReturnType<typeof setInterval> | null = null
let stageTimer: ReturnType<typeof setTimeout> | null = null

function clearTypeTimers(): void {
  if (typeTimer) {
    clearInterval(typeTimer)
    typeTimer = null
  }
  if (stageTimer) {
    clearTimeout(stageTimer)
    stageTimer = null
  }
}

function scrollToBottom(): void {
  void nextTick(() => {
    const el = chatRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 把 full 逐字打进 msg.text，完成后回调 */
function typeText(msg: ChatMsg, full: string, onDone?: () => void): void {
  if (typeTimer) clearInterval(typeTimer)
  let i = 0
  typeTimer = setInterval(() => {
    i += TYPE_STEP
    msg.text = full.slice(0, i)
    scrollToBottom()
    if (i >= full.length) {
      if (typeTimer) clearInterval(typeTimer)
      typeTimer = null
      onDone?.()
    }
  }, TYPE_INTERVAL)
}

/** 依次打出思考阶段文案，最后一条停留（转点动画）直到结果回来 */
function startThinking(msg: ChatMsg): void {
  let stage = 0
  const next = (): void => {
    stage++
    if (stage >= THINK_STAGES.length) return
    stageTimer = setTimeout(() => typeText(msg, THINK_STAGES[stage], next), STAGE_PAUSE)
  }
  typeText(msg, THINK_STAGES[0], next)
}

// ==================== 查询流程 ====================

/** FAB 点击：只打开弹窗，不自动开录；等待用户按住 Alt */
function onFabClick(): void {
  openVoiceDialog()
}

/** 打开弹窗并回到待录音状态（提示按住 Alt 说话） */
function openVoiceDialog(): void {
  stopSpeaking()
  clearTypeTimers()
  state.phase = 'idle'
  state.elapsedMs = 0
  chat.items = []
  dialog.visible = true
  dialog.title = '语音助手'
  dialog.transcript = ''
  dialog.replyType = 'info'
  dialog.card = null
  dialog.exportId = undefined
  dialog.revealed = false
  dialog.loading = false
}

/** 按下 Alt：开始录音逐字上屏（按住说话，松开自动查询） */
async function startVoice(): Promise<void> {
  stopSpeaking()
  state.phase = 'recording'
  state.elapsedMs = 0
  dialog.visible = true
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

/** 松开 Alt：拿终稿 → 识别成功直接自动查询（不用再按回车） */
async function stopVoice(): Promise<void> {
  const s = streamSession
  streamSession = null
  if (!s) return
  const { text, wav } = await s.stop()
  state.phase = 'idle'
  const final = text.trim()
  if (final) {
    autoSubmit(final)
    return
  }
  // WS 终稿为空：REST 整段兜底；仍无内容才提示没有听清
  if (wav.size) {
    try {
      const { text: rest } = await voiceApi.transcribe(wav)
      if (rest.trim()) {
        autoSubmit(rest.trim())
        return
      }
    } catch {
      ElMessage.error('语音识别失败，请稍后重试，或直接打字查询')
      return
    }
  }
  ElMessage.info('没有听清内容，可以按住 Alt 重试，或直接打字')
}

/** 识别成功：把文字短暂亮在输入框后自动查询 */
function autoSubmit(text: string): void {
  dialog.textContent = text
  void nextTick(() => {
    textInputRef.value?.focus()
    // 稍作停顿让用户看到识别结果，再自动进查询
    stageTimer = setTimeout(() => {
      onSubmitText()
    }, 400)
  })
}

async function submit(run: () => Promise<VoiceQueryResult>): Promise<void> {
  dialog.loading = true
  dialog.revealed = false
  dialog.card = null
  dialog.exportId = undefined
  // 必须 reactive 包装：打字机直接改 msg.text，
  // 普通对象 push 进数组后不会触发视图更新（表现为最后一次性出现）
  const think = reactive<ChatMsg>({ role: 'assistant', text: '', done: false })
  chat.items.push(think)
  scrollToBottom()
  startThinking(think)
  try {
    const result = await run()
    showResult(result)
    // TTS 失败时静默降级为仅展示
    speak(result.reply)
  } catch {
    finishThinking()
    const msg = reactive<ChatMsg>({ role: 'assistant', text: '', done: false })
    chat.items.push(msg)
    dialog.revealed = true
    typeText(msg, '查询失败，请稍后重试，或换个说法试试', () => {
      msg.done = true
    })
    ElMessage.error('查询失败，请稍后重试')
  } finally {
    dialog.loading = false
  }
}

/** 思考占位行：打字停止并从消息流中移除 */
function finishThinking(): void {
  clearTypeTimers()
  const idx = chat.items.findIndex((m) => m.role === 'assistant' && !m.done)
  if (idx >= 0) chat.items.splice(idx, 1)
  scrollToBottom()
}

function showResult(result: VoiceQueryResult): void {
  finishThinking()
  dialog.title = result.card?.title ? `${result.card.title} · 语音助手` : '语音助手'
  dialog.transcript = result.transcript ?? ''
  dialog.replyType = result.intentId === 'fallback' || /出了点问题/.test(result.reply) ? 'warning' : 'success'
  dialog.card = result.intentId === 'fallback' ? null : result.card ?? null
  dialog.exportId = result.exportId
  // 回答逐字打出，打完亮出表格
  const msg = reactive<ChatMsg>({ role: 'assistant', text: '', done: false })
  chat.items.push(msg)
  scrollToBottom()
  typeText(msg, result.reply, () => {
    msg.done = true
    dialog.revealed = true
  })
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
  if (!text || dialog.loading) return
  if (stageTimer) {
    clearTimeout(stageTimer)
    stageTimer = null
  }
  dialog.textContent = ''
  chat.items.push({ role: 'user', text, done: true })
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
  clearTypeTimers()
  // 录音中断（对话框已关）：立即强制结束，结果直接丢弃
  const s = streamSession
  streamSession = null
  void s?.stop(true).then(() => {
    state.phase = 'idle'
  })
}

/**
 * 按 Alt 说话。Alt 不参与打字（输入框里也安全），
 * 替代原来的空格——空格和输入框输入冲突。
 */
function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Alt') return
  if (e.ctrlKey || e.shiftKey || e.metaKey) return
  if (!dialog.visible) return
  // 挡住浏览器菜单栏聚焦等默认行为
  e.preventDefault()
  if (e.repeat || state.phase !== 'idle') return
  startVoice().catch(() => {
    state.phase = 'idle'
    ElMessage.warning('无法访问麦克风，可以直接在弹窗里打字查询')
  })
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key !== 'Alt') return
  if (state.phase !== 'recording') return
  e.preventDefault()
  void stopVoice()
}

/** 按住录音时窗口失焦会丢 keyup（如 Alt+Tab），一直录到 15s 上限，这里兜底停掉 */
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
  clearTypeTimers()
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
  &__hint {
    margin-bottom: 10px;
  }

  &__chat {
    max-height: 320px;
    overflow-y: auto;
    padding: 6px 4px;
    margin-bottom: 10px;
    background: var(--el-fill-color-lighter, #f7f8fa);
    border-radius: 8px;
  }

  &__row {
    display: flex;
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: 2px;
    }

    &.is-user {
      justify-content: flex-end;

      .voice-dialog__bubble {
        background: var(--app-primary, #409eff);
        color: #fff;

        .voice-dialog__who {
          color: rgb(255 255 255 / 75%);
        }
      }
    }

    &.is-assistant {
      justify-content: flex-start;

      .voice-dialog__bubble {
        background: #fff;
        border: 1px solid var(--el-border-color-lighter, #e4e7ed);
      }
    }
  }

  &__bubble {
    max-width: 82%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-all;
  }

  &__who {
    display: block;
    font-size: 12px;
    margin-bottom: 2px;
    color: var(--el-text-color-secondary, #909399);
  }

  &__msgtext {
    white-space: pre-wrap;
  }

  &__caret {
    display: inline-block;
    width: 2px;
    height: 14px;
    margin-left: 2px;
    vertical-align: -2px;
    background: currentColor;
    animation: blink 0.8s step-start infinite;

    &.is-thinking {
      background: var(--app-primary, #409eff);
    }
  }

  &__dots {
    display: inline-flex;
    gap: 3px;
    margin-left: 6px;
    align-items: center;

    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--app-primary, #409eff);
      animation: dots 1s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
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

@keyframes blink {
  50% { opacity: 0; }
}

@keyframes dots {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(-3px); opacity: 1; }
}
</style>
