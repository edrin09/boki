<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input v-model="query.keyword" placeholder="搜索账号 / 姓名 / 手机" clearable style="width: 220px"
          @keyup.enter="search" @clear="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'user:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增用户
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无用户">
        <el-table-column prop="username" label="登录账号" width="140" />
        <el-table-column prop="nickname" label="姓名" width="140" />
        <el-table-column label="角色" min-width="200">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r.id" size="small" class="role-tag">{{ r.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属公司" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="(row.companyNames ?? []).length">
              <el-tag v-for="n in row.companyNames" :key="n" size="small" class="role-tag">{{ n }}</el-tag>
            </template>
            <span v-else class="cm-empty">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.email || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最后登录" width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastLoginAt) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'user:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'user:reset-password'" link type="warning" @click="onResetPassword(row)">
              重置密码
            </el-button>
            <el-button
              v-permission="'user:update'"
              link
              :type="row.status === 1 ? 'info' : 'success'"
              @click="onToggleStatus(row)"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button v-permission="'user:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="handleSize"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑用户' : '新增用户'" width="600px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="登录账号" prop="username">
              <el-input v-model="form.username" :disabled="!!form.id" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="nickname">
              <el-input v-model="form.nickname" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item v-if="!form.id" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>

        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="form.roleIds" multiple placeholder="选择角色" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="记账公司" prop="companyIds">
          <el-checkbox-group v-model="form.companyIds" class="company-access">
            <el-checkbox v-for="c in companyOptions" :key="c.id" :value="c.id" :disabled="c.disabled">
              {{ c.name }}
            </el-checkbox>
          </el-checkbox-group>
          <div class="cm-tip">勾选后该用户可登录并进入对应记账公司；灰色的为公司所有者/其他管理员维护的公司，仅展示不可修改。</div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" />
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
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { companyApi, roleApi, userApi, type CompanyBrief } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatDateTime } from '@/utils/format'

const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  fetcher: (params) => userApi.list(params),
  defaultParams: { page: 1, pageSize: 20, keyword: '' },
})

const roles = ref<any[]>([])
const companyOptions = ref<{ id: string; name: string; disabled?: boolean }[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  username: '',
  nickname: '',
  password: '123456',
  email: '',
  phone: '',
  status: 1,
  roleIds: [] as string[],
  companyIds: [] as string[],
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  username: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [{ required: true, min: 6, message: '密码至少 6 位', trigger: 'blur' }],
  roleIds: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
}

async function loadRoles() {
  roles.value = await roleApi.options()
}

/** 可勾选的记账公司列表；编辑时合并用户已有但当前管理员不可见的公司（只读） */
async function loadCompanyOptions(extra: { id: string; name: string }[] = []) {
  try {
    const mine: CompanyBrief[] = await companyApi.mine()
    const seen = new Set(mine.map((c) => c.id))
    const orphan = extra.filter((c) => !seen.has(c.id))
    companyOptions.value = [
      ...mine.map((c) => ({ id: c.id, name: c.name, disabled: false })),
      ...orphan.map((c) => ({ id: c.id, name: c.name, disabled: true })),
    ]
  } catch {
    /* 接口异常时保留当前列表 */
  }
}

function onCreate() {
  Object.assign(form, { ...initialForm })
  loadCompanyOptions()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onEdit(row: any) {
  // 合并用户已有、但当前管理员不可见的公司（只读展示，避免保存时被误移除）
  const extra = (row.companyIds ?? []).map((id: string, i: number) => ({
    id,
    name: (row.companyNames ?? [])[i] ?? id,
  }))
  await loadCompanyOptions(extra)
  Object.assign(form, {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    password: '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    status: row.status,
    roleIds: [...(row.roleIds ?? [])],
    companyIds: [...(row.companyIds ?? [])],
    remark: row.remark ?? '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onToggleStatus(row: any) {
  const next = row.status === 1 ? 0 : 1
  try {
    await userApi.updateStatus(row.id, next)
    ok(next === 1 ? '已启用' : '已禁用')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onResetPassword(row: any) {
  try {
    const res = await ElMessageBox.prompt(
      `为用户「${row.username}」设置新密码（至少 6 位）`,
      '重置密码',
      {
        inputValue: '123456',
        inputType: 'password',
        inputValidator: (v: string) => (v && v.length >= 6 ? true : '密码至少 6 位'),
      },
    )
    await userApi.resetPassword(row.id, res.value)
    ok('密码已重置')
  } catch {
    /* 取消或失败 */
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`用户「${row.username}」`))) return
  try {
    await userApi.remove(row.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (form.id) {
      await userApi.update(form.id, {
        nickname: form.nickname,
        email: form.email || undefined,
        phone: form.phone || undefined,
        status: form.status,
        roleIds: form.roleIds,
        companyIds: form.companyIds,
        remark: form.remark || undefined,
      })
    } else {
      await userApi.create({
        username: form.username,
        nickname: form.nickname,
        password: form.password,
        email: form.email || undefined,
        phone: form.phone || undefined,
        status: form.status,
        roleIds: form.roleIds,
        companyIds: form.companyIds,
        remark: form.remark || undefined,
      })
    }
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadRoles()
  await loadCompanyOptions()
  load()
})
</script>

<style scoped lang="scss">
.role-tag {
  margin-right: 4px;
}
.company-access {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  width: 100%;
  max-height: 160px;
  overflow-y: auto;
}
.cm-tip {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-placeholder);
}
.cm-empty {
  color: var(--el-text-color-placeholder);
}
</style>