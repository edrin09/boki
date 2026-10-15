<template>
  <div class="page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="项目档案" name="list">
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
      </el-tab-pane>

      <el-tab-pane label="合同台账" name="ledger">
        <div class="page-card">
          <div class="page-toolbar">
            <span class="ledger-tip">
              数据口径：预收账款 2203 / 应收账款 1122 / 已确认收入 6001（按凭证项目辅助核算聚合）
            </span>
            <div class="page-toolbar__spacer" />
            <el-button @click="loadLedger"><el-icon><Refresh /></el-icon>刷新</el-button>
          </div>
          <el-table v-loading="ledgerLoading" :data="ledger" empty-text="暂无项目">
            <el-table-column prop="code" label="项目编码" width="110" />
            <el-table-column prop="name" label="项目名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="partnerName" label="客户" min-width="140" show-overflow-tooltip />
            <el-table-column prop="contractNo" label="合同编号" width="130" show-overflow-tooltip />
            <el-table-column label="合同金额" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.contractAmount) }}</template>
            </el-table-column>
            <el-table-column label="预收(未开票已收)" width="150" align="right">
              <template #default="{ row }">
                <span class="amt amt--advance">{{ formatAmount(row.advanceReceived) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="应收(已开票未收)" width="150" align="right">
              <template #default="{ row }">
                <span class="amt amt--receivable">{{ formatAmount(row.receivable) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="已确认收入" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.recognizedRevenue) }}</template>
            </el-table-column>
            <el-table-column label="尾款(合同额-上述)" width="150" align="right">
              <template #default="{ row }">
                <span class="amt" :class="row.restAmount > 0 ? 'amt--rest' : ''">
                  {{ formatAmount(row.restAmount) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑项目' : '新增项目'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="导入合同">
          <el-upload
            :show-file-list="false"
            :auto-upload="false"
            accept=".pdf"
            :on-change="onContractFile"
          >
            <el-button :loading="parsing" type="warning" plain>
              <el-icon><Upload /></el-icon>{{ parsing ? '识别中…' : '导入合同PDF自动识别' }}
            </el-button>
          </el-upload>
          <span class="parse-tip">识别结果仅作预填，请核对后保存</span>
        </el-form-item>

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

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="合同编号">
              <el-input v-model="form.contractNo" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同金额">
              <el-input-number
                v-model="form.contractAmount"
                :min="0"
                :precision="2"
                :controls="false"
                placeholder="选填"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="客户">
          <el-select v-model="form.partnerId" clearable filterable placeholder="选择往来单位（客户）" style="width: 100%">
            <el-option v-for="pt in basicStore.partners" :key="pt.id" :label="pt.name" :value="pt.id" />
          </el-select>
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
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { projectApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { formatAmount } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const parsing = ref(false)

/** 导入合同 PDF：识别 → 预填表单（客户按甲方/乙方匹配往来单位） */
async function onContractFile(file: UploadFile) {
  const raw = file.raw as File | undefined
  if (!raw) return
  parsing.value = true
  try {
    const r = await projectApi.parseContract(raw)
    if (r.projectName && !form.name) form.name = r.projectName
    if (r.contractNo) form.contractNo = r.contractNo
    if (r.amount) form.contractAmount = r.amount
    // 客户：识别出的甲乙方与往来单位名称匹配
    if (r.partyA || r.partyB) {
      const hit = basicStore.partners.find(
        (pt) => pt.name === r.partyA || pt.name === r.partyB,
      )
      if (hit) {
        form.partnerId = hit.id
      } else {
        ok(
          `已识别甲方「${r.partyA ?? '-'}」、乙方「${r.partyB ?? '-'}」，请在客户下拉中手动选择`,
        )
      }
    } else {
      ok('已识别部分字段，请核对补全')
    }
    nextTick(() => formRef.value?.clearValidate())
  } catch {
    /* 错误已提示 */
  } finally {
    parsing.value = false
  }
}

const activeTab = ref('list')
const ledger = ref<any[]>([])
const ledgerLoading = ref(false)

async function loadLedger() {
  ledgerLoading.value = true
  try {
    ledger.value = await projectApi.ledger()
  } finally {
    ledgerLoading.value = false
  }
}

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
  contractNo: '',
  contractAmount: undefined as number | undefined,
  partnerId: '',
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
    contractNo: row.contractNo ?? '',
    contractAmount: row.contractAmount != null ? Number(row.contractAmount) : undefined,
    partnerId: row.partnerId ?? '',
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

onMounted(() => {
  load()
  loadLedger()
  basicStore.loadPartners()
})
</script>

<style scoped>
.ledger-tip { font-size: 12px; color: #909399; }
.parse-tip { margin-left: 10px; font-size: 12px; color: #909399; }
.amt { font-weight: 600; }
.amt--advance { color: #e6a23c; }
.amt--receivable { color: #f56c6c; }
.amt--rest { color: #e6a23c; }
</style>