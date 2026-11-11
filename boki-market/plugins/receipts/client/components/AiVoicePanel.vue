<template>
  <!--
    内嵌在 voice 插件语音弹窗里的「一句话办事」面板。
    宿主（voice）通过插槽透传 transcript / visible，
    本组件只在识别到写操作意图时才渲染，其余情况完全隐身。

    生命周期：takeover（我要接管这句话，宿主别再查了）
              → thinking（解析中，自己撑住等待感）
              → ready（卡片可改，改一次重新预演一次）
              → settled（交还控制权，宿主的发送按钮恢复可用）
  -->
  <div
    v-if="allowed && visible && (thinking || preview || ask || result)"
    class="aivp"
  >
    <div class="aivp__head">
      <span class="aivp__badge">智能记账</span>
      <span class="aivp__title">
        {{ thinking ? '正在识别这句话' : preview?.title || actionTitle || '指令预览' }}
      </span>
      <span v-if="refreshing" class="aivp__loading">重新预演…</span>
    </div>

    <!-- 解析中：模型响应要几秒，必须给明确的「在干活」信号 -->
    <div v-if="thinking" class="aivp__thinking">
      <span class="aivp__spinner" />
      <span class="aivp__thinking-text">{{ thinkStage }}</span>
      <span class="aivp__thinking-tip">本地模型首次响应约 5–15 秒，不用重复发送</span>
    </div>

    <!-- 没听懂 / 不支持 -->
    <div v-else-if="ask && !preview" class="aivp__ask">{{ ask }}</div>

    <!-- 确认卡片 -->
    <template v-else-if="preview">
      <div class="aivp__summary" :class="{ 'is-pending': !ready }">{{ preview.summary }}</div>

      <div v-if="missingList.length" class="aivp__missing">
        <span class="aivp__missing-label">还需补充：</span>
        <span
          v-for="m in missingList"
          :key="m.field"
          class="aivp__missing-item"
          :class="{ 'is-done': !isUnresolved(m.field) }"
          @click="focusField(m.field)"
        >
          {{ m.label }}{{ isUnresolved(m.field) ? '' : ' ✓' }}
        </span>
      </div>

      <div v-if="preview.warnings?.length" class="aivp__warn">
        <div v-for="(w, i) in preview.warnings" :key="i">· {{ w }}</div>
      </div>

      <div class="aivp__fields">
        <div
          v-for="item in editableFields"
          :key="item.key"
          :ref="(el: any) => setFieldRef(item.key!, el)"
          class="aivp__field"
          :class="{ 'is-wide': isWide(item.key!) }"
        >
          <label class="aivp__flabel">
            {{ item.label }}<em v-if="isUnresolved(item.key!)" class="aivp__req">*</em>
          </label>

          <!-- 科目：推荐置顶 + 全部明细科目，只选不手输 -->
          <AccountSelect
            v-if="item.kind === 'account'"
            v-model="draft[item.key!]"
            value-key="label"
            :suggest="item.options"
            :placeholder="item.placeholder"
          />

          <!-- 档案类：往来单位 / 部门 / 员工，一律从档案里选；留空就是不限 -->
          <el-select
            v-else-if="item.kind === 'partner' || item.kind === 'department' || item.kind === 'employee'"
            v-model="draft[item.key!]"
            filterable
            clearable
            size="small"
            style="width: 100%"
            :placeholder="item.placeholder || '从档案里选择'"
          >
            <!-- 留空即「不筛选」时，把这条语义明明白白摆在下拉里 -->
            <el-option v-if="item.emptyLabel" :label="item.emptyLabel" value="" />
            <el-option
              v-for="row in refOptions(item.kind!)"
              :key="row.id"
              :label="row.name"
              :value="row.name"
            />
          </el-select>

          <el-date-picker
            v-else-if="item.kind === 'date'"
            v-model="draft[item.key!]"
            type="date"
            value-format="YYYY-MM-DD"
            size="small"
            style="width: 100%"
            placeholder="选择日期"
          />

          <el-input-number
            v-else-if="item.kind === 'amount'"
            :model-value="toNumber(draft[item.key!])"
            :min="0"
            :precision="2"
            :controls="false"
            size="small"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => (draft[item.key!] = v == null ? '' : String(v))"
          />

          <el-input
            v-else
            v-model="draft[item.key!]"
            size="small"
            :placeholder="item.placeholder || '可补充'"
          />
        </div>
      </div>

      <el-table
        v-if="preview.lines?.length"
        :data="preview.lines"
        size="small"
        class="aivp__table"
      >
        <el-table-column prop="account" label="科目" min-width="150" />
        <el-table-column prop="aux" label="辅助核算" min-width="110">
          <template #default="{ row }">{{ row.aux || '—' }}</template>
        </el-table-column>
        <el-table-column label="借方" width="110" align="right">
          <template #default="{ row }">{{ row.debit ? money(row.debit) : '' }}</template>
        </el-table-column>
        <el-table-column label="贷方" width="110" align="right">
          <template #default="{ row }">{{ row.credit ? money(row.credit) : '' }}</template>
        </el-table-column>
      </el-table>

      <!-- 借贷写反了不用重说，一键对调即可 -->
      <div v-if="canSwap" class="aivp__tools">
        <el-button link type="primary" size="small" @click="swapAccounts">↔ 借贷对调</el-button>
        <span class="aivp__tools-tip">方向不对时先对调，分录会立即重算</span>
      </div>

      <div v-if="preview.items?.length" class="aivp__items">
        <div v-for="(it, i) in preview.items" :key="it.id || i" class="aivp__item">
          <span class="aivp__item-no">{{ it.no || it.id }}</span>
          <span class="aivp__item-text">{{ it.summary || '' }}</span>
          <span class="aivp__item-amount">{{ it.amount ? money(it.amount) : '' }}</span>
        </div>
      </div>
    </template>

    <!-- 执行结果 -->
    <div v-if="result" class="aivp__result" :class="result.ok ? 'is-ok' : 'is-err'">
      <span>{{ result.text }}</span>
      <el-button v-if="resultLink" link type="primary" size="small" @click="goto">
        {{ resultLink.text }} →
      </el-button>
    </div>

    <div v-if="preview || ask" class="aivp__actions">
      <el-button size="small" @click="onCancel">放弃</el-button>
      <el-button
        v-if="preview"
        type="primary"
        size="small"
        :loading="loading"
        :disabled="!canCommit"
        @click="onCommit"
      >
        确认执行
      </el-button>
      <span v-if="preview && !canCommitPermission" class="aivp__tip">
        无「AI 指令确认入账」权限
      </span>
      <span v-else-if="preview && unresolved.length" class="aivp__tip">
        先补全 {{ unresolved.map((m) => m.label).join('、') }}
      </span>
      <span v-else-if="preview" class="aivp__tip is-ok">一律生成草稿，复核后才生效</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useBasicStore } from '@/stores/basic'
