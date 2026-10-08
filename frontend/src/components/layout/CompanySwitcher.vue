<template>
  <el-dropdown trigger="click" @command="onCommand">
    <span class="company-switcher" :class="{ 'is-loading': userStore.switching }">
      <el-icon><OfficeBuilding /></el-icon>
      <span class="company-switcher__name">{{ currentName }}</span>
      <el-icon><ArrowDown /></el-icon>
    </span>

    <template #dropdown>
      <el-dropdown-menu>
        <div class="company-menu__header">记账公司</div>
        <el-dropdown-item
          v-for="item in userStore.companies"
          :key="item.id"
          :command="`switch:${item.id}`"
          :class="{ 'is-active': item.id === userStore.companyId }"
        >
          <el-icon>
            <CircleCheck v-if="item.id === userStore.companyId" />
            <OfficeBuilding v-else />
          </el-icon>
          <span class="company-menu__name">{{ item.name }}</span>
          <el-tag v-if="item.status !== 1" size="small" type="danger" effect="plain">已停用</el-tag>
        </el-dropdown-item>

        <el-dropdown-item command="manage" divided>
          <el-icon><Setting /></el-icon>公司管理
        </el-dropdown-item>
        <el-dropdown-item v-if="userStore.isAdmin" command="create">
          <el-icon><Plus /></el-icon>新建公司
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, CircleCheck, OfficeBuilding, Plus, Setting } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useBasicStore } from '@/stores/basic'

const router = useRouter()
const userStore = useUserStore()
const basicStore = useBasicStore()

const currentName = computed(() => userStore.companyName || '未选择公司')

/** 切换公司后需清空按公司缓存的基础档案，再回到工作台 */
async function onCommand(command: string) {
  if (command === 'manage') {
    router.push('/system/companies')
    return
  }
  if (command === 'create') {
    router.push('/system/companies?create=1')
    return
  }
  if (!command.startsWith('switch:')) return

  const companyId = command.slice('switch:'.length)
  try {
    await userStore.switchCompany(companyId)
    basicStore.reset()
    ElMessage.success(`已切换到「${userStore.companyName}」`)
    // 令牌已变更、权限与基础档案已重载，整页刷新最稳妥
    window.location.href = '/dashboard'
  } catch {
    ElMessage.error('切换公司失败，请重试')
  }
}
</script>

<style scoped lang="scss">
.company-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  outline: none;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--app-primary-light, #ecf5ff);
  color: var(--app-primary);
  max-width: 220px;

  &.is-loading {
    opacity: 0.6;
    pointer-events: none;
  }

  &__name {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.company-menu__header {
  padding: 6px 16px 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.company-menu__name {
  margin-right: 8px;
}
</style>