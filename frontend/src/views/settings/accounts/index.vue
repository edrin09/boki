<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索科目编码 / 名称"
          clearable
          style="width: 220px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-select v-model="category" placeholder="科目类别" clearable style="width: 130px" @change="load">
          <el-option v-for="(label, key) in CATEGORY_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-select v-model="status" placeholder="状态" clearable style="width: 110px" @change="load">
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-button type="primary" @click="load">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="onReset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button v-permission="'account:create'" type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>新增科目
        </el-button>
        <el-button @click="toggleExpandAll">{{ expandAll ? '全部收起' : '全部展开' }}</el-button>
        <el-button @click="onExport">
          <el-icon><Download /></el-icon>导出
        </el-button>
      </div>

      <el-table
        :key="tableKey"
        v-loading="loading"
        :data="tree"
        row-key="id"
        :default-expand-all="expandAll"
        :tree-props="{ children: 'children' }"
        empty-text="暂无科目"
      >
        <el-table-column prop="code" label="科目编码" width="110" />
        <el-table-column prop="name" label="科目名称" min-width="200" />
        <el-table-column label="科目类别" width="110">
          <template #default="{ row }">
            <el-tag :type="CATEGORY_TAG_TYPE[row.category]" size="small">
              {{ CATEGORY_LABELS[row.category] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额方向" width="90">
          <template #default="{ row }">
            {{ row.direction === 'debit' ? '借' : '贷' }}
          </template>
        </el-table-column>
        <el-table-column label="辅助核算" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="t in auxLabels(row.auxiliaryTypes)" :key="t" size="small" class="aux-tag">
              {{ t }}
            </el-tag>
            <span v-if="!row.auxiliaryTypes?.length" class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="级次" width="70" align="center" prop="level" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'account:update'" link type="primary" @click="onEdit(row)">
              编辑
            </el-button>
            <el-button v-permission="'account:update'" link type="warning" @click="onToggleStatus(row)">
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button v-permission="'account:delete'" link type="danger" @click="onRemove(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑会计科目' : '新增会计科目'"
      width="640px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="科目编码" prop="code">
              <el-input v-model="form.code" :disabled="!!form.id" placeholder="如 1003" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="科目名称" prop="name">
              <el-input v-model="form.name" placeholder="如 其他货币资金" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="上级科目">
          <el-tree-select
            v-model="form.parentId"
            :data="treeSelectData"
            :props="{ label: 'name', value: 'id', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则为一级科目"
            style="width: 100%"
          />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="科目类别">
              <el-select
                v-model="form.category"
                :disabled="!!form.parentId"
                placeholder="选择类别"
                style="width: 100%"
              >
                <el-option
                  v-for="(label, key) in CATEGORY_LABELS"
                  :key="key"
                  :label="label"
                  :value="key"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="余额方向">
              <el-radio-group v-model="form.direction">
                <el-radio value="debit">借方</el-radio>
                <el-radio value="credit">贷方</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="辅助核算">
          <el-checkbox-group v-model="form.auxiliaryTypes">
            <el-checkbox value="partner">往来单位</el-checkbox>
            <el-checkbox value="department">部门</el-checkbox>
            <el-checkbox value="project">项目</el-checkbox>
          </el-checkbox-group>
          <div class="form-tip">勾选后，录入该科目分录时必须指定对应的辅助核算对象</div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="现金科目">
              <el-switch v-model="form.isCash" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="银行科目">
              <el-switch v-model="form.isBank" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
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
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Search, Download } from '@element-plus/icons-vue'
import { accountApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { exportExcel } from '@/utils/export'
import { CATEGORY_LABELS, CATEGORY_TAG_TYPE } from '@/utils/format'
import { useBasicStore } from '@/stores/basic'

const basicStore = useBasicStore()

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const category = ref('')
const status = ref<number | ''>('')

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()

interface AccountRow {
  id: string
  code: string
  name: string
  fullName: string
  category: string
  direction: string
  level: number
  isLeaf: boolean
  status: number
  parentId: string | null
  auxiliaryTypes: string[] | null
  isCash?: boolean
  isBank?: boolean
  sort?: number
  remark?: string | null
  children?: AccountRow[]
}

const tree = ref<AccountRow[]>([])
const treeSelectData = ref<AccountRow[]>([])
const tableKey = ref(0)
/**
 * 科目树默认全部展开。
 * 原因：辅助核算（往来单位/部门/项目）通常配置在二、三级科目上，
 * 若默认折叠，用户只能看到一级科目，导致「辅助核算」列看起来全是空的。
 */
const expandAll = ref(true)

const rules: FormRules = {
  code: [{ required: true, message: '请输入科目编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入科目名称', trigger: 'blur' }],
}

const initialForm = {
  id: '' as string,
  code: '',
  name: '',
  parentId: null as string | null,
  category: 'asset' as string,
  direction: 'debit' as 'debit' | 'credit',
  auxiliaryTypes: [] as string[],
  isCash: false,
  isBank: false,
  sort: 0,
  remark: '',
}

const form = reactive({ ...initialForm })

const AUX_LABELS: Record<string, string> = {
  partner: '往来单位',
  department: '部门',
  project: '项目',
}

function auxLabels(list: string[] | null): string[] {
  return (list ?? []).map((t) => AUX_LABELS[t] ?? t)
}

async function load() {
  loading.value = true
  try {
    tree.value = await accountApi.tree({
      keyword: keyword.value || undefined,
      category: category.value || undefined,
      status: status.value === '' ? undefined : status.value,
    })
    treeSelectData.value = JSON.parse(JSON.stringify(tree.value))
    await basicStore.refresh('accounts')
  } finally {
    loading.value = false
  }
}

function onReset() {
  keyword.value = ''
  category.value = ''
  status.value = ''
  load()
}

function toggleExpandAll() {
  expandAll.value = !expandAll.value
  // el-table 未暴露批量展开 API，通过改变 key 强制重渲染以应用 default-expand-all
  tableKey.value = Date.now()
}

function onCreate() {
  Object.assign(form, { ...initialForm, parentId: null })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function onEdit(row: AccountRow) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parentId,
    category: row.category,
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    auxiliaryTypes: [...(row.auxiliaryTypes ?? [])],
    isCash: !!row.isCash,
    isBank: !!row.isBank,
    sort: row.sort ?? 0,
    remark: row.remark ?? '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onToggleStatus(row: AccountRow) {
  const next = row.status === 1 ? 0 : 1
  try {
    await accountApi.updateStatus(row.id, next)
    ok(next === 1 ? '已启用' : '已禁用')
    load()
  } catch {
    // 错误已提示
  }
}

async function onRemove(row: AccountRow) {
  if (!(await confirmDelete(`科目「${row.name}」`))) return
  try {
    await accountApi.remove(row.id)
    ok('删除成功')
    load()
  } catch {
    // 错误已提示（如被引用）
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
      parentId: form.parentId || undefined,
      category: form.category,
      direction: form.direction,
      auxiliaryTypes: form.auxiliaryTypes,
      isCash: form.isCash,
      isBank: form.isBank,
      sort: form.sort,
      remark: form.remark || undefined,
    }
    if (form.id) {
      await accountApi.update(form.id, payload)
    } else {
      await accountApi.create(payload)
    }
    ok(form.id ? '修改成功' : '新增成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

function onExport() {
  const flat: any[] = []
  const walk = (nodes: AccountRow[], level: number) => {
    for (const node of nodes) {
      flat.push({ ...node, aux: auxLabels(node.auxiliaryTypes).join('、') })
      if (node.children?.length) walk(node.children, level + 1)
    }
  }
  walk(tree.value, 1)

  exportExcel({
    filename: `会计科目_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '会计科目',
    title: '会计科目表',
    columns: [
      { title: '科目编码', prop: 'code', width: 12 },
      { title: '科目名称', prop: 'name', width: 24 },
      { title: '科目类别', prop: 'category', width: 12, format: (r) => CATEGORY_LABELS[r.category] ?? '' },
      { title: '余额方向', prop: 'direction', width: 10, format: (r) => (r.direction === 'debit' ? '借' : '贷') },
      { title: '辅助核算', prop: 'aux', width: 22 },
      { title: '级次', prop: 'level', width: 8 },
      { title: '备注', prop: 'remark', width: 20 },
    ],
    rows: flat,
  })
  ElMessage.success('导出成功')
}

onMounted(load)
</script>

<style scoped lang="scss">
.aux-tag {
  margin-right: 4px;
}

.text-muted {
  color: #9ca3af;
}

.form-tip {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.6;
  margin-top: 2px;
}
</style>