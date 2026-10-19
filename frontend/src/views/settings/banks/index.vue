<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索编码 / 名称 / 账号"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.type" placeholder="账户类型" clearable style="width: 130px" @change="search">
          <el-option label="现金" value="cash" />
          <el-option label="银行" value="bank" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'bank:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增账户
        </el-button>
      </div>

      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="资金账户需关联对应的会计科目（如库存现金 1001、银行存款 1002），现金银行单据才能据此自动生成凭证。"
        class="tip"
      />

      <el-table v-loading="loading" :data="list" empty-text="暂无数据">
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="name" label="账户名称" min-width="180" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === 'cash' ? 'warning' : 'primary'" size="small">
              {{ row.type === 'cash' ? '现金' : '银行' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="accountCode" label="关联科目" width="130">
          <template #default="{ row }">
            <span v-if="row.accountCode">{{ row.accountCode }} {{ accountName(row.accountCode) }}</span>
            <el-tag v-else type="danger" size="small">未关联</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bankName" label="开户行" min-width="150" show-overflow-tooltip />
        <el-table-column prop="accountNo" label="账号" width="160" />
        <el-table-column prop="accountName" label="开户名称" min-width="140" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'bank:update'" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button v-permission="'bank:delete'" link type="danger" @click="onRemove(row)">删除</el-button>
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
          @size-change="handleSize"
        />
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑资金账户' : '新增资金账户'"
      width="620px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="账户名称" prop="name">
          <el-input v-model="form.name" placeholder="如 基本存款账户" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="账户类型">
              <el-radio-group v-model="form.type">
                <el-radio value="cash">现金</el-radio>
                <el-radio value="bank">银行</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="关联科目">
              <el-select
                v-model="form.accountCode"
                placeholder="选择会计科目"
                filterable
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="acc in cashAccountOptions"
                  :key="acc.id"
                  :label="`${acc.code} ${acc.name}`"
                  :value="acc.code"
                />
              </el-select>
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
              <el-input v-model="form.accountNo" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开户名称">
              <el-input v-model="form.accountName" />
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
import { accountApi, bankApi } from '@/api'
import { confirmDelete, ok, usePagedList } from '@/composables/useList'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
  fetcher: (params) => bankApi.list(params),
  defaultParams: { page: 1, pageSize: 20, keyword: '', type: '' },
})

/** 现金/银行类科目选项 */
const cashAccountOptions = ref<any[]>([])

function accountName(code: string): string {
  return cashAccountOptions.value.find((a) => a.code === code)?.name ?? ''
}

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const initialForm = {
  id: '',
  name: '',
  type: 'bank' as string,
  accountCode: '',
  bankName: '',
  accountNo: '',
  accountName: '',
  remark: '',
  status: 1,
}
const form = reactive({ ...initialForm })

const rules: FormRules = {
  name: [{ required: true, message: '请输入账户名称', trigger: 'blur' }],
}

async function loadAccountOptions() {
  const all = await accountApi.options()
  cashAccountOptions.value = all.filter((a: any) => a.isCash || a.isBank)
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
    accountCode: row.accountCode ?? '',
    bankName: row.bankName ?? '',
    accountNo: row.accountNo ?? '',
    accountName: row.accountName ?? '',
    remark: row.remark ?? '',
    status: row.status,
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`资金账户「${row.name}」`))) return
  try {
    await bankApi.remove(row.id)
    ok('删除成功')
    load()
    basicStore.refresh('banks')
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
    if (form.id) await bankApi.update(form.id, payload)
    else await bankApi.create(payload)
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
    basicStore.refresh('banks')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadAccountOptions()
  load()
})
</script>

<style scoped lang="scss">
.tip {
  margin-bottom: 12px;
}
</style>