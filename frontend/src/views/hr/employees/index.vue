<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input v-model="query.keyword" placeholder="搜索工号 / 姓名 / 手机 / 岗位" clearable style="width: 240px"
          @keyup.enter="search" @clear="search" />
        <el-select v-model="query.departmentId" placeholder="所属部门" clearable filterable style="width: 160px"
          @change="search">
          <el-option v-for="d in departmentOptions" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="在职状态" clearable style="width: 120px" @change="search">
          <el-option label="在职" :value="1" />
          <el-option label="离职" :value="0" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button @click="onExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button v-permission="'hr:employee:create'" @click="batchVisible = true">
          <el-icon><Files /></el-icon>批量建档
        </el-button>
        <el-button v-permission="'hr:employee:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增员工
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无员工">
        <el-table-column prop="code" label="工号" width="130" />
        <el-table-column prop="name" label="姓名" width="160" />
        <el-table-column label="性别" width="70" align="center">
          <template #default="{ row }">{{ genderLabel(row.gender) }}</template>
        </el-table-column>
        <el-table-column prop="departmentName" label="部门" width="130">
          <template #default="{ row }">{{ row.departmentName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="position" label="岗位" min-width="140">
          <template #default="{ row }">{{ row.position || '-' }}</template>
        </el-table-column>
        <el-table-column label="基本工资" width="140" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatAmount(row.baseSalary) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="hireDate" label="入职日期" width="115">
          <template #default="{ row }">{{ row.hireDate || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '在职' : '离职' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'hr:employee:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'hr:employee:update'" link type="warning" @click="onToggle(row)">
              {{ row.status === 1 ? '办理离职' : '恢复在职' }}
            </el-button>
            <el-button v-permission="'hr:employee:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="page-pagination">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next"
          @current-change="load" @size-change="reset" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑员工' : '新增员工'" width="700px" destroy-on-close>
      <div v-if="!form.id" class="ocr-section">
        <div class="ocr-section__title">证件一键录入</div>
        <OcrUpload target="employee" @apply="onOcrApply" />
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="性别">
              <el-select v-model="form.gender" style="width: 100%">
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
                <el-option label="未知" value="unknown" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="form.departmentId" clearable filterable placeholder="可选" style="width: 100%">
                <el-option v-for="d in departmentOptions" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位">
              <el-input v-model="form.position" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="基本工资">
              <el-input-number v-model="form.baseSalary" :min="0" :precision="2" :step="500" style="width: 100%" />
              <div class="form-tip">用于「工资表」按员工生成工资单时的默认值</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期">
              <el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="身份证号">
          <el-input v-model="form.idCard" placeholder="18 位身份证号" />
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

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开户行">
              <el-input v-model="form.bankName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工资卡号">
              <el-input v-model="form.bankAccount" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item v-if="form.id" label="离职日期">
              <el-date-picker v-model="form.leaveDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="在职状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0"
                active-text="在职" inactive-text="离职" />
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

    <BatchDialog v-model="batchVisible" target="employee" @success="onBatchSuccess" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Files, Plus, Search, Download } from '@element-plus/icons-vue'
import { departmentApi, employeeApi, type ExtractResult } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import OcrUpload from '@/components/OcrUpload/index.vue'
import BatchDialog from '@/components/OcrUpload/BatchDialog.vue'

const GENDERS: Record<string, string> = { male: '男', female: '女', unknown: '未知' }
const genderLabel = (g: string) => GENDERS[g] ?? '未知'

const query = reactive<Record<string, any>>({
  page: 1, pageSize: 20, keyword: '', status: '', departmentId: '',
})
const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => employeeApi.list(params),
})

const departmentOptions = ref<any[]>([])
const dialogVisible = ref(false)
const batchVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  gender: 'unknown' as string,
  departmentId: '',
  position: '',
  idCard: '',
  phone: '',
  email: '',
  hireDate: '',
  leaveDate: '',
  baseSalary: 0,
  bankName: '',
  bankAccount: '',
  status: 1,
  remark: '',
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
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
    gender: row.gender ?? 'unknown',
    departmentId: row.departmentId ?? '',
    position: row.position ?? '',
    idCard: row.idCard ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    hireDate: row.hireDate ?? '',
    leaveDate: row.leaveDate ?? '',
    baseSalary: Number(row.baseSalary ?? 0),
    bankName: row.bankName ?? '',
    bankAccount: row.bankAccount ?? '',
    status: row.status,
    remark: row.remark ?? '',
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
}

async function onToggle(row: any) {
  const next = row.status === 1 ? 0 : 1
  try {
    await employeeApi.update(row.id, { status: next })
    ok(next === 1 ? '已恢复在职' : '已办理离职')
    load()
  } catch {
    /* 错误已提示 */
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`员工「${row.name}」`))) return
  try {
    await employeeApi.remove(row.id)
    ok('删除成功')
    load()
  } catch {
    /* 错误已提示（如有报销单/工资记录） */
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload: any = { ...form }
    for (const k of ['departmentId', 'position', 'idCard', 'phone', 'email', 'hireDate', 'leaveDate', 'bankName', 'bankAccount', 'remark']) {
      if (!payload[k]) delete payload[k]
    }
    if (form.id) await employeeApi.update(form.id, payload)
    else await employeeApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

function onExport() {
  exportExcel({
    filename: `员工花名册_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '员工',
    columns: [
      { title: '工号', prop: 'code', width: 10 },
      { title: '姓名', prop: 'name', width: 12 },
      { title: '性别', prop: 'gender', width: 8, format: (r) => genderLabel(r.gender) },
      { title: '部门', prop: 'departmentName', width: 16 },
      { title: '岗位', prop: 'position', width: 16 },
      { title: '基本工资', prop: 'baseSalary', width: 14, amount: true },
      { title: '身份证号', prop: 'idCard', width: 20 },
      { title: '手机号', prop: 'phone', width: 15 },
      { title: '入职日期', prop: 'hireDate', width: 12 },
      { title: '状态', prop: 'status', width: 8, format: (r) => (r.status === 1 ? '在职' : '离职') },
    ],
    rows: list.value as any[],
  })
  ElMessage.success('导出成功')
}

onMounted(async () => {
  departmentOptions.value = await departmentApi.options()
  load()
})
</script>

<style scoped lang="scss">
.form-tip {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

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