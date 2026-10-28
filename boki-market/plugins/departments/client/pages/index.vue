<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索部门编码 / 名称"
          clearable
          style="width: 220px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="keyword = ''; load()">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'department:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增部门
        </el-button>
      </div>

      <el-table v-loading="loading" :data="tree" row-key="id" default-expand-all
        :tree-props="{ children: 'children' }" empty-text="暂无部门">
        <el-table-column prop="code" label="部门编码" width="140" />
        <el-table-column prop="name" label="部门名称" min-width="200" />
        <el-table-column prop="manager" label="负责人" width="130" />
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'department:create'" link type="success" @click="onCreateChild(row)">
              新增下级
            </el-button>
            <el-button v-permission="'department:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'department:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑部门' : '新增部门'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-tree-select
            v-model="form.parentId"
            :data="selectData"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则为顶级部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="form.manager" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="禁用"
          />
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
import { Plus, Search } from '@element-plus/icons-vue'
import { departmentApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const tree = ref<any[]>([])
const selectData = ref<any[]>([])

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  parentId: null as string | null,
  manager: '',
  remark: '',
  status: 1,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
}

async function load() {
  loading.value = true
  try {
    tree.value = await departmentApi.tree({ keyword: keyword.value || undefined })
    selectData.value = JSON.parse(JSON.stringify(tree.value))
    basicStore.refresh('departments')
  } finally {
    loading.value = false
  }
}

function openCreate(parentId: string | null = null) {
  Object.assign(form, { ...initialForm, parentId })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onCreate() {
  openCreate()
}

function onCreateChild(row: any) {
  openCreate(row.id)
}

function onEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    manager: row.manager ?? '',
    remark: row.remark ?? '',
    status: row.status,
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`部门「${row.name}」`))) return
  try {
    await departmentApi.remove(row.id)
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
    const payload: any = { ...form }
    delete payload.id
    if (form.id) await departmentApi.update(form.id, payload)
    else await departmentApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>