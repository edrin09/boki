<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-input v-model="query.keyword" placeholder="搜索操作 / 路径 / 用户" clearable style="width: 220px"
          @keyup.enter="search" @clear="search" />
        <el-select v-model="query.success" placeholder="结果" clearable style="width: 110px" @change="search">
          <el-option label="成功" value="true" />
          <el-option label="失败" value="false" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div class="page-toolbar__spacer" />
        <el-button type="danger" plain @click="onClean">
          <el-icon><Delete /></el-icon>清理历史日志
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list" empty-text="暂无日志">
        <el-table-column prop="createdAt" label="时间" width="170" />
        <el-table-column prop="username" label="操作人" width="120">
          <template #default="{ row }">{{ row.username || '-' }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="180" />
        <el-table-column label="请求" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag size="small" :type="methodTag(row.method)">{{ row.method }}</el-tag>
            <span class="path">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" />
        <el-table-column label="耗时" width="90" align="right">
          <template #default="{ row }">{{ row.duration }}ms</template>
        </el-table-column>
        <el-table-column label="结果" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <AppPagination
        v-model:page="query.page"
        v-model:page-size="query.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        @change="load"
        @size-change="reset"
      />
    </div>

    <el-drawer v-model="detailVisible" title="日志详情" size="520px">
      <el-descriptions v-if="current" :column="1" border>
        <el-descriptions-item label="时间">{{ current.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ current.username || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作">{{ current.action }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ current.module || '-' }}</el-descriptions-item>
        <el-descriptions-item label="请求">
          {{ current.method }} {{ current.path }}
        </el-descriptions-item>
        <el-descriptions-item label="IP">{{ current.ip || '-' }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ current.duration }} ms</el-descriptions-item>
        <el-descriptions-item label="结果">{{ current.success ? '成功' : '失败' }}</el-descriptions-item>
        <el-descriptions-item label="请求参数">
          <pre class="params">{{ prettyParams }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="current.errorMsg" label="错误信息">
          <span class="error">{{ current.errorMsg }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="User-Agent">
          <span class="ua">{{ current.userAgent || '-' }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Search, Delete } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { ok, usePagedList } from '@/composables/useList'
import AppPagination from '@/components/common/AppPagination.vue'

const METHODS: Record<string, any> = { GET: 'success', POST: 'primary', PUT: 'warning', DELETE: 'danger' }
const methodTag = (m: string) => METHODS[m] ?? 'info'

const dateRange = ref<[string, string] | null>(null)
const query = reactive<Record<string, any>>({ page: 1, pageSize: 20, keyword: '', success: '' })

const { list, total, loading, load, search, reset } = usePagedList({
  fetcher: (params) => {
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    return systemApi.logs(params)
  },
})

const detailVisible = ref(false)
const current = ref<any>(null)

const prettyParams = computed(() => {
  if (!current.value?.params) return '-'
  try {
    return JSON.stringify(JSON.parse(current.value.params), null, 2)
  } catch {
    return current.value.params
  }
})

function showDetail(row: any) {
  current.value = row
  detailVisible.value = true
}

async function onClean() {
  try {
    const res = await ElMessageBox.prompt('清理 30 天前的历史日志，保留天数可修改', '清理日志', {
      inputValue: '30',
      inputPattern: /^\d+$/,
      inputErrorMessage: '请输入数字',
    })
    const data = await systemApi.cleanLogs({ keepDays: Number(res.value) })
    ok(data?.message ?? '清理完成')
    load()
  } catch {
    /* 取消或失败 */
  }
}

onMounted(load)
</script>

<style scoped lang="scss">
.path {
  margin-left: 6px;
  font-size: 12px;
  color: #4b5563;
}

.params {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.error {
  color: #dc2626;
}

.ua {
  font-size: 12px;
  color: #6b7280;
  word-break: break-all;
}
</style>