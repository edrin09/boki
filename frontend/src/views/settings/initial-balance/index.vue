<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <span class="label">会计年度</span>
        <el-date-picker
          v-model="fiscalYear"
          type="year"
          value-format="YYYY"
          placeholder="选择年度"
          style="width: 120px"
          @change="load"
        />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <div class="page-toolbar__spacer" />
        <el-tag v-if="checkResult" :type="checkResult.balanced ? 'success' : 'danger'" size="default">
          试算：借方 {{ formatAmount(checkResult.debitTotal) }} / 贷方
          {{ formatAmount(checkResult.creditTotal) }}
          <template v-if="!checkResult.balanced"> · 差额 {{ formatAmount(checkResult.difference) }}</template>
          <template v-else> · 已平衡</template>
        </el-tag>
        <el-button v-permission="'initial-balance:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>录入期初
        </el-button>
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'initial-balance:delete'" type="danger" plain @click="onClearYear">
          <el-icon><Delete /></el-icon>清空年度
        </el-button>
      </div>

      <el-table v-loading="loading" :data="rows" empty-text="该年度暂无期初余额">
        <el-table-column prop="accountCode" label="科目编码" width="110" />
        <el-table-column prop="accountFullName" label="科目名称" min-width="220" />
        <el-table-column prop="partnerName" label="往来单位" width="150">
          <template #default="{ row }">{{ row.partnerName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" width="120">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="projectName" label="项目" width="120">
          <template #default="{ row }">{{ row.projectName || '-' }}</template>
        </el-table-column>
        <el-table-column label="方向" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'debit' ? 'success' : 'warning'" size="small">
              {{ row.direction === 'debit' ? '借' : '贷' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="期初金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount" :class="row.direction === 'debit' ? 'amount--debit' : 'amount--credit'">
              {{ formatAmount(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              v-permission="'initial-balance:delete'"
              link
              type="danger"
              @click="onRemove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="录入期初余额" width="640px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="会计年度" prop="fiscalYear">
              <el-date-picker
                v-model="form.fiscalYear"
                type="year"
                value-format="YYYY"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="余额方向" prop="direction">
              <el-radio-group v-model="form.direction">
                <el-radio value="debit">借方</el-radio>
                <el-radio value="credit">贷方</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="会计科目" prop="accountId">
          <el-select
            v-model="form.accountId"
            filterable
            placeholder="选择明细科目"
            style="width: 100%"
            @change="onAccountChange"
          >
            <el-option
              v-for="acc in accountOptions"
              :key="acc.id"
              :label="`${acc.code} ${acc.fullName}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>

        <template v-if="currentAccount">
          <el-form-item v-if="auxTypes.includes('partner')" label="往来单位" prop="partnerId">
            <el-select v-model="form.partnerId" filterable placeholder="必选" style="width: 100%">
              <el-option
                v-for="p in basicStore.partners"
                :key="p.id"
                :label="`${p.code} ${p.name}`"
                :value="p.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="auxTypes.includes('department')" label="部门" prop="departmentId">
            <el-select v-model="form.departmentId" filterable placeholder="必选" style="width: 100%">
              <el-option
                v-for="d in basicStore.departments"
                :key="d.id"
                :label="`${d.code} ${d.name}`"
                :value="d.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="auxTypes.includes('project')" label="项目" prop="projectId">
            <el-select v-model="form.projectId" filterable placeholder="必选" style="width: 100%">
              <el-option
                v-for="p in basicStore.projects"
                :key="p.id"
                :label="`${p.code} ${p.name}`"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item label="期初金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" style="width: 220px" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Download, Delete } from '@element-plus/icons-vue'
import { accountApi, initialBalanceApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { exportExcel } from '@/utils/export'
import { formatAmount } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const fiscalYear = ref(String(new Date().getFullYear()))
const loading = ref(false)
const saving = ref(false)
const rows = ref<any[]>([])
const checkResult = ref<any>(null)
const accountOptions = ref<any[]>([])

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  fiscalYear: String(new Date().getFullYear()),
  accountId: '',
  partnerId: '',
  departmentId: '',
  projectId: '',
  direction: 'debit' as 'debit' | 'credit',
  amount: 0,
  remark: '',
}
const form = reactive({ ...initialForm })

const currentAccount = computed(() =>
  accountOptions.value.find((a) => a.id === form.accountId),
)
const auxTypes = computed<string[]>(() => currentAccount.value?.auxiliaryTypes ?? [])

const rules: FormRules = {
  fiscalYear: [{ required: true, message: '请选择会计年度', trigger: 'change' }],
  accountId: [{ required: true, message: '请选择会计科目', trigger: 'change' }],
  amount: [{ required: true, message: '请输入期初金额', trigger: 'blur' }],
}

async function load() {
  loading.value = true
  try {
    const year = Number(fiscalYear.value)
    rows.value = await initialBalanceApi.list(year)
    checkResult.value = await initialBalanceApi.check(year)
  } finally {
    loading.value = false
  }
}

function onAccountChange() {
  form.partnerId = ''
  form.departmentId = ''
  form.projectId = ''
}

watch(dialogVisible, (v) => {
  if (v) form.fiscalYear = fiscalYear.value
})

function onCreate() {
  Object.assign(form, { ...initialForm, fiscalYear: fiscalYear.value })
  dialogVisible.value = true
}

async function onRemove(row: any) {
  if (!(await confirmDelete('该条期初余额'))) return
  try {
    await initialBalanceApi.remove(row.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onClearYear() {
  if (!(await confirmDelete(`${fiscalYear.value} 年度的全部期初余额`))) return
  try {
    await initialBalanceApi.clearYear(Number(fiscalYear.value))
    ok('已清空')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.amount <= 0) {
    ElMessage.warning('期初金额必须大于 0')
    return
  }
  saving.value = true
  try {
    await initialBalanceApi.save({
      fiscalYear: Number(form.fiscalYear),
      accountId: form.accountId,
      partnerId: form.partnerId || undefined,
      departmentId: form.departmentId || undefined,
      projectId: form.projectId || undefined,
      direction: form.direction,
      amount: form.amount,
      remark: form.remark || undefined,
    })
    ok('保存成功')
    dialogVisible.value = false
    fiscalYear.value = form.fiscalYear
    load()
  } finally {
    saving.value = false
  }
}

function onExport() {
  exportExcel({
    filename: `期初余额_${fiscalYear.value}.xlsx`,
    sheetName: '期初余额',
    title: `${fiscalYear.value} 年度期初余额表`,
    columns: [
      { title: '科目编码', prop: 'accountCode', width: 12 },
      { title: '科目名称', prop: 'accountFullName', width: 26 },
      { title: '往来单位', prop: 'partnerName', width: 18 },
      { title: '部门', prop: 'departmentName', width: 14 },
      { title: '项目', prop: 'projectName', width: 14 },
      { title: '方向', prop: 'direction', width: 8, format: (r) => (r.direction === 'debit' ? '借' : '贷') },
      { title: '金额', prop: 'amount', width: 16, amount: true },
      { title: '备注', prop: 'remark', width: 20 },
    ],
    rows: rows.value,
    summary: {
      __label: '合计',
      amount: rows.value
        .filter((r) => r.direction === 'debit')
        .reduce((acc, r) => acc + r.amount, 0),
    },
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  accountOptions.value = await accountApi.options()
  await basicStore.loadAll()
  load()
})
</script>

<style scoped lang="scss">
.label {
  font-size: 13px;
  color: var(--app-text-secondary);
}
</style>