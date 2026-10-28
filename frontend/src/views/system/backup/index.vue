<template>
  <div class="page">
    <el-row :gutter="12">
      <el-col :xs="24" :md="12">
        <div class="page-card">
          <div class="page-toolbar">
            <strong>数据备份</strong>
            <div class="page-toolbar__spacer" />
            <el-button v-permission="'system:backup:download'" type="primary" :loading="creating" @click="onCreate">
              <el-icon><Download /></el-icon>立即备份
            </el-button>
          </div>

          <el-alert type="info" :closable="false" show-icon class="mb12"
            title="SQLite 单文件数据库，备份即完整复制。建议在月末结账或批量导入前先备份一次。" />

          <el-table v-loading="loading" :data="backups" empty-text="暂无备份">
            <el-table-column prop="filename" label="文件名" min-width="220" />
            <el-table-column prop="sizeText" label="大小" width="110" />
            <el-table-column label="备份时间" width="150">
              <template #default="{ row }">{{ formatDate(row.createdAt, 'YYYY-MM-DD HH:mm') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-permission="'system:backup:download'"
                  link
                  type="primary"
                  @click="onDownload(row)"
                >
                  下载
                </el-button>
                <el-button
                  v-permission="'system:backup:download'"
                  link
                  type="success"
                  @click="onDownloadPlain(row)"
                >
                  明文下载
                </el-button>
                <el-button
                  v-permission="'system:backup:restore'"
                  link
                  type="warning"
                  @click="onRestore(row)"
                >
                  恢复
                </el-button>
                <el-button v-role="'admin'" link type="danger" @click="onRemove(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <el-col :xs="24" :md="12">
        <div class="page-card">
          <strong>系统信息</strong>
          <el-descriptions v-loading="loadingInfo" :column="1" border class="mt12">
            <el-descriptions-item label="数据库驱动">{{ info?.database?.driver ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="数据库文件">
              <span class="path">{{ info?.database?.path ?? '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="数据库大小">{{ info?.database?.sizeText ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="会计科目">{{ info?.counts?.accounts ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="凭证数量">{{ info?.counts?.vouchers ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="凭证分录">{{ info?.counts?.entries ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="用户数量">{{ info?.counts?.users ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="操作日志">{{ info?.counts?.logs ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="运行环境">
              {{ info?.platform ?? '-' }} / Node {{ info?.nodeVersion ?? '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { formatDate } from '@/utils/format'

const backups = ref<any[]>([])
const loading = ref(false)
const loadingInfo = ref(false)
const creating = ref(false)
const info = ref<any>(null)

async function load() {
  loading.value = true
  try {
    backups.value = await systemApi.backups()
  } finally {
    loading.value = false
  }
}

async function loadInfo() {
  loadingInfo.value = true
  try {
    info.value = await systemApi.info()
  } catch {
    info.value = null
  } finally {
    loadingInfo.value = false
  }
}

async function onCreate() {
  creating.value = true
  try {
    const res = await systemApi.createBackup()
    ok(`备份成功：${res.filename}`)
    load()
  } finally {
    creating.value = false
  }
}

async function onDownload(row: any) {
  try {
    await systemApi.downloadBackup(row.filename)
  } catch (error) {
    ElMessage.error('下载失败，请重试')
    console.warn(error)
  }
}

async function onDownloadPlain(row: any) {
  try {
    await ElMessageBox.confirm(
      `将把备份「${row.filename}」导出为明文数据库（不需要 vault.key 即可打开）。请妥善保管、用后即删，避免明文账套外泄。`,
      '导出明文备份',
      { type: 'warning', confirmButtonText: '确认导出', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await systemApi.downloadBackupPlain(row.filename)
    ok('明文导出成功（无密钥即可打开，请妥善保管）')
  } catch {
    /* 错误已由拦截器提示 */
  }
}

async function onRestore(row: any) {
  try {
    await ElMessageBox.confirm(
      `恢复将覆盖当前全部数据（系统会先自动生成一份 pre-restore 备份）。确定从「${row.filename}」恢复吗？`,
      '恢复数据',
      { type: 'warning', confirmButtonText: '确定恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    const res = await systemApi.restore({ filename: row.filename, confirm: true })
    ElMessageBox.alert(res.message ?? '恢复完成，请重启服务使数据生效', '恢复数据', {
      type: 'success',
    })
    load()
    loadInfo()
  } catch {
    /* 错误已提示 */
  }
}

async function onRemove(row: any) {
  if (!(await confirmDelete(`备份文件「${row.filename}」`))) return
  try {
    await systemApi.removeBackup(row.filename)
    ok('已删除')
    load()
  } catch {
    /* 错误已提示 */
  }
}

onMounted(() => {
  load()
  loadInfo()
})
</script>

<style scoped lang="scss">
.mt12 {
  margin-top: 12px;
}

.mb12 {
  margin-bottom: 12px;
}

.path {
  font-size: 12px;
  color: #6b7280;
  word-break: break-all;
}
</style>