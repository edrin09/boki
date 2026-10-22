<template>
  <div class="app-layout">
    <!-- 侧边栏 -->
    <aside class="app-sider" :class="{ 'is-collapsed': collapsed }">
      <div class="app-logo">
        <img class="app-logo__mark" src="/boki-mark.svg" alt="BOKI" />
        <span v-if="!collapsed">BOKI</span>
      </div>
      <el-scrollbar class="app-menu-wrap">
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          router
        >
          <MenuItem v-for="item in menus" :key="item.title" :item="item" />
        </el-menu>
      </el-scrollbar>
    </aside>

    <!-- 主体 -->
    <div class="app-main">
      <header class="app-header">
        <div class="app-header__left">
          <el-icon class="app-header__collapse" @click="collapsed = !collapsed">
            <Fold v-if="!collapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, i) in breadcrumbs" :key="i">
              {{ item }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="app-header__right">
          <CompanySwitcher />
          <span class="app-header__period">{{ periodLabel(currentPeriod()) }}</span>

          <el-dropdown trigger="click" @command="onCommand">
            <span class="app-user">
              <el-avatar :size="28">{{ avatarText }}</el-avatar>
              <span class="app-user__name">{{ userStore.nickname || '未登录' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="app-content">
        <router-view />
      </main>
    </div>

    <!-- 插件全局插槽（语音助手等浮动入口；未安装插件时为空） -->
    <PluginSlot name="layout.floating" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Fold, Expand, ArrowDown, User, SwitchButton } from '@element-plus/icons-vue'
import MenuItem from './MenuItem.vue'
import CompanySwitcher from './CompanySwitcher.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import { useUserStore } from '@/stores/user'
import { filterMenus, mergePluginMenus, MENUS, type MenuNode } from '@/router/menus'
import { getPluginMenus, pluginRuntimeVersion } from '@/plugins/runtime'
import { currentPeriod, periodLabel } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const collapsed = ref(false)

/** 内核 + 插件菜单，按权限过滤 */
const menus = computed<MenuNode[]>(() => {
  // 读取版本号以在插件加载完成后重新计算
  pluginRuntimeVersion.value
  return filterMenus(
    mergePluginMenus(MENUS, getPluginMenus()),
    userStore.profile?.permissions ?? [],
  )
})

const activeMenu = computed(() => (route.meta.activeMenu as string) || route.path)

const breadcrumbs = computed(() => {
  const titles = route.matched
    .filter((r) => r.meta?.title)
    .map((r) => r.meta.title as string)
  return titles.length ? titles : ['工作台']
})

const avatarText = computed(() => (userStore.nickname || 'U').slice(0, 1))

function onCommand(command: string) {
  if (command === 'profile') {
    router.push('/system/profile')
    return
  }
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
      .then(async () => {
        await userStore.logout()
        window.location.href = '/login'
      })
      .catch(() => {})
  }
}
</script>

<style scoped lang="scss">
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

.app-sider {
  width: 208px;
  flex-shrink: 0;
  background: var(--app-sider-bg);
  transition: width 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.is-collapsed {
    width: 64px;
  }
}

.app-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 1.5px;
  background: var(--app-primary);
  flex-shrink: 0;
  white-space: nowrap;

  &__mark {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
  }
}

.app-menu-wrap {
  flex: 1;
  height: 0;
}

.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;

  &__left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__collapse {
    cursor: pointer;
    font-size: 18px;
    color: var(--app-text-secondary);
  }

  &__period {
    font-size: 13px;
    color: var(--app-text-secondary);
    background: var(--app-bg);
    padding: 4px 10px;
    border-radius: 4px;
  }
}

.app-user {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  outline: none;

  &__name {
    font-size: 14px;
  }
}

.app-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}
</style>