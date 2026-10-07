<template>
  <div class="page">
    <div class="page-card">
      <el-alert
        v-if="isCopy"
        type="warning"
        show-icon
        :closable="false"
        class="copy-tip"
        title="当前为复制模式：已按原凭证预填分录，保存后会生成一张全新的凭证，不会修改原凭证。"
      />
      <!-- 凭证头 -->
      <div class="voucher-head">
        <el-form :inline="true" class="voucher-head__form">
          <el-form-item label="凭证字">
            <el-select v-model="form.word" style="width: 110px">
              <el-option v-for="w in VOUCHER_WORDS" :key="w.value" :label="`${w.label}（${w.value}）`" :value="w.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="凭证号">
            <el-tag type="info">{{ nextNoDisplay }}</el-tag>
          </el-form-item>

          <el-form-item label="凭证日期">
            <el-date-picker v-model="form.voucherDate" type="date" value-format="YYYY-MM-DD" style="width: 150px" />
          </el-form-item>

          <el-form-item label="附单据">
            <el-input-number v-model="form.attachments" :min="0" :max="999" style="width: 100px" controls-position="right" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 分录表 -->
      <table class="voucher-entries">
        <thead>
          <tr>
            <th style="width: 46px">行</th>
            <th style="width: 200px">摘要</th>
            <th style="width: 260px">会计科目</th>
            <th style="width: 150px">往来单位</th>
            <th style="width: 130px">部门</th>
            <th style="width: 130px">项目</th>
            <th style="width: 140px">借方金额</th>
            <th style="width: 140px">贷方金额</th>
            <th style="width: 56px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) in entries" :key="index">
            <td class="text-center">{{ index + 1 }}</td>
            <td>
              <div class="cell">
                <el-input v-model="entry.summary" placeholder="摘要" @blur="fillSummary(index)" />
              </div>
            </td>
            <td>
              <div class="cell">
                <el-select
                  v-model="entry.accountId"
                  filterable
                  placeholder="选择明细科目"
                  style="width: 100%"
                  @change="onAccountChange(entry)"
                >
                  <el-option
                    v-for="acc in accountOptions"
                    :key="acc.id"
                    :label="`${acc.code} ${acc.fullName}`"
                    :value="acc.id"
                  />
                </el-select>
              </div>
            </td>
            <td>
              <div class="cell">
                <el-select
                  v-if="auxOf(entry).includes('partner')"
                  v-model="entry.partnerId"
                  filterable
                  placeholder="必选"
                  style="width: 100%"
                >
                  <el-option v-for="p in basicStore.partners" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
                <span v-else class="text-muted">-</span>
              </div>
            </td>
            <td>
              <div class="cell">
                <el-select
                  v-if="auxOf(entry).includes('department')"
                  v-model="entry.departmentId"
                  filterable
                  placeholder="必选"
                  style="width: 100%"
                >
                  <el-option v-for="d in basicStore.departments" :key="d.id" :label="d.name" :value="d.id" />
                </el-select>
                <span v-else class="text-muted">-</span>
              </div>
            </td>
            <td>
              <div class="cell">
                <el-select
                  v-if="auxOf(entry).includes('project')"
                  v-model="entry.projectId"
                  filterable
                  placeholder="必选"
                  style="width: 100%"
                >
                  <el-option v-for="p in basicStore.projects" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
                <span v-else class="text-muted">-</span>
              </div>
            </td>
            <td>
              <div class="cell">
                <el-input-number
                  v-model="entry.debit"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  placeholder="0.00"
                  style="width: 100%"
                  @change="onAmountChange(entry)"
                />
              </div>
            </td>
            <td>
              <div class="cell">
                <el-input-number
                  v-model="entry.credit"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  placeholder="0.00"
                  style="width: 100%"
                  @change="onAmountChange(entry)"
                />
              </div>
            </td>
            <td class="text-center">
              <el-button link type="danger" :disabled="entries.length <= 2" @click="removeEntry(index)">
                删除
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="voucher-actions">
        <el-button @click="addEntry"><el-icon><Plus /></el-icon>增加分录</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="voucher-actions__spacer" />
        <span class="voucher-total">
          借方合计：<b class="amount amount--debit">{{ formatAmount(totalDebit) }}</b>
        </span>
        <span class="voucher-total">
          贷方合计：<b class="amount amount--credit">{{ formatAmount(totalCredit) }}</b>
        </span>
        <el-tag :type="balanced ? 'success' : 'danger'" size="default">
          {{ balanced ? '借贷平衡' : `差额 ${formatAmount(Math.abs(totalDebit - totalCredit))}` }}
        </el-tag>
      </div>

      <el-form label-width="70px" class="voucher-remark">
        <el-form-item label="凭证说明">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <div class="voucher-actions voucher-actions--bottom">
        <el-button v-permission="'voucher:create'" :loading="saving" @click="save(false)">
          保存草稿
        </el-button>
        <el-button
          v-permission="['voucher:create', 'voucher:approve']"
          type="primary"
          :loading="saving"
          @click="save(true)"
        >
          保存并审核
        </el-button>
        <el-button v-if="editId" @click="goBack">返回列表</el-button>
        <el-button v-if="isCopy" @click="goBack">取消复制</el-button>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="voucher-tip"
        title="记账规则：每张凭证至少两条分录，且借方合计必须等于贷方合计；科目若声明了辅助核算，对应的往来单位/部门/项目必须选择。"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { accountApi, voucherApi } from '@/api'
