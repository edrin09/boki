<template>
  <el-sub-menu v-if="item.children?.length" :index="item.title">
    <template #title>
      <el-icon v-if="item.icon">
        <component :is="item.icon" />
      </el-icon>
      <span>{{ item.title }}</span>
    </template>
    <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
      <el-icon v-if="child.icon">
        <component :is="child.icon" />
      </el-icon>
      <span>{{ child.title }}</span>
    </el-menu-item>
  </el-sub-menu>

  <el-menu-item v-else-if="item.path" :index="item.path">
    <el-icon v-if="item.icon">
      <component :is="item.icon" />
    </el-icon>
    <template #title>{{ item.title }}</template>
  </el-menu-item>
</template>

<script setup lang="ts">
defineProps<{
  item: {
    title: string
    path?: string
    icon?: string
    children?: Array<{ title: string; path?: string; icon?: string }>
  }
}>()
</script>