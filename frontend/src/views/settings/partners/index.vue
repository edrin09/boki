<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索编码 / 名称 / 联系人"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.type" placeholder="类型" clearable style="width: 130px" @change="search">
          <el-option label="客户" value="customer" />
          <el-option label="供应商" value="supplier" />
          <el-option label="客户兼供应商" value="both" />
        </el-select>
        <el-button type="primary" @click="search">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'partner:create'" @click="batchVisible = true">
          <el-icon><Files /></el-icon>批量建档
        </el-button>
        <el-button v-permission="'partner:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增往来单位
        </el-button>
        <el-button @click="onExport">
          <el-icon><Download /></el-icon>导出
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无数据">
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="taxNo" label="纳税人识别号" min-width="200" show-overflow-tooltip />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'partner:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'partner:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
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
      :title="form.id ? '编辑往来单位' : '新增往来单位'"
      width="680px"
      destroy-on-close
    >
      <div v-if="!form.id" class="ocr-section">
        <div class="ocr-section__title">证件一键录入</div>
        <OcrUpload target="partner" @apply="onOcrApply" />
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="往来单位全称" />
        </el-form-item>

        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="customer">客户</el-radio>
            <el-radio value="supplier">供应商</el-radio>
            <el-radio value="both">客户兼供应商</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="form.contact" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="form.phone" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纳税人识别号" prop="taxNo">
              <el-input v-model="form.taxNo" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="地址">
          <el-input v-model="form.address" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="法定代表人">
              <el-input v-model="form.legalPerson" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开户行">
              <el-input v-model="form.bankName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="银行账号">
              <el-input v-model="form.bankAccount" />
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

    <BatchDialog v-model="batchVisible" target="partner" @success="onBatchSuccess" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Files, Plus, Search, Download } from '@element-plus/icons-vue'
import { partnerApi, type ExtractResult } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { exportExcel } from '@/utils/export'
import { useBasicStore } from '@/stores/basic'
import OcrUpload from '@/components/OcrUpload/index.vue'
import BatchDialog from '@/components/OcrUpload/BatchDialog.vue'

const basicStore = useBasicStore()

const TYPE_LABELS: Record<string, string> = {
  customer: '客户',
  supplier: '供应商',
  both: '客户兼供应商',
}
const TYPE_TAGS: Record<string, any> = { customer: 'success', supplier: 'warning', both: 'info' }
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t
const typeTag = (t: string) => TYPE_TAGS[t] ?? 'info'

const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, keyword: '', type: '' })
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => partnerApi.list(params),
})

const dialogVisible = ref(false)
const batchVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  type: 'customer' as string,
  contact: '',
  phone: '',
  email: '',
  address: '',
  taxNo: '',
  legalPerson: '',
  bankName: '',
  bankAccount: '',
  remark: '',
  status: 1,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  taxNo: [{ required: true, message: '请输入纳税人识别号', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
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
    type: row.type,
    contact: row.contact ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    taxNo: row.taxNo ?? '',
    legalPerson: row.legalPerson ?? '',
    bankName: row.bankName ?? '',
    bankAccount: row.bankAccount ?? '',
    remark: row.remark ?? '',
    status: row.status,
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

/** 证件识别结果 → 表单字段（只覆盖勾选且识别到的字段，其余保留手动录入） */
function onOcrApply(payload: { values: Record<string, any>; result: ExtractResult }) {
  Object.assign(form, payload.values)
  ElMessage.success(`已填入 ${Object.keys(payload.values).length} 个字段，请核对后保存`)
  nextTick(() => formRef.value?.clearValidate())
}

function onBatchSuccess() {
  load()
  basicStore.refresh('partners')
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`往来单位「${row.name}」`))) return
  try {
    await partnerApi.remove(row.id)
    ok('删除成功')
    load()
    basicStore.refresh('partners')
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
    if (form.id) await partnerApi.update(form.id, payload)
    else await partnerApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
    basicStore.refresh('partners')
  } finally {
    saving.value = false
  }
}

function onExport() {
  exportExcel({
    filename: `往来单位_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '往来单位',
    columns: [
      { title: '名称', prop: 'name', width: 26 },
      { title: '类型', prop: 'type', width: 14, format: (r) => typeLabel(r.type) },
      { title: '纳税人识别号', prop: 'taxNo', width: 24 },
      { title: '联系人', prop: 'contact', width: 12 },
      { title: '电话', prop: 'phone', width: 16 },
      { title: '状态', prop: 'status', width: 8, format: (r) => (r.status === 1 ? '启用' : '禁用') },
    ],
    rows: list.value as any[],
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.ocr-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}

.ocr-section__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary, #606266);
}
</style>