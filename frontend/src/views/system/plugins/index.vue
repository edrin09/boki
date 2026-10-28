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
        title="停用/启用只影响该插件自身，不会牵连其它插件；依赖缺失的插件会自动从菜单隐藏，补齐依赖后自动恢复。"
        description="安装插件会自动安装缺失的硬依赖。"
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
        <el-table-column label="依赖" min-width="170">
          <template #default="{ row }">
            <span v-if="!hardDeps(row.manifest).length && !softDeps(row.manifest).length" class="muted">无</span>
            <el-tag
              v-for="dep in hardDeps(row.manifest)"
              :key="`h-${dep}`"
              size="small"
              class="dep-tag"
              :type="row.missingDependencies?.includes(dep) ? 'danger' : 'info'"
            >
              {{ dep }}
            </el-tag>
            <el-tag
              v-for="dep in softDeps(row.manifest)"
              :key="`s-${dep}`"
              size="small"
              effect="plain"
              class="dep-tag"
            >
              {{ dep }}（可选）
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '已启用' : '已停用' }}
            </el-tag>
            <el-tooltip
              v-if="row.enabled && row.missingDependencies?.length"
              :content="`缺少依赖：${row.missingDependencies.join('、')}；该插件已自动从菜单隐藏`"
              placement="top"
            >
              <el-tag type="warning" size="small" class="dep-tag">依赖缺失</el-tag>
            </el-tooltip>
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

      <!-- 市场：远程插件市场（boki-market，配置 PLUGIN_MARKET_URL 后自动启用） -->
      <template v-else-if="remoteEnabled && remoteCatalog">
        <el-alert
          v-if="remoteCatalog.degraded"
          type="warning"
          show-icon
          :closable="false"
          :title="`远程市场暂不可达，当前展示本地缓存目录（${remoteCatalog.error ?? ''}）`"
          class="tip"
        />
        <el-alert
          v-else-if="!remoteCatalog.verified"
          type="warning"
          show-icon
          :closable="false"
          title="远程目录未验签：后端未配置 PLUGIN_MARKET_PUBLIC_KEYS，仅传输层保护"
          class="tip"
        />

        <div class="remote-toolbar">
          <div class="remote-toolbar__cats">
            <el-check-tag
              :checked="remoteCategory === 'all'"
              @change="remoteCategory = 'all' as never"
            >
              全部（{{ remoteCatalog.plugins.length }}）
            </el-check-tag>
            <el-check-tag
              v-for="cat in remoteCatalog.categories"
              :key="cat.id"
              :checked="remoteCategory === cat.id"
              @change="(remoteCategory = cat.id) as never"
            >
              {{ cat.name }}
            </el-check-tag>
          </div>
          <el-input
            v-model="remoteSearch"
            placeholder="搜索插件"
            clearable
            class="remote-toolbar__search"
          />
        </div>

        <el-table v-loading="loading" :data="remotePlugins" empty-text="该分类下暂无可用插件">
          <el-table-column prop="manifest.name" label="插件" min-width="200">
            <template #default="{ row }">
              <div class="plugin-name">
                <span class="plugin-name__title">{{ row.manifest.name }}</span>
                <span class="plugin-name__id">{{ row.manifest.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="100">
            <template #default="{ row }">{{ remoteCategoryName(row.category) }}</template>
          </el-table-column>
          <el-table-column prop="manifest.version" label="远程版本" width="100" />
          <el-table-column prop="manifest.description" label="说明" min-width="220" show-overflow-tooltip />
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
      </template>

      <!-- 市场：本地目录（未配置远程市场时） -->
      <!-- 市场：远程插件市场（boki-market，配置 PLUGIN_MARKET_URL 后自动启用） -->
      <template v-else-if="remoteEnabled && remoteCatalog">
        <el-alert
          v-if="remoteCatalog.degraded"
          type="warning"
          show-icon
          :closable="false"
          :title="`远程市场暂不可达，当前展示本地缓存目录（${remoteCatalog.error ?? ''}）`"
          class="tip"
        />
        <el-alert
          v-else-if="!remoteCatalog.verified"
          type="warning"
          show-icon
          :closable="false"
          title="远程目录未验签：后端未配置 PLUGIN_MARKET_PUBLIC_KEYS，仅传输层保护"
          class="tip"
        />

        <div class="remote-toolbar">
          <div class="remote-toolbar__cats">
            <el-check-tag
              :checked="remoteCategory === 'all'"
              @change="remoteCategory = 'all' as never"
            >
              全部（{{ remoteCatalog.plugins.length }}）
            </el-check-tag>
            <el-check-tag
              v-for="cat in remoteCatalog.categories"
              :key="cat.id"
              :checked="remoteCategory === cat.id"
              @change="(remoteCategory = cat.id) as never"
            >
              {{ cat.name }}
            </el-check-tag>
          </div>
          <el-input
            v-model="remoteSearch"
            placeholder="搜索插件"
            clearable
            class="remote-toolbar__search"
          />
        </div>

        <el-table v-loading="loading" :data="remotePlugins" empty-text="该分类下暂无可用插件">
          <el-table-column prop="manifest.name" label="插件" min-width="200">
            <template #default="{ row }">
              <div class="plugin-name">
                <span class="plugin-name__title">{{ row.manifest.name }}</span>
                <span class="plugin-name__id">{{ row.manifest.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="分类" width="100">
            <template #default="{ row }">{{ remoteCategoryName(row.category) }}</template>
          </el-table-column>
          <el-table-column prop="manifest.version" label="远程版本" width="100" />
          <el-table-column prop="manifest.description" label="说明" min-width="220" show-overflow-tooltip />
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
      </template>

      <!-- 市场：本地目录（未配置远程市场时） -->
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
import { onMounted, computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  pluginApi,
  type InstalledPlugin,
  type MarketPlugin,
  type PluginManifest,
  type RemoteMarketCatalog,
} from '@/api'

const tab = ref<'installed' | 'market'>('installed')
const loading = ref(false)
const installed = ref<InstalledPlugin[]>([])
const catalog = ref<MarketPlugin[]>([])
const restartRequired = ref(false)

// 远程插件市场（boki-market 独立服务端）；未配置 PLUGIN_MARKET_URL 时回退本地目录
const remoteEnabled = ref(false)
const remoteCatalog = ref<RemoteMarketCatalog | null>(null)
const remoteCategory = ref('all')
const remoteSearch = ref('')

function formatTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function hardDeps(manifest: PluginManifest): string[] {
  return Object.keys(manifest.dependencies ?? {})
}

function softDeps(manifest: PluginManifest): string[] {
  return Object.keys(manifest.optionalDependencies ?? {})
}

/** 已启用、且硬依赖该插件的插件：停用后它们会被自动隐藏（不会被停用） */
function hiddenDependents(id: string): string[] {
  return installed.value
    .filter((p) => p.enabled && p.manifest.id !== id && hardDeps(p.manifest).includes(id))
    .map((p) => p.manifest.name)
}

function remoteCategoryName(catId?: string): string {
  if (!catId) return '其他'
  const name = remoteCatalog.value?.categories?.find((c) => c.id === catId)?.name
  return name ?? '其他'
}

/** 远程目录：分类叠加搜索后的可见插件（服务端已排序，客户端保持原序） */
const remotePlugins = computed(() => {
  if (!remoteCatalog.value) return []
  const keyword = remoteSearch.value.trim().toLowerCase()
  return remoteCatalog.value.plugins.filter((row) => {
    if (remoteCategory.value !== 'all') {
      const hit =
        row.manifest.id &&
        (remoteCategory.value === 'other'
          ? !row.category || !remoteCatalog.value?.categories?.some((c) => c.id === row.category)
          : row.category === remoteCategory.value ||
            !!row.categories?.includes(remoteCategory.value))
      if (!hit) return false
    }
    if (keyword) {
      const hit =
        row.manifest.name?.toLowerCase().includes(keyword) ||
        row.manifest.id.toLowerCase().includes(keyword) ||
        row.manifest.description?.toLowerCase().includes(keyword)
      if (!hit) return false
    }
    return true
  })
})

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    installed.value = (await pluginApi.installed()) ?? []
    try {
      const status = await pluginApi.remoteStatus()
      if (status?.enabled) {
        remoteCatalog.value = await pluginApi.remoteCatalog()
        remoteEnabled.value = true
        return
      }
    } catch {
      // 远程市场不可用 → 回退本地目录
    }
    remoteEnabled.value = false
    remoteCatalog.value = null
    catalog.value = (await pluginApi.catalog()) ?? []
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
  const remoteRow = remoteEnabled.value
    ? remoteCatalog.value?.plugins.find((p) => p.manifest.id === id)
    : undefined

  if (remoteEnabled.value) {
    // 收费插件先弹授权码输入（授权码只作下载参数，不落盘）
    if (remoteRow?.price && remoteRow.price > 0) {
      const { value } = await ElMessageBox.prompt(
        `插件「${remoteRow.manifest.name}」需要授权码后才能下载安装`,
        '输入授权码',
        { type: 'info', inputPlaceholder: 'v1.xxxx.yyyy' },
      ).catch(() => ({ value: null as string | null }))
      if (!value) return
      const result = await pluginApi.remoteInstall(id, value)
      const list = result.installed?.length ? `（含依赖：${result.installed.join(', ')}）` : ''
      afterAction(`插件 ${id} 安装完成${list}`)
      return
    }

    const deps = hardDeps(remoteRow?.manifest ?? ({} as PluginManifest))
    const extra = deps.length ? `\n依赖：${deps.join(', ')}（缺失时自动安装）` : ''
    await ElMessageBox.confirm(
      `确定安装插件「${remoteRow?.manifest.name ?? id}」？${extra}\n安装后需重启后端生效。`,
      '安装插件',
      { type: 'info' },
    )
    const result = await pluginApi.remoteInstall(id)
    const list = result.installed?.length ? `（含依赖：${result.installed.join(', ')}）` : ''
    afterAction(`插件 ${id} 安装完成${list}`)
    return
  }

  const item = catalog.value.find((p) => p.manifest.id === id)
  const deps = hardDeps(item?.manifest ?? ({} as PluginManifest))
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
  const dependents = hiddenDependents(row.manifest.id)
  const extra = dependents.length
    ? `\n依赖它的插件（${dependents.join('、')}）会被自动隐藏，但不会被停用。`
    : ''
  await ElMessageBox.confirm(
    `确定停用插件「${row.manifest.name}」？\n停用只影响该插件自身，其它插件照常运行；数据保留，重启后端后生效。${extra}`,
    '停用插件',
    { type: 'warning' },
  )
  await pluginApi.disable(row.manifest.id)
  afterAction(`插件 ${row.manifest.id} 已停用，重启后端后生效`)
}

async function onUninstall(row: InstalledPlugin): Promise<void> {
  const dependents = hiddenDependents(row.manifest.id)
  const extra = dependents.length
    ? `\n依赖它的插件（${dependents.join('、')}）会被自动隐藏，但不会被卸载。`
    : ''
  const action = await ElMessageBox.confirm(
    `确定卸载插件「${row.manifest.name}」？${extra}\n` +
      '选择「保留数据」仅删除代码；选择「删除数据」将同时删除该插件的业务表（不可恢复）。',
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

.remote-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0;

  &__cats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__search {
    width: 220px;
    margin-left: auto;
  }
}
</style>
