<template>
  <el-config-provider :locale="zhCn">
    <router-view />
    <!-- 加密锁定遮罩（423）：不卸载当前页，解锁成功后整页重载 -->
    <Teleport to="body">
      <div v-if="dockLocked" class="vault-lock-overlay">
        <VaultUnlock variant="overlay" />
      </div>
    </Teleport>
  </el-config-provider>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import VaultUnlock from './views/VaultUnlock.vue'

/** 是否处于「已加密但被锁定」状态（由 http.ts 的 423 拦截派发） */
const dockLocked = ref(false)

function onLocked(): void {
  dockLocked.value = true
}

const LOCKED_EVENT = 'vault:locked'

onMounted(() => {
  window.addEventListener(LOCKED_EVENT, onLocked)
})

onBeforeUnmount(() => {
  window.removeEventListener(LOCKED_EVENT, onLocked)
})
</script>

<style scoped>
.vault-lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.94) 55%, rgba(49, 46, 129, 0.92) 100%);
  backdrop-filter: blur(4px);
}
</style>