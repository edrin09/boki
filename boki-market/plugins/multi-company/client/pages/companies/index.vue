<template>
  <div class="page">
    <el-alert type="info" :closable="false" show-icon class="mb12">
      <template #title>
        一个账号可以管理多家记账公司，各公司的凭证、账簿、报表与基础资料<b>完全隔离</b>。
        顶部切换公司后即可进入对应账套记账。
      </template>
    </el-alert>

    <div class="page-card">
      <div class="page-toolbar">
        <span class="page-title">记账公司</span>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'company:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新建公司
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无记账公司">
        <el-table-column prop="code" label="编码" width="140" />
        <el-table-column prop="name" label="公司名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="taxNo" label="纳税人识别号" min-width="180">
          <template #default="{ row }">{{ row.taxNo || '-' }}</template>
        </el-table-column>
        <el-table-column label="我的身份" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isOwner ? 'warning' : 'info'" size="small">
              {{ row.isOwner ? '所有者' : '可记账' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onSwitch(row)">进入记账</el-button>
            <el-button v-permission="'company:member'" link type="primary" @click="onMembers(row)">
              成员
            </el-button>
            <el-button v-permission="'company:update'" link type="primary" @click="onEdit(row)">
              编辑
            </el-button>
            <el-button
              v-permission="'company:delete'"
              link
              type="danger"
              :disabled="row.id === userStore.companyId"
              @click="onRemove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建 / 编辑公司 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑公司' : '新建记账公司'" width="680px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="公司名称" prop="name">
          <el-input v-model="form.name" maxlength="100" placeholder="营业执照上的公司全称" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="纳税人识别号" prop="taxNo">
              <el-input v-model="form.taxNo" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="法定代表人" prop="legalPerson">
              <el-input v-model="form.legalPerson" maxlength="50" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属行业" prop="industry">
              <el-input v-model="form.industry" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="会计年度起始月" prop="fiscalStartMonth">
              <el-select v-model="form.fiscalStartMonth">
                <el-option
                  v-for="m in 12"
                  :key="m"
                  :label="`${m} 月`"
                  :value="m"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="纳税人类型" prop="taxpayerType">
              <el-select v-model="form.taxpayerType" placeholder="请选择纳税人类型" @change="onTaxpayerTypeChange">
                <el-option label="小规模纳税人" value="small_scale" />
                <el-option label="一般纳税人" value="general" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item v-if="form.taxpayerType === 'small_scale'" label="征收率(%)" prop="vatRate">
              <el-input-number v-model="form.vatRate" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
            </el-form-item>
            <el-form-item v-else label="增值税申报">
              <span class="form-hint">一般纳税人按分税率归集后申报</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="申报周期" prop="taxDeclareCycle">
              <el-select v-model="form.taxDeclareCycle">
                <el-option label="按月申报" value="month" />
                <el-option label="按季申报" value="quarter" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12" />
        </el-row>

        <el-form-item label="注册地址" prop="address">
          <el-input v-model="form.address" maxlength="200" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开户行" prop="bankName">
              <el-input v-model="form.bankName" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="银行账号" prop="bankAccount">
              <el-input v-model="form.bankAccount" maxlength="50" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item v-if="!form.id" label="初始化科目">
          <el-checkbox v-model="form.copyAccountsFromCurrent">
            复制当前公司的会计科目表（取消则使用系统标准科目）
          </el-checkbox>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 成员授权 -->
    <el-dialog v-model="memberVisible" title="公司成员授权" width="720px" destroy-on-close>
      <el-alert type="info" :closable="false" class="mb12">
        <template #title>
          勾选后可登录并进入「{{ current?.name }}」记账。角色为全局权限，
          在所有公司中一致生效。
        </template>
      </el-alert>

      <div v-loading="memberLoading">
        <el-table :data="allUsers" height="360" empty-text="暂无用户">
          <el-table-column label="选择" width="60" align="center">
            <template #default="{ row }">
              <el-checkbox
                :model-value="selectedUserIds.includes(row.id)"
                :disabled="memberRows.find((m) => m.userId === row.id)?.isOwner"
                @change="(v: any) => toggleUser(row.id, v)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="username" label="账号" width="130" />
          <el-table-column prop="nickname" label="姓名" width="130" />
          <el-table-column label="角色" min-width="200">
            <template #default="{ row }">
              <el-select
                v-model="roleSelection[row.id]"
                placeholder="保持不变"
                clearable
                multiple
                size="small"
                style="width: 100%"
              >
                <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="身份" width="90" align="center">
            <template #default="{ row }">
              <el-tag
                v-if="memberRows.find((m) => m.userId === row.id)?.isOwner"
                type="warning"
                size="small"
              >
                所有者
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="memberVisible = false">取消</el-button>
        <el-button type="primary" :loading="memberSaving" @click="onSaveMembers">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { type FormInstance, type FormRules, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { companyApi, roleApi, userApi } from '@/api'
import { emptyForm, ok } from '@/composables/useList'
import { useBasicStore } from '@/stores/basic'
import { useUserStore } from '@/stores/user'

interface CompanyRow {
  id: string
  code: string
  name: string
  taxNo?: string | null
  taxpayerType?: string
  vatRate?: number | null
  taxDeclareCycle?: string
  status: number
  isOwner: boolean
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const basicStore = useBasicStore()

const list = ref<CompanyRow[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const memberVisible = ref(false)
const memberLoading = ref(false)
const memberSaving = ref(false)
const current = ref<CompanyRow | null>(null)
const memberRows = ref<any[]>([])
const allUsers = ref<any[]>([])
const selectedUserIds = ref<string[]>([])
const roles = ref<any[]>([])
/** userId → 选中的角色；为空表示不改该用户角色 */
const roleSelection = reactive<Record<string, string[]>>({})

const emptyCompanyForm = {
  id: '' as string,
  name: '',
  taxNo: '',
  taxpayerType: '' as string,
  vatRate: 3 as number | null,
  taxDeclareCycle: 'month' as string,
  legalPerson: '',
  industry: '',
  address: '',
  bankName: '',
  bankAccount: '',
  fiscalStartMonth: 1,
  remark: '',
  copyAccountsFromCurrent: true,
}

const form = reactive(emptyForm(emptyCompanyForm))

/** 切到一般纳税人时征收率不再适用 */
function onTaxpayerTypeChange(val: unknown) {
  if (val === 'general') form.vatRate = 0
  else if (!form.vatRate) form.vatRate = 3
}

const rules: FormRules = {
  name: [
    { required: true, message: '请输入公司名称', trigger: 'blur' },
    { max: 100, message: '公司名称过长', trigger: 'blur' },
  ],
  taxpayerType: [{ required: true, message: '请选择纳税人类型', trigger: 'change' }],
  taxNo: [
    {
      // 新建必填：税号用于比对票面购销方、判定进项/销项方向，缺失则票据无法自动生成凭证
      validator: (_rule, value, callback) => {
        if (!form.id && !String(value ?? '').trim()) {
          callback(new Error('请输入纳税人识别号'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function load() {
  loading.value = true
  try {
    list.value = (await companyApi.mine()) as CompanyRow[]
  } finally {
    loading.value = false
  }
}

function onCreate() {
  Object.assign(form, emptyForm(emptyCompanyForm))
  form.copyAccountsFromCurrent = true
  dialogVisible.value = true
}

function onEdit(row: CompanyRow) {
  Object.assign(form, emptyForm(emptyCompanyForm), {
    id: row.id,
    name: row.name,
    taxNo: row.taxNo ?? '',
    taxpayerType: row.taxpayerType ?? 'small_scale',
    vatRate: row.vatRate ?? (row.taxpayerType === 'general' ? 0 : 3),
    taxDeclareCycle: row.taxDeclareCycle ?? 'month',
  })
  dialogVisible.value = true
}

async function onSave() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload: Record<string, any> = {
      name: form.name,
      taxNo: form.taxNo || undefined,
      taxpayerType: form.taxpayerType,
      vatRate: form.vatRate ?? undefined,
      taxDeclareCycle: form.taxDeclareCycle,
      legalPerson: form.legalPerson || undefined,
      industry: form.industry || undefined,
      address: form.address || undefined,
      bankName: form.bankName || undefined,
      bankAccount: form.bankAccount || undefined,
      fiscalStartMonth: form.fiscalStartMonth,
      remark: form.remark || undefined,
    }
    if (form.id) {
      await companyApi.update(form.id, payload)
    } else {
      await companyApi.create({ ...payload, copyAccountsFromCurrent: form.copyAccountsFromCurrent })
    }
    ok(form.id ? '公司信息已更新' : '公司已创建，标准会计科目已初始化')
    dialogVisible.value = false
    await load()
    // 名称/税号变化会影响票据方向判定，刷新当前档案
    await userStore.fetchProfile()
  } finally {
    saving.value = false
  }
}

async function onRemove(row: CompanyRow) {
  try {
    await ElMessageBox.confirm(
      '确定删除记账公司「' + row.name + '」吗？仅当该公司没有任何业务数据时才能删除。',
      '提示',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  let force = false
  try {
    await companyApi.remove(row.id)
  } catch (err: any) {
    // 后端提示已有账务数据 → 二次确认后强制删除；其余错误已由请求层统一提示
    const msg = (err as { message?: string } | null)?.message ?? ''
    if (!/已有账务数据|请先清理后再删除/.test(msg)) return
    try {
      await ElMessageBox.confirm(
        '「' + row.name + '」已有账务数据（凭证/分录/票据等）。\n强制删除将连同该公司的全部业务数据一并清除，此操作不可恢复。确定继续吗？',
        '确认强制删除',
        {
          type: 'error',
          confirmButtonText: '强制删除并清空数据',
          cancelButtonText: '取消',
          distinguishCancelAndClose: true,
        },
      )
    } catch {
      return
    }
    force = true
  }

  await companyApi.remove(row.id, force)
  ok(force ? '公司及全部业务数据已删除（不可恢复）' : '公司已删除')
  await load()
}

async function onSwitch(row: CompanyRow) {
  if (row.id === userStore.companyId) return
  await userStore.switchCompany(row.id)
  basicStore.reset()
  window.location.href = '/'
}

function toggleUser(userId: string, checked: any) {
  const set = new Set(selectedUserIds.value)
  if (checked) set.add(userId)
  else set.delete(userId)
  selectedUserIds.value = Array.from(set)
}

async function loadUsers() {
  memberLoading.value = true
  try {
    allUsers.value = (await userApi.options()) as any[]
    roles.value = (await roleApi.options()) as any[]
  } finally {
    memberLoading.value = false
  }
}

async function onMembers(row: CompanyRow) {
  current.value = row
  selectedUserIds.value = []
  memberVisible.value = true
  memberLoading.value = true
  try {
    const detail = await companyApi.detail(row.id)
    memberRows.value = detail.members ?? []
    selectedUserIds.value = memberRows.value.map((m: any) => m.userId)
    // 默认展示既有角色，用户改动后才会提交
    for (const m of memberRows.value) {
      roleSelection[m.userId] = [...(m.roleIds ?? [])]
    }
    await loadUsers()
  } finally {
    memberLoading.value = false
  }
}

async function onSaveMembers() {
  if (!current.value) return
  memberSaving.value = true
  try {
    // 仅提交角色发生变化的成员，避免误改其他用户的全局角色
    for (const member of memberRows.value) {
      const next = [...(roleSelection[member.userId] ?? [])].sort()
      const prev = [...(member.roleIds ?? [])].sort()
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) continue
      if (next.length === 0) {
        ElMessage.warning(`「${member.nickname}」不能清空角色，请先在用户管理中分配`)
        continue
      }
      await userApi.assignRoles(member.userId, next)
    }
    await companyApi.setMembers(current.value.id, { userIds: selectedUserIds.value })
    ok('成员授权已保存')
    memberVisible.value = false
    await load()
  } finally {
    memberSaving.value = false
  }
}

onMounted(load)

// 支持从顶部切换器「新建公司」直接打开对话框
watch(
  () => route.query.create,
  (v) => {
    if (v === '1') {
      onCreate()
      router.replace({ path: route.path })
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.mb12 {
  margin-bottom: 12px;
}

.role-tag {
  margin-right: 4px;
}

.form-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 32px;
}
</style>
