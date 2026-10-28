<template>
  <div class="page">
    <el-row :gutter="12">
      <el-col :xs="24" :md="9">
        <div class="page-card">
          <div class="page-toolbar">
            <strong>角色列表</strong>
            <div class="page-toolbar__spacer" />
            <el-button v-permission="'role:create'" type="primary" size="small" @click="onCreate">
              <el-icon><Plus /></el-icon>新增
            </el-button>
          </div>
          <el-table v-loading="loading" :data="roles" highlight-current-row size="small" @current-change="onSelect">
            <el-table-column prop="name" label="角色名称" min-width="110" />
            <el-table-column label="权限数" width="80" align="center" prop="permissionCount" />
            <el-table-column label="类型" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.isSystem ? 'info' : 'success'" size="small">
                  {{ row.isSystem ? '内置' : '自定义' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <el-col :xs="24" :md="15">
        <div class="page-card">
          <template v-if="current">
            <div class="page-toolbar">
              <div>
                <strong>{{ current.name }}</strong>
                <span class="code">{{ current.code }}</span>
              </div>
              <div class="page-toolbar__spacer" />
              <el-button v-permission="'role:update'" size="small" @click="onEdit">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button
                v-permission="'role:assign-permission'"
                size="small"
                type="primary"
                :disabled="current.isSystem && current.code === 'admin'"
                @click="onSavePermissions"
              >
                <el-icon><Check /></el-icon>保存权限
              </el-button>
              <el-button
                v-permission="'role:delete'"
                size="small"
                type="danger"
                :disabled="current.isSystem"
                @click="onRemove"
              >
                删除
              </el-button>
            </div>

            <el-alert v-if="current.description" type="info" :closable="false" :title="current.description" class="mb12" />

            <el-alert
              v-if="current.isSystem && current.code === 'admin'"
              type="warning"
              :closable="false"
              title="超级管理员固定拥有系统全部权限，无需分配权限。"
              class="mb12"
            />

            <el-tree
              ref="treeRef"
              v-loading="loadingTree"
              :data="permissionTree"
              show-checkbox
              node-key="id"
              :props="{ label: 'name', children: 'children' }"
              :default-checked-keys="current.permissionIds"
            >
              <template #default="{ data }">
                <span>
                  {{ data.name }}
                  <el-tag v-if="data.type === 'menu'" size="small" type="info">菜单</el-tag>
                  <span class="code">{{ data.code }}</span>
                </span>
              </template>
            </el-tree>
          </template>

          <el-empty v-else description="请从左侧选择一个角色" />
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑角色' : '新增角色'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="角色标识" prop="code">
          <el-input v-model="form.code" :disabled="!!form.id" placeholder="英文标识，如 auditor" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" controls-position="right" />
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
import { type FormInstance, type FormRules, type TreeInstance } from 'element-plus'
import { Plus, Edit, Check } from '@element-plus/icons-vue'
import { permissionApi, roleApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'

const roles = ref<any[]>([])
const permissionTree = ref<any[]>([])
const current = ref<any>(null)
const loading = ref(false)
const loadingTree = ref(false)
const treeRef = ref<TreeInstance>()

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = { id: '', code: '', name: '', description: '', sort: 0 }
const form = reactive({ ...initialForm })

const rules: FormRules = {
  code: [{ required: true, message: '请输入角色标识', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

async function loadRoles() {
  loading.value = true
  try {
    roles.value = await roleApi.list()
    if (current.value) {
      const found = roles.value.find((r) => r.id === current.value.id)
      current.value = found ?? null
    } else if (roles.value.length) {
      onSelect(roles.value[0])
    }
  } finally {
    loading.value = false
  }
}

async function loadPermissionTree() {
  loadingTree.value = true
  try {
    permissionTree.value = await permissionApi.tree()
  } finally {
    loadingTree.value = false
  }
}

function onSelect(row: any) {
  current.value = row
  nextTick(() => {
    treeRef.value?.setCheckedKeys(row?.permissionIds ?? [])
  })
}

function onCreate() {
  Object.assign(form, { ...initialForm })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onEdit() {
  if (!current.value) return
  Object.assign(form, {
    id: current.value.id,
    code: current.value.code,
    name: current.value.name,
    description: current.value.description ?? '',
    sort: current.value.sort ?? 0,
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onRemove() {
  if (!current.value) return
  if (!(await confirmDelete(`角色「${current.value.name}」`))) return
  try {
    await roleApi.remove(current.value.id)
    current.value = null
    ok('删除成功')
    loadRoles()
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
      await roleApi.update(form.id, {
        name: form.name,
        description: form.description || undefined,
        sort: form.sort,
      })
    } else {
      await roleApi.create({ code: form.code, name: form.name, description: form.description || undefined, sort: form.sort })
    }
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    loadRoles()
  } finally {
    saving.value = false
  }
}

/** 收集半选 + 全选的节点 ID */
function collectCheckedIds(): string[] {
  if (!treeRef.value) return []
  const checked: string[] = treeRef.value.getCheckedKeys(false) as string[]
  const halfChecked: string[] = treeRef.value.getHalfCheckedKeys() as string[]
  return Array.from(new Set([...checked, ...halfChecked]))
}

async function onSavePermissions() {
  if (!current.value) return
  const permissionIds = collectCheckedIds()
  try {
    await roleApi.assignPermissions(current.value.id, permissionIds)
    ok('权限已保存')
    loadRoles()
  } catch {
    /* 错误已提示 */
  }
}

onMounted(async () => {
  await loadPermissionTree()
  loadRoles()
})
</script>

<style scoped lang="scss">
.code {
  margin-left: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.mb12 {
  margin-bottom: 12px;
}
</style>