import { employeeApi } from '@/api'
import { aiVoiceApi, type Preview } from '../voice-api'
import AccountSelect from './AccountSelect.vue'

/**
 * 宿主 voice 插件透传的插槽属性。
 * transcript 是用户刚刚说的/打的那句话，两条输入路径都收口在 voice 的 onSubmitText。
 */
const props = defineProps<{
  transcript?: string
  visible?: boolean
  /** 宿主（voice）注入的关闭方法；未安装 voice 时为空，面板照常工作 */
  close?: () => void
}>()

/**
 * takeover：这句话归我处理，宿主不要再跑查询、也不要再念兜底话术。
 * settled：我处理完了（有卡片/没听懂/失败），宿主可以恢复发送按钮。
 */
const emit = defineEmits<{ takeover: []; settled: [] }>()

const userStore = useUserStore()
const basic = useBasicStore()
const router = useRouter()
/** 入口权限跟 voice 弹窗一致：能开弹窗就能用；确认入账单独一张权限 */
const allowed = computed(() => userStore.hasPermission('receipts:voice:use'))
const canCommitPermission = computed(() => userStore.hasPermission('receipts:voice:commit'))

const loading = ref(false)
const refreshing = ref(false)
const preview = ref<Preview | null>(null)
const actionTitle = ref('')
const ask = ref('')
const token = ref('')
const result = ref<{ ok: boolean; text: string } | null>(null)
/** 执行成功后的跳转入口：路由由服务端适配器给出，面板只负责渲染 */
const resultLink = ref<{ text: string; to: string } | null>(null)

