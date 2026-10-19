<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-select v-model="query.matchType" placeholder="匹配方式" clearable style="width: 130px" @change="search">
          <el-option label="关键词" value="keyword" />
          <el-option label="交易对手" value="partner" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="规则名称 / 匹配值 / 科目" clearable style="width: 220px"
          @keyup.enter="search" @clear="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'receipt:rule'" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新增规则
        </el-button>
      </div>

      <el-alert type="info" :closable="false" show-icon class="mb12"
        title="关键词规则匹配票据全文；交易对手规则匹配销售方/购买方名称。按优先级从高到低取第一条兼容规则，确认入账时若改过科目会自动回写新规则。" />

      <el-table v-loading="loading" :data="list" empty-text="暂无归类规则">
        <el-table-column prop="ruleName" label="规则名称" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.learned" size="small" type="warning" class="mr4">自动学习</el-tag>{{ row.ruleName }}
          </template>
        </el-table-column>
        <el-table-column label="匹配方式" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.matchType === 'keyword' ? 'primary' : 'success'">
              {{ row.matchType === 'keyword' ? '关键词' : '交易对手' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="matchValue" label="匹配值" min-width="180" show-overflow-tooltip />
        <el-table-column label="模板" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.kind === 'income' ? 'success' : 'warning'">
              {{ row.kind === 'income' ? '收入' : '费用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标科目" width="160">
          <template #default="{ row }">
            <span>{{ row.targetAccountCode }}</span>
            <span class="text-muted">{{ accountName(row.targetAccountCode) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" align="center" />
        <el-table-column prop="hitCount" label="命中次数" width="90" align="center" sortable />
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" @change="onToggle(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'receipt:rule'" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-permission="'receipt:rule'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="handleSize" />
      </div>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑归类规则' : '新增归类规则'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="规则名称" prop="ruleName">
          <el-input v-model="form.ruleName" maxlength="100" placeholder="例如：快递费、XX商贸有限公司" />
        </el-form-item>
        <el-form-item label="匹配方式" prop="matchType">
          <el-radio-group v-model="form.matchType">
            <el-radio value="keyword">关键词（匹配全文）</el-radio>
            <el-radio value="partner">交易对手名称</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="匹配值" prop="matchValue">
          <el-input v-model="form.matchValue" maxlength="300" placeholder="关键词支持逗号分隔多个，如：快递,顺丰,物流" />
        </el-form-item>
        <el-form-item label="凭证模板" prop="kind">
          <el-radio-group v-model="form.kind">
            <el-radio value="expense">费用（进项/费用票据）</el-radio>
            <el-radio value="income">收入（销项发票）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="目标科目" prop="targetAccountCode">
          <el-select v-model="form.targetAccountCode" filterable style="width: 100%" placeholder="选择明细科目（叶子科目）">
            <el-option v-for="acc in accountOptions" :key="acc.code" :label="`${acc.code} ${acc.fullName}`" :value="acc.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="999" />
          <span class="text-muted form-tip">数字越大越优先命中</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { type FormInstance, type FormRules } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { accountApi, classifyRuleApi } from '@/api'
import { usePagedList, ok, confirmDelete } from '@/composables/useList'

const { list, total, loading, query, load, search, handleSize, reset: onReset } = usePagedList({
  fetcher: (params) => classifyRuleApi.list(params),
  defaultParams: { page: 1, pageSize: 20 },
})

const accountOptions = ref<any[]>([])
const accountNameMap = ref<Record<string, string>>({})

function accountName(code: string): string {
  return accountNameMap.value[code] ?? ''
}

async function loadAccounts() {
  try {
    accountOptions.value = await accountApi.options()
    accountNameMap.value = Object.fromEntries(accountOptions.value.map((a) => [a.code, a.name ?? '']))
  } catch {
    accountOptions.value = []
  }
}

// ============ 新增 / 编辑 ============
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const empty = () => ({
  ruleName: '',
  matchType: 'keyword' as 'keyword' | 'partner',
  matchValue: '',
  kind: 'expense' as 'expense' | 'income',
  targetAccountCode: '',
  priority: 0,
  enabled: 1 as number,
})
const form = reactive(empty())
const editId = ref('')

const rules: FormRules = {
  ruleName: [{ required: true, message: '请填写规则名称', trigger: 'blur' }],
  matchType: [{ required: true, message: '请选择匹配方式', trigger: 'change' }],
  matchValue: [{ required: true, message: '请填写匹配值', trigger: 'blur' }],
  kind: [{ required: true, message: '请选择凭证模板', trigger: 'change' }],
  targetAccountCode: [{ required: true, message: '请选择目标科目', trigger: 'change' }],
}

function openCreate() {
  isEdit.value = false
  editId.value = ''
  Object.assign(form, empty())
  dialogVisible.value = true
}

function openEdit(row: any) {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, {
    ruleName: row.ruleName,
    matchType: row.matchType,
    matchValue: row.matchValue,
    kind: row.kind,
    targetAccountCode: row.targetAccountCode,
    priority: row.priority,
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function onSave() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = { ...form }
    if (isEdit.value) {
      await classifyRuleApi.update(editId.value, payload)
      ok('规则已更新')
    } else {
      await classifyRuleApi.create(payload)
      ok('规则已创建')
    }
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

// ============ 启停 ============
async function onToggle(row: any) {
  try {
    await classifyRuleApi.toggle(row.id, row.enabled)
    ok(row.enabled === 1 ? '规则已启用' : '规则已停用')
  } catch {
    row.enabled = row.enabled === 1 ? 0 : 1
  }
}

// ============ 删除 ============
async function onRemove(row: any) {
  if (!(await confirmDelete(`归类规则「${row.ruleName}」`))) return
  await classifyRuleApi.remove(row.id)
  ok('规则已删除')
  await load()
}

onMounted(loadAccounts)
</script>

<style scoped>
.mb12 {
  margin-bottom: 12px;
}
.mr4 {
  margin-right: 4px;
}
.form-tip {
  margin-left: 8px;
  font-size: 12px;
}
.text-muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 6px;
}
</style>