import { ok } from '@/composables/useList'
import { currentPeriod, formatAmount, VOUCHER_WORDS, toChineseAmount } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const basicStore = useBasicStore()

interface EntryRow {
  summary: string
  accountId: string
  partnerId: string
  departmentId: string
  projectId: string
  debit: number
  credit: number
}

const editId = ref<string>((route.query.id as string) ?? '')
/** 从其他凭证复制（copyFrom）：预填为一张全新凭证，不带 id */
const copyFrom = ref<string>((route.query.copyFrom as string) ?? '')
const isCopy = computed(() => !!copyFrom.value)

const form = reactive({
  word: '记',
  voucherDate: dayjs().format('YYYY-MM-DD'),
  attachments: 0,
  remark: '',
})

const entries = ref<EntryRow[]>([
  newRow(),
  newRow(),
])

const accountOptions = ref<any[]>([])
const saving = ref(false)
const nextNo = ref<number | null>(null)

function newRow(): EntryRow {
  return { summary: '', accountId: '', partnerId: '', departmentId: '', projectId: '', debit: 0, credit: 0 }
}

const nextNoDisplay = computed(() =>
  nextNo.value === null ? '—' : String(nextNo.value).padStart(4, '0'),
)

const totalDebit = computed(() => entries.value.reduce((acc, e) => acc + (e.debit || 0), 0))
const totalCredit = computed(() => entries.value.reduce((acc, e) => acc + (e.credit || 0), 0))
const balanced = computed(() =>
  Math.round(totalDebit.value * 100) === Math.round(totalCredit.value * 100),
)

/** 该行科目声明的辅助核算维度 */
function auxOf(entry: EntryRow): string[] {
  const acc = accountOptions.value.find((a) => a.id === entry.accountId)
  return acc?.auxiliaryTypes ?? []
}

function onAccountChange(entry: EntryRow) {
  entry.partnerId = ''
  entry.departmentId = ''
  entry.projectId = ''
  fillSummary(entries.value.indexOf(entry))
}

/** 借/贷互斥：填了一侧清空另一侧 */
function onAmountChange(entry: EntryRow) {
  if (entry.debit && entry.credit) {
    if (entry.debit! >= entry.credit!) entry.credit = 0
    else entry.debit = 0
  }
}

/** 自动带出摘要 */
function fillSummary(index: number) {
  const entry = entries.value[index]
  if (entry?.summary) return
  for (let i = 0; i < entries.value.length; i++) {
    const other = entries.value[i]
    if (other !== entry && other.summary) {
      entry.summary = other.summary
      break
    }
  }
}

function addEntry() {
  const last = entries.value[entries.value.length - 1]
  entries.value.push({ ...newRow(), summary: last?.summary ?? '' })
}

function removeEntry(index: number) {
  if (entries.value.length <= 2) {
    ElMessage.warning('记账凭证至少需要两条分录')
    return
  }
  entries.value.splice(index, 1)
}

function goBack() {
  router.push('/voucher/list')
}

function onReset() {
  form.word = '记'
  form.voucherDate = dayjs().format('YYYY-MM-DD')
  form.attachments = 0
  form.remark = ''
  entries.value = [newRow(), newRow()]
  loadNextNo()
}

/** 前端校验（后端会再次强校验） */
function validate(): boolean {
  const valid = entries.value.filter((e) => (e.debit || 0) !== 0 || (e.credit || 0) !== 0)
  if (valid.length < 2) {
    ElMessage.error('记账凭证至少需要两条有效分录（金额不为 0）')
    return false
  }
  for (let i = 0; i < entries.value.length; i++) {
    const e = entries.value[i]
    if ((e.debit || 0) === 0 && (e.credit || 0) === 0) continue
    if (!e.accountId) {
      ElMessage.error(`第 ${i + 1} 行：请选择会计科目`)
      return false
    }
    if (e.debit && e.credit) {
      ElMessage.error(`第 ${i + 1} 行：借方与贷方不能同时有金额`)
      return false
    }
    for (const t of auxOf(e)) {
      const value = t === 'partner' ? e.partnerId : t === 'department' ? e.departmentId : e.projectId
      if (!value) {
        const label = t === 'partner' ? '往来单位' : t === 'department' ? '部门' : '项目'
        ElMessage.error(`第 ${i + 1} 行：请指定${label}`)
        return false
      }
    }
  }
  if (!balanced.value) {
    ElMessage.error(
      `借贷不平衡：借方 ${formatAmount(totalDebit.value)}，贷方 ${formatAmount(totalCredit.value)}，差额 ${formatAmount(
        Math.abs(totalDebit.value - totalCredit.value),
      )}`,
    )
    return false
  }
  return true
}

