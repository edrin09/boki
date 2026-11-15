<template>
  <div class="page">
    <el-row :gutter="12">
      <el-col :xs="24" :md="12">
        <div class="page-card">
          <div class="page-toolbar">
            <strong>数据备份</strong>
            <div class="page-toolbar__spacer" />
            <el-upload
              :show-file-list="false"
              accept=".db,.sqlite,.sqlite3"
              :before-upload="onRestorePlain"
            >
              <el-button v-permission="'system:backup:restore'" type="warning" :loading="restoringPlain">
                上传明文库恢复
              </el-button>
            </el-upload>
            <el-button v-permission="'system:backup:download'" type="primary" :loading="creating" @click="onCreate">
              <el-icon><Download /></el-icon>立即备份
            </el-button>
          </div>

          <el-alert type="info" :closable="false" show-icon class="mb12"
            title="SQLite 单文件数据库，备份即完整复制。建议在月末结账或批量导入前先备份一次。" />
          <el-alert type="warning" :closable="false" show-icon class="mb12"
            title="「上传明文库恢复」用于把明文的 .db 文件恢复到本系统：系统会先用当前密钥加密并暂存，随后自动重启服务切换数据库，并自动保留恢复前的安全备份。" />

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
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { confirmDelete, ok } from '@/composables/useList'
import { formatDate } from '@/utils/format'

const backups = ref<any[]>([])
const loading = ref(false)
const loadingInfo = ref(false)
const creating = ref(false)
const restoringPlain = ref(false)
const info = ref<any>(null)

/** 与 axios 同一前缀：探活用原生 fetch，不经过拦截器（重启期间 token 可能已失效） */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
const HEALTH_URL = `${API_BASE}/health`
/** 重启最长等待时间（含插件加载与建连） */
const RESTART_TIMEOUT = 120_000

interface HealthInfo {
  pid: number
  startedAt: string
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 探活：服务不可达（正在重启）时返回 null */
async function probeHealth(): Promise<HealthInfo | null> {
  try {
    const res = await fetch(`${HEALTH_URL}?_=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = await res.json()
    const data = body?.data
    return data && typeof data.pid === 'number' ? (data as HealthInfo) : null
  } catch {
    return null
  }
}

/**
 * 等后端换库重启完成。
 *
 * 只判断「接口能通」是不够的 —— 旧进程在关闭前一直能通。
 * 必须等 pid 变化才算新进程接上了新库；拿不到旧 pid 时，
 * 至少要观察到一次「连不上」再恢复，避免误判成已完成。
 */
async function waitForRestart(beforePid: number | null): Promise<boolean> {
  const start = Date.now()
  let downSeen = false
  while (Date.now() - start < RESTART_TIMEOUT) {
    await sleep(1000)
    const health = await probeHealth()
    if (!health) {
      downSeen = true
      continue
    }
    if (beforePid !== null) {
      if (health.pid !== beforePid) return true
    } else if (downSeen) {
      return true
    }
  }
  return false
}

/**
 * 「恢复 + 自动重启」的统一收尾。
 *
 * 后端恢复只做暂存，随后自己重启换库，所以这里要：
 * 1) 全屏遮罩，避免用户以为卡死；
 * 2) 轮询探活，直到新进程就绪；
 * 3) 刷新页面（恢复后账号可能不在库里，会回到登录页）。
 */
async function runRestore(exec: () => Promise<{ message?: string }>): Promise<void> {
  const before = await probeHealth()

  const loading = ElLoading.service({
    lock: true,
    fullscreen: true,
    text: '正在恢复数据，请稍候…',
    background: 'rgba(0, 0, 0, 0.65)',
  })

  try {
    let message = ''
    try {
      const res = await exec()
      message = res?.message ?? ''
    } catch (err: any) {
      // 恢复本身会紧接着重启，响应可能被连接中断截断（status 0）；
      // 真正的校验错误（密钥不匹配、文件非法等）照常抛出。
      if (err?.status !== 0) throw err
    }

    loading.setText('服务正在自动重启以切换数据库，请勿关闭页面…')
    const done = await waitForRestart(before?.pid ?? null)

    if (!done) {
      loading.close()
      ElMessageBox.alert(
        `${message ? `${message} ` : ''}已等待 2 分钟仍未检测到服务重新就绪。` +
          '恢复文件已安全暂存，下次启动服务时会自动生效；请到后台手动启动服务。',
        '恢复未完成',
        { type: 'warning', confirmButtonText: '知道了' },
      )
      return
    }

    loading.setText('新数据库已生效，正在刷新页面…')
    await sleep(600)
    loading.close()
    ElMessage.success('已切换到恢复后的数据库，请重新登录')
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    loading.close()
    throw err
  }
}

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
      `将用备份「${row.filename}」恢复数据：系统会先自动生成一份 pre-restore 安全备份，` +
        '然后自动重启服务切换到新库。重启期间页面会短暂失去连接（约 10 秒），完成后自动刷新并需重新登录。确定恢复吗？',
      '恢复数据',
      { type: 'warning', confirmButtonText: '确定恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await runRestore(() => systemApi.restore({ filename: row.filename, confirm: true }))
  } catch {
    /* 错误已提示 */
  }
}

async function onRestorePlain(file: File) {
  try {
    await ElMessageBox.confirm(
      `将用「${file.name}」恢复数据：系统会先用当前密钥把该文件加密并暂存，同时生成一份 pre-restore-plain 安全备份，` +
        '然后自动重启服务切换到新库。重启期间页面会短暂失去连接，完成后自动刷新并需重新登录。确定继续吗？',
      '上传明文库恢复',
      { type: 'warning', confirmButtonText: '确定恢复', cancelButtonText: '取消' },
    )
  } catch {
    return false
  }
  restoringPlain.value = true
  try {
    await runRestore(() => systemApi.restorePlain(file))
  } catch {
    /* 错误已由拦截器提示 */
  } finally {
    restoringPlain.value = false
  }
  return false
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