/** 解析中状态：模型要几秒，界面不能一片空白 */
const thinking = ref(false)
const THINK_STAGES = [
  '正在理解这句话…',
  '正在匹配科目和往来单位…',
  '正在生成凭证草稿…',
]
const thinkStage = ref(THINK_STAGES[0])
let thinkTimer: ReturnType<typeof setInterval> | null = null

function startThinkingTicker(): void {
  stopThinkingTicker()
  thinkStage.value = THINK_STAGES[0]
  let index = 0
  thinkTimer = setInterval(() => {
    index = Math.min(index + 1, THINK_STAGES.length - 1)
    thinkStage.value = THINK_STAGES[index]
  }, 2500)
}

function stopThinkingTicker(): void {
  if (thinkTimer) clearInterval(thinkTimer)
  thinkTimer = null
}

/** 用户可改字段：key → 新值（提交时整体回传，服务端按白名单收口） */
const draft = reactive<Record<string, string>>({})

/** 字段元素：缺项 chip 点一下就跳到对应输入框 */
const fieldRefs = new Map<string, HTMLElement>()

function setFieldRef(key: string, el: any): void {
  // 包装 div 里放的是 Element Plus 组件，`$el` 才是真实 DOM
  const dom = el?.$el instanceof HTMLElement ? el.$el : el
  if (dom instanceof HTMLElement) fieldRefs.set(key, dom)
  else fieldRefs.delete(key)
}

function focusField(key: string): void {
  const el = fieldRefs.get(key)
  if (!el) return
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  const input = el.querySelector('input') as HTMLInputElement | null
  input?.focus()
}

const editableFields = computed(() =>
  (preview.value?.fields ?? []).filter((f) => f.editable && f.key),
)

const missingList = computed(() => preview.value?.missing ?? [])

/**
 * 还缺哪些字段：以本地草稿为准。
 *
 * 服务端给的 missing 是「预演那一刻」的快照，用户把部门选上后它不会自己消失，
 * 结果就是按钮一直灰着（用户看到的是「* 都填了还是不能提交」）。
 * 所以这里按「字段是否为空」实时判定，服务端只负责给字段和提示。
 */
const unresolved = computed(() =>
  missingList.value.filter((item) => {
    const target = editableFields.value.find((field) => field.key === item.field)
    if (!target) return true
    return !String(draft[item.field] ?? '').trim()
  }),
)

const ready = computed(() => unresolved.value.length === 0)

const canCommit = computed(
  () => !!token.value && !loading.value && canCommitPermission.value && ready.value,
)

/** 两个科目都在才能对调 */
const canSwap = computed(() => {
  const debit = editableFields.value.find((field) => field.key === 'debitAccount')
  const credit = editableFields.value.find((field) => field.key === 'creditAccount')
  return !!debit && !!credit
})

/** 摘要、备注这类长文本占整行，其余两列排布 */
function isWide(key: string): boolean {
  return key === 'summary' || key === 'remark'
}

function isUnresolved(key: string): boolean {
  return unresolved.value.some((item) => item.field === key)
}

function toNumber(value: unknown): number | undefined {
  const num = Number(String(value ?? '').replace(/[,，\s]/g, ''))
  return Number.isFinite(num) && num > 0 ? num : undefined
}

// ==================== 档案下拉数据 ====================
const employees = ref<Array<{ id: string; name: string }>>([])
let refsLoading = false

/** 按需加载：只有真正出现对应字段时才拉一次档案，之后复用 store 缓存 */
async function ensureRefs(fields: Array<{ kind?: string }>): Promise<void> {
  if (refsLoading) return
  const kinds = new Set(fields.map((f) => f.kind))
  const jobs: Promise<unknown>[] = []
  if (kinds.has('partner') && !basic.loaded.partners) jobs.push(basic.loadPartners())
  if (kinds.has('department') && !basic.loaded.departments) jobs.push(basic.loadDepartments())
  if (kinds.has('employee') && !employees.value.length) {
    jobs.push(employeeApi.options(true).then((rows: any[]) => (employees.value = rows ?? [])))
  }
  if (!jobs.length) return
  refsLoading = true
  try {
    await Promise.all(jobs)
  } catch {
    // 档案拉取失败不阻塞确认流程，用户仍可改科目/日期后执行
  } finally {
    refsLoading = false
  }
}