async function loadNextNo() {
  try {
    const period = Number(dayjs(form.voucherDate).format('YYYYMM'))
    nextNo.value = await voucherApi.nextNo(period || currentPeriod(), form.word)
  } catch {
    nextNo.value = null
  }
}

async function save(approveNow: boolean) {
  if (!validate()) return

  saving.value = true
  try {
    const payload: any = {
      word: form.word,
      voucherDate: form.voucherDate,
      attachments: form.attachments,
      remark: form.remark || undefined,
      approveNow,
      entries: entries.value
        .filter((e) => (e.debit || 0) !== 0 || (e.credit || 0) !== 0)
        .map((e) => ({
          summary: e.summary || '',
          accountId: e.accountId,
          partnerId: e.partnerId || undefined,
          departmentId: e.departmentId || undefined,
          projectId: e.projectId || undefined,
          debit: e.debit || 0,
          credit: e.credit || 0,
        })),
    }

    if (editId.value) {
      await voucherApi.update(editId.value, payload)
    } else {
      await voucherApi.create(payload)
    }

    ok(
      approveNow
        ? `已保存并审核，金额大写：${toChineseAmount(totalDebit.value)}`
        : '草稿已保存，可在凭证列表中审核',
    )
    router.push('/voucher/list')
  } finally {
    saving.value = false
  }
}

async function loadVoucherDetail(id: string) {
  const detail = await voucherApi.detail(id)
  form.word = detail.word
  form.voucherDate = String(detail.voucherDate).slice(0, 10)
  form.attachments = detail.attachments ?? 0
  form.remark = detail.remark ?? ''
  entries.value = (detail.entries ?? []).map((e: any) => ({
    summary: e.summary ?? '',
    accountId: e.accountId,
    partnerId: e.partnerId ?? '',
    departmentId: e.departmentId ?? '',
    projectId: e.projectId ?? '',
    debit: Number(e.debit ?? 0),
    credit: Number(e.credit ?? 0),
  }))
  if (entries.value.length < 2) {
    while (entries.value.length < 2) entries.value.push(newRow())
  }
}

/** 复制凭证：按后端返回的草稿数据预填，作为新凭证保存 */
async function loadCopyPayload(id: string) {
  const payload = await voucherApi.copy(id)
  form.word = payload.word ?? '记'
  form.voucherDate = payload.voucherDate ?? dayjs().format('YYYY-MM-DD')
  form.attachments = 0
  form.remark = payload.remark ?? ''
  entries.value = (payload.entries ?? []).map((e: any) => ({
    summary: e.summary ?? '',
    accountId: e.accountId,
    partnerId: e.partnerId ?? '',
    departmentId: e.departmentId ?? '',
    projectId: e.projectId ?? '',
    debit: Number(e.debit ?? 0),
    credit: Number(e.credit ?? 0),
  }))
  if (entries.value.length < 2) {
    while (entries.value.length < 2) entries.value.push(newRow())
  }
  ElMessage.info('已按原凭证预填，确认无误后保存为新凭证')
}

onMounted(async () => {
  accountOptions.value = await accountApi.options()
  await basicStore.loadAll()
  if (editId.value) {
    await loadVoucherDetail(editId.value)
  } else if (copyFrom.value) {
    await loadCopyPayload(copyFrom.value)
    await loadNextNo()
  } else {
    await loadNextNo()
  }
})
</script>

<style scoped lang="scss">
.voucher-head {
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--app-border);
  margin-bottom: 10px;

  &__form {
    :deep(.el-form-item) {
      margin-bottom: 10px;
    }
  }
}

.voucher-entries {
  width: 100%;
  border-collapse: collapse;

  th {
    background: #f8fafc;
    font-size: 13px;
    color: #374151;
    padding: 8px 6px;
    border: 1px solid var(--app-border);
    text-align: center;
  }

  td {
    border: 1px solid var(--app-border);
    vertical-align: top;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    box-shadow: none;
  }
}

.text-muted {
  color: #9ca3af;
}

.voucher-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;

  &__spacer {
    flex: 1;
  }

  &--bottom {
    justify-content: center;
  }
}

.voucher-total {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.voucher-remark {
  margin-top: 14px;
}

.voucher-tip {
  margin-top: 12px;
}

.copy-tip {
  margin-bottom: 12px;
}
</style>