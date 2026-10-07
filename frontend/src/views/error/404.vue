<template>
  <div class="error-page">
    <div class="error-page__code">404</div>
    <div class="error-page__text">抱歉，你访问的页面不存在</div>
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
    color: var(--app-primary);
    line-height: 1;
  }

  &__text {
    color: var(--app-text-secondary);
    font-size: 14px;
  }
}
</style>