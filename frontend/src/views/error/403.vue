<template>
  <div class="error-page">
    <div class="error-page__code">403</div>
    <div class="error-page__text">抱歉，你没有访问该页面的权限</div>
    <div class="error-page__tips">
      如需开通权限，请联系系统管理员在「系统管理 → 角色管理」中分配。
    </div>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped lang="scss">
.error-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--app-bg);

  &__code {
    font-size: 76px;
    font-weight: 700;
    color: #d97706;
    line-height: 1;
  }

  &__text {
    color: var(--app-text-secondary);
    font-size: 14px;
  }

  &__tips {
    color: #9ca3af;
    font-size: 12px;
  }
}
</style>