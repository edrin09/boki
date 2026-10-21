<template>
  <div class="page">
    <div class="page-card">
      <div class="page-toolbar">
        <el-tabs v-model="tab" class="plugin-tabs">
          <el-tab-pane label="已安装" name="installed" />
          <el-tab-pane label="插件市场" name="market" />
        </el-tabs>
        <div class="page-toolbar__spacer" />
        <el-button :loading="loading" @click="loadAll">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>

      <el-alert
        v-if="restartRequired"
        type="warning"
        show-icon
        :closable="false"
        title="插件变更已写入，需重启后端服务后生效"
        description="重启后刷新本页面；停用或卸载不会删除业务数据（卸载时可选择）。"
        class="tip"
      />

      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="安装插件会自动安装缺失的依赖；卸载被依赖的插件会被拒绝。"
        class="tip"
      />

      <!-- 已安装 -->
      <el-table v-if="tab === 'installed'" v-loading="loading" :data="installed" empty-text="尚未安装任何插件">
        <el-table-column prop="manifest.name" label="插件" min-width="180">
          <template #default="{ row }">
            <div class="plugin-name">
              <span class="plugin-name__title">{{ row.manifest.name }}</span>
              <span class="plugin-name__id">{{ row.manifest.id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="manifest.version" label="版本" width="110" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.manifest.kind || 'domain' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="依赖" min-width="150">
          <template #default="{ row }">
            <span v-if="!depNames(row.manifest).length" class="muted">无</span>
            <el-tag v-for="dep in depNames(row.manifest)" :key="dep" size="small" class="dep-tag">
              {{ dep }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '已启用' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.installedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.hasUpdate" link type="warning" @click="onInstall(row.manifest.id)">
              更新
            </el-button>
            <el-button v-if="row.enabled" link type="warning" @click="onDisable(row)">
              停用
            </el-button>
            <el-button v-else link type="success" @click="onEnable(row)">启用</el-button>
            <el-button link type="danger" @click="onUninstall(row)">卸载</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 市场 -->
      <el-table v-else v-loading="loading" :data="catalog" empty-text="市场中没有可用插件">
        <el-table-column prop="manifest.name" label="插件" min-width="200">
          <template #default="{ row }">
            <div class="plugin-name">
              <span class="plugin-name__title">{{ row.manifest.name }}</span>
              <span class="plugin-name__id">{{ row.manifest.id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="manifest.version" label="版本" width="100" />
        <el-table-column prop="manifest.description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="权限" min-width="180">
          <template #default="{ row }">
            <span v-if="!row.manifest.permissions?.length" class="muted">无</span>
            <el-tag
              v-for="perm in row.manifest.permissions"
              :key="perm"
              size="small"
              effect="plain"
              class="dep-tag"
            >
              {{ perm }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag v-if="!row.installed" size="small" effect="plain">未安装</el-tag>
            <el-tag v-else-if="row.enabled" type="success" size="small">已启用</el-tag>
            <el-tag v-else type="info" size="small">已停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.installed" link type="primary" @click="onInstall(row.manifest.id)">
              安装
            </el-button>
            <el-button v-else-if="row.hasUpdate" link type="warning" @click="onInstall(row.manifest.id)">
              更新
            </el-button>
            <span v-else class="muted">已是最新</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  pluginApi,
  type InstalledPlugin,
  type MarketPlugin,
  type PluginManifest,
} from '@/api'

const tab = ref<'installed' | 'market'>('installed')
const loading = ref(false)
const installed = ref<InstalledPlugin[]>([])
const catalog = ref<MarketPlugin[]>([])
const restartRequired = ref(false)

function formatTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function depNames(manifest: PluginManifest): string[] {
  return Object.keys(manifest.dependencies ?? {})
}

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    const [installedList, marketList] = await Promise.all([
      pluginApi.installed(),
      pluginApi.catalog(),
    ])
    installed.value = installedList ?? []
    catalog.value = marketList ?? []
  } finally {
    loading.value = false
  }
}

function afterAction(message: string): void {
  restartRequired.value = true
  ElMessage.success(message)
  loadAll()
}

async function onInstall(id: string): Promise<void> {
  const item = catalog.value.find((p) => p.manifest.id === id)
  const deps = depNames(item?.manifest ?? ({} as PluginManifest))
  const extra = deps.length ? `\n依赖：${deps.join(', ')}（缺失时自动安装）` : ''
  await ElMessageBox.confirm(
    `确定安装插件「${item?.manifest.name ?? id}」？${extra}\n安装后需重启后端生效。`,
    '安装插件',
    { type: 'info' },
  )
  const result = await pluginApi.install(id)
  const list = result.installed?.length ? `（含依赖：${result.installed.join(', ')}）` : ''
  afterAction(`插件 ${id} 安装完成${list}`)
}

async function onEnable(row: InstalledPlugin): Promise<void> {
  await pluginApi.enable(row.manifest.id)
  afterAction(`插件 ${row.manifest.id} 已启用，重启后端后生效`)
}

async function onDisable(row: InstalledPlugin): Promise<void> {
  await ElMessageBox.confirm(
    `确定停用插件「${row.manifest.name}」？停用后其页面与接口在重启后不可用，数据保留。`,
    '停用插件',
    { type: 'warning' },
  )
  await pluginApi.disable(row.manifest.id)
  afterAction(`插件 ${row.manifest.id} 已停用，重启后端后生效`)
}

async function onUninstall(row: InstalledPlugin): Promise<void> {
  const action = await ElMessageBox.confirm(
    `确定卸载插件「${row.manifest.name}」？\n选择「保留数据」仅删除代码；选择「删除数据」将同时删除该插件的业务表（不可恢复）。`,
    '卸载插件',
    {
      type: 'warning',
      distinguishCancelAndClose: true,
      confirmButtonText: '保留数据并卸载',
      cancelButtonText: '删除数据并卸载',
    },
  ).catch((reason) => reason)

  if (action !== 'confirm' && action !== 'cancel') return
  const keepData = action === 'confirm'

  if (!keepData) {
    await ElMessageBox.confirm(
      `再次确认：删除插件「${row.manifest.name}」的全部业务表？此操作不可恢复。`,
      '危险操作',
      { type: 'error', confirmButtonText: '确认删除' },
    )
  }

  await pluginApi.uninstall(row.manifest.id, keepData)
  afterAction(`插件 ${row.manifest.id} 已卸载${keepData ? '（数据保留）' : '（数据已删除）'}`)
}

onMounted(loadAll)
</script>

<style scoped lang="scss">
.plugin-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }
}

.plugin-name {
  display: flex;
  flex-direction: column;

  &__title {
    font-weight: 500;
  }

  &__id {
    font-size: 12px;
    color: var(--app-text-secondary);
  }
}

.dep-tag {
  margin: 2px 6px 2px 0;
}

.muted {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.tip {
  margin: 12px 0;
}
</style>