function refOptions(kind: string): Array<{ id: string; name: string }> {
  if (kind === 'partner') return basic.partners as any
  if (kind === 'department') return basic.departments as any
  if (kind === 'employee') return employees.value as any
  return []
}

function money(value: number): string {
  return Number(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * 本地意图预筛：只有像「写操作」的话才交给 AI，
 * 这样纯查询（看看这个月收支）仍然由 voice 原样回答，不会多一次模型调用。
 */
const QUERY_HINTS = /(多少|几笔|几张|怎么样|哪些|哪笔|看看|查一下|查询|统计|导出|余额|还剩|报表)/
const WRITE_RULES: Array<{ action: string; re: RegExp }> = [
  {
    action: 'voucher.create',
    // 「元」不是必需的：口语常说「收了客户 12000」「付了供应商 3000」，
    // 只要「收/付类动词 + 附近有金额」就按记账处理，问句会在这之后被排除
    re: /(记一笔|记一下|记个账|记账|挂账|挂一笔|走一笔|入账|入帐|做一笔|做张凭证|开一张|帮我记|帮忙记|垫付|收到|收了|收款|回款|付了|付给|付款|支付|花了|交了|报销).{0,15}\d/,
  },
  { action: 'voucher.modify', re: /(改|修改|调整).{0,10}(凭证|摘要|金额|科目|日期)/ },
  {
    action: 'voucher.approve',
    // 凭证号和「审核」两个词的先后顺序都不固定：「审核一下记-12」「把记-0015 审了」
    re: /(审核|审批|批一下|批了|审了|过账|通过).{0,10}(凭证|单据|记-|记\d)|(凭证|单据|记-|记\d).{0,10}(审核|审批|批一下|批了|审了|过账|通过)/,
  },
  {
    action: 'employee.create',
    re: /(新增员工|添加员工|新增人员|加个员工|加员工|加个人|加了个人|加一个人|新员工|入职|招一个|录一个|录用)/,
  },
  { action: 'payroll.run', re: /(发工资|发薪|算工资|做工资表|工资表|发.{0,8}工资)/ },
]

/** 命中则返回动作 id，否则返回空串 */
function detectAction(text: string): string {
  const t = text.replace(/\s/g, '')
  if (!t || t.length < 3) return ''
  const hint = WRITE_RULES.find((r) => r.re.test(t))
  if (!hint) return ''
  // 问句一律交回 voice 正常回答：「这个月花了多少钱」「工资发了吗」都不是写操作
  if (QUERY_HINTS.test(t) || /(吗|呢)$/.test(t) || /(有没有|是否|发了没|做了没|记了没)/.test(t)) return ''
  // 记账类必须带金额，否则交给 voice 正常回答
  if (hint.action === 'voucher.create' && !/\d/.test(t)) return ''
  return hint.action
}

/** 收集用户当前所有可编辑字段，提交与重新预演共用一份口径 */
function collectPatch(): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const item of preview.value?.fields ?? []) {
    if (!item.editable || !item.key) continue
    patch[item.key] = String(draft[item.key] ?? '').trim()
  }
  return patch
}

function reset(keepResult = false): void {
  stopThinkingTicker()
  thinking.value = false
  preview.value = null
  actionTitle.value = ''
  ask.value = ''
  token.value = ''
  lastPatch = ''
  for (const key of Object.keys(draft)) delete draft[key]
  if (!keepResult) {
    result.value = null
    resultLink.value = null
  }
}

/** 已处理过的原话（归一化后），避免同一条指令被重复解析：
 *  voice 查询返回后会用服务端转写回填 transcript，标点常与用户输入不同，
 *  所以必须去掉标点与空白再比对，否则成功提示会被二次解析清掉。 */
let lastHandled = ''

