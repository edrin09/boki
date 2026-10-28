<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <strong>权限列表</strong>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'permission:create'" type="primary" size="small" @click="onCreate()">
          <el-icon><Plus /></el-icon>新增
        </el-button>
      </div>

      <el-table v-loading="loading" :data="tree" row-key="id" default-expand-all
        :tree-props="{ children: 'children' }" empty-text="暂无权限">
        <el-table-column prop="code" label="权限标识" width="240" />
        <el-table-column prop="name" label="权限名称" width="200" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'menu' ? 'primary' : 'info'" size="small">
              {{ row.type === 'menu' ? '菜单' : '操作' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="130" />
        <el-table-column prop="path" label="路由地址" min-width="200" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'permission:create'" link type="success" @click="onCreate(row)">新增子级</el-button>
            <el-button v-permission="'permission:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'permission:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑权限' : '新增权限'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="权限标识" prop="code">
          <el-input v-model="form.code" placeholder="如 voucher:create" />
        </el-form-item>
        <el-form-item label="权限名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属模块">
              <el-input v-model="form.module" placeholder="如 voucher" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="类型">
              <el-radio-group v-model="form.type">
                <el-radio value="menu">菜单</el-radio>
                <el-radio value="action">操作</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="上级权限">
          <el-tree-select
            v-model="form.parentId"
            :data="selectData"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则为顶级"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="form.type === 'menu'" label="路由地址">
          <el-input v-model="form.path" placeholder="如 /voucher/list" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" controls-position="right" />
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
import { type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { permissionApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'

const loading = ref(false)
const saving = ref(false)
const tree = ref<any[]>([])
const selectData = ref<any[]>([])

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  code: '',
  name: '',
  module: '',
  type: 'action' as string,
  parentId: null as string | null,
  path: '',
  sort: 0,
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  code: [{ required: true, message: '请输入权限标识', trigger: 'blur' }],
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
}

async function load() {
  loading.value = true
  try {
    tree.value = await permissionApi.tree()
    selectData.value = JSON.parse(JSON.stringify(tree.value))
  } finally {
    loading.value = false
  }
}

function onCreate(parent?: any) {
  Object.assign(form, { ...initialForm })
  if (parent) {
    form.parentId = parent.id
    form.type = 'action'
    if (!form.module) form.module = parent.module
  }
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    module: row.module ?? '',
    type: row.type,
    parentId: row.parentId,
    path: row.path ?? '',
    sort: row.sort ?? 0,
    remark: row.remark ?? '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`权限「${row.name}」`))) return
  try {
    await permissionApi.remove(row.id)
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
    const payload: any = {
      code: form.code,
      name: form.name,
      module: form.module || undefined,
      type: form.type,
      path: form.path || undefined,
      sort: form.sort,
      remark: form.remark || undefined,
    }
    if (form.id) {
      await permissionApi.update(form.id, payload)
    } else {
      await permissionApi.create({ ...payload, parentId: form.parentId ?? undefined })
    }
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>