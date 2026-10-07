<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索项目编码 / 名称"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'project:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增项目
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无项目">
        <el-table-column prop="code" label="项目编码" width="140" />
        <el-table-column prop="name" label="项目名称" min-width="200" />
        <el-table-column prop="manager" label="负责人" width="130" />
        <el-table-column prop="startDate" label="开始日期" width="120" />
        <el-table-column prop="endDate" label="结束日期" width="120" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'project:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'project:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reset"
        />
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑项目' : '新增项目'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.manager" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开始日期">
              <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="结束日期">
              <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch
                v-model="form.status"
                :active-value="1"
                :inactive-value="0"
                active-text="启用"
                inactive-text="禁用"
              />
            </el-form-item>
          </el-col>
        </el-row>

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
import { projectApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, keyword: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => projectApi.list(params),
})

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  manager: '',
  startDate: '',
  endDate: '',
  remark: '',
  status: 1,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
}

function onCreate() {
  Object.assign(form, { ...initialForm })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    manager: row.manager ?? '',
    startDate: row.startDate ?? '',
    endDate: row.endDate ?? '',
    remark: row.remark ?? '',
    status: row.status,
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`项目「${row.name}」`))) return
  try {
    await projectApi.remove(row.id)
    ok('删除成功')
    load()
    basicStore.refresh('projects')
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
    if (form.id) await projectApi.update(form.id, payload)
    else await projectApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
    basicStore.refresh('projects')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>