/** 归一化：只保留汉字、字母、数字，用于判断「是不是同一句话」 */
function norm(text: string): string {
  return String(text ?? '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
}

async function run(text: string): Promise<void> {
  if (!allowed.value) return
  const action = detectAction(text)
  if (!action) return
  const key = norm(text)
  if (!key || key === lastHandled) return
  lastHandled = key

  // 上一条没确认的指令先作废，避免用户以为改的是同一条
  const stale = token.value
  reset()
  if (stale) void aiVoiceApi.cancel(stale).catch(() => undefined)

  // 从这一刻起这句话归本面板处理：通知宿主停掉查询与语音播报，
  // 并立刻亮出「解析中」，不让用户对着空白以为卡死了
  thinking.value = true
  startThinkingTicker()
  emit('takeover')

  loading.value = true
  try {
    const outcome = await aiVoiceApi.plan(text, 'voice')
    if ((outcome as any).unsupported) {
      ask.value = (outcome as any).ask || '这个操作我还不会'
      return
    }
    const plan = outcome as any
    preview.value = plan.preview
    actionTitle.value = plan.title || plan.action
    token.value = plan.token
    ask.value = plan.ask || ''
    for (const item of plan.preview?.fields ?? []) {
      if (item.editable && item.key) draft[item.key] = item.value
    }
    lastPatch = JSON.stringify(collectPatch())
    void ensureRefs(plan.preview?.fields ?? [])
  } catch (err: any) {
    ask.value = err?.message || '没听懂这句话，换个说法试试'
  } finally {
    thinking.value = false
    stopThinkingTicker()
    loading.value = false
    // 交还控制权：宿主据此恢复发送按钮
    emit('settled')
  }
}

/**
 * 重新预演：用户改了字段就再算一遍。
 *
 * 只读接口，不换令牌、不写审计，所以可以随改随调。
 * 有了它，改科目后分录/辅助核算/缺项会立刻同步，
 * 而不是停留在「第一次解析」的旧结论上。
 */
async function refresh(): Promise<void> {
  if (!token.value || !preview.value) return
  const patch = collectPatch()
  lastPatch = JSON.stringify(patch)
  refreshing.value = true
  try {
    const res = await aiVoiceApi.preview(token.value, patch)
    applyPreview(res.preview)
  } catch {
    // 令牌过期或网络抖动：保留当前卡片，提交时会把明确原因写进结果区
  } finally {
    refreshing.value = false
  }
}

/**
 * 合并服务端新预演结果：
 * 值以本地草稿为准（不打断用户输入），只更新分录、缺项、警告这些推导结论。
 */
function applyPreview(next: Preview): void {
  preview.value = next
  const keys = new Set<string>()
  for (const item of next.fields) {
    if (!item.editable || !item.key) continue
    keys.add(item.key)
    if (!(item.key in draft)) draft[item.key] = item.value
  }
  for (const key of Object.keys(draft)) {
    if (!keys.has(key)) delete draft[key]
  }
  void ensureRefs(next.fields)
}

/** 借贷对调：写反了不用重说，点一下即可 */
function swapAccounts(): void {
  const debit = draft.debitAccount ?? ''
  draft.debitAccount = draft.creditAccount ?? ''
  draft.creditAccount = debit
}

// 字段变更 → 防抖重新预演（回填自身值不会触发，靠 lastPatch 比对）
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let lastPatch = ''

watch(
  draft,
  () => {
    if (!token.value || !preview.value || thinking.value) return
    const payload = JSON.stringify(collectPatch())
    if (payload === lastPatch) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => void refresh(), 350)
  },
  { deep: true },
)

async function onCommit(): Promise<void> {
  if (!token.value || !canCommit.value) return
  if (!canCommitPermission.value) {
    ElMessage.warning('没有「AI 指令确认入账」权限')
    return
  }
  loading.value = true
  /**
   * 整体回传所有可编辑字段，而不是只传「改过的」：
   * 推荐预填的科目、日期等即使没动过也必须带给服务端，
   * 否则 commit 侧重新推理时会把它自己丢掉（补填 = 空）。
   */
  const patch = collectPatch()
  try {
    const res = await aiVoiceApi.commit(token.value, patch)
    const payload = (res.result ?? {}) as Record<string, unknown>
    const message = String(payload.message ?? '已执行')
    result.value = { ok: true, text: res.idempotent ? `已处理过：${message}` : message }
    const route = typeof payload.route === 'string' ? payload.route : ''
    resultLink.value = route
      ? { text: String(payload.routeText ?? '查看明细'), to: route }
      : null
    // 成功后作废令牌，防止重复点击（服务端本身也幂等）
    token.value = ''
    preview.value = null
    lastPatch = ''
    for (const key of Object.keys(draft)) delete draft[key]
  } catch (err: any) {
    result.value = { ok: false, text: err?.message || '执行失败' }
    resultLink.value = null
    // 服务端可能发现了新问题（如科目不在档案），把卡片拉回最新状态
    void refresh()
  } finally {
    loading.value = false
  }
}

/** 跳转到适配器给出的页面：先请宿主关闭弹窗，否则跳过去后面还压着一层 */
function goto(): void {
  if (!resultLink.value) return
  const to = resultLink.value.to
  resultLink.value = null
  props.close?.()
  void router.push(to)
}

async function onCancel(): Promise<void> {
  const stale = token.value
  reset()
  // 放弃后允许用户把同一句话说第二遍（否则去重标记会挡住重试）
  lastHandled = ''
  if (!stale) return
  try {
    await aiVoiceApi.cancel(stale)
  } catch {
    /* 取消失败不打扰：令牌到期自然失效 */
  }
}

// 弹窗关闭或重开时清空，避免上次的卡片残留到新一轮对话
watch(
  () => props.visible,
  (v) => {
    if (!v) {
      lastHandled = ''
      reset()
    }
  },
)

// 宿主每提交一句话就会刷新 transcript，这里是唯一触发点
watch(
  () => props.transcript,
  (text) => {
    if (!props.visible || !text) return
    void run(String(text))
  },
)

onUnmounted(() => {
  stopThinkingTicker()
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<style scoped>
.aivp {
  margin: 12px 0 4px;
  padding: 12px 14px 10px;
  border: 1px solid #d6e4ff;
  border-radius: 10px;
  background: linear-gradient(180deg, #f7faff 0%, #fdfeff 60%);
}
.aivp__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.aivp__badge {
  padding: 1px 7px;
  border-radius: 4px;
  background: #15a06a;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.aivp__title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aivp__loading {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.aivp__thinking {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef4ff;
}
.aivp__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(64 158 255 / 30%);
  border-top-color: #409eff;
  border-radius: 50%;
  animation: aivp-spin 0.8s linear infinite;
}
.aivp__thinking-text {
  font-size: 13px;
  color: #1f2d3d;
}
.aivp__thinking-tip {
  margin-left: auto;
  font-size: 12px;
  color: #909399;
}
.aivp__summary {
  font-size: 14px;
  color: #1f2d3d;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #eef4ff;
  font-weight: 600;
}
.aivp__summary.is-pending {
  background: #fdf6ec;
  color: #b88230;
  font-weight: 400;
}
.aivp__ask {
  font-size: 13px;
  color: #b88230;
  padding: 4px 0;
}
.aivp__missing {
  margin-bottom: 8px;
  font-size: 12px;
  color: #c45656;
}
.aivp__missing-label {
  color: #909399;
}
.aivp__missing-item {
  margin-right: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #fef0f0;
  cursor: pointer;
}
.aivp__missing-item.is-done {
  background: #f0f9eb;
  color: #529b2e;
  cursor: default;
}
.aivp__warn {
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
  line-height: 18px;
}
.aivp__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin-bottom: 10px;
}
.aivp__field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.aivp__field.is-wide {
  grid-column: span 2;
}
.aivp__flabel {
  flex: 0 0 68px;
  font-size: 12px;
  color: #606266;
  text-align: right;
}
.aivp__req {
  color: #f56c6c;
  font-style: normal;
  margin-left: 2px;
}
.aivp__table {
  margin-bottom: 8px;
}
.aivp__tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.aivp__tools-tip {
  font-size: 12px;
  color: #909399;
}
.aivp__items {
  margin-bottom: 8px;
  font-size: 12px;
  color: #606266;
}
.aivp__item {
  display: flex;
  gap: 10px;
  padding: 2px 0;
}
.aivp__item-amount {
  margin-left: auto;
}
.aivp__result {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
}
.aivp__result.is-ok {
  background: #f0f9eb;
  color: #3f8f4b;
}
.aivp__result.is-err {
  background: #fef0f0;
  color: #c45656;
}
.aivp__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aivp__tip {
  font-size: 12px;
  color: #e6a23c;
}
.aivp__tip.is-ok {
  color: #909399;
}
@keyframes aivp-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
