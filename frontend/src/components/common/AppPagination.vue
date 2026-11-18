<template>
  <div
    v-if="!hidden"
    class="page-pagination app-pagination"
    :class="{ 'app-pagination--left': align === 'left' }"
  >
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      :layout="layout"
      :size="size"
      :background="background"
      :pager-count="pagerCount"
      :hide-on-single-page="hideOnSinglePage"
      :disabled="disabled"
      @current-change="onPageChange"
      @size-change="onSizeChange"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 统一分页条。
 *
 * 定位：全站唯一的分页 UI 出口，页面里不再直接写 <el-pagination>。
 *
 * 受控约定：
 * - 分页状态（page / pageSize）由父级持有，通过 v-model:page / v-model:page-size 回写；
 * - 翻页触发 change，改每页条数触发 size-change —— 父级只在这两个事件里请求数据，
 *   不要额外监听 update:*（那是状态同步，不是加载时机）。
 */
withDefaults(
  defineProps<{
    /** 总条数 */
    total: number
    /** 当前页（v-model:page） */
    page?: number
    /** 每页条数（v-model:page-size） */
    pageSize?: number
    /** 可选每页条数 */
    pageSizes?: number[]
    /** 布局，默认带总条数、每页条数、跳页 */
    layout?: string
    /** 尺寸：抽屉 / 卡片内用 small */
    size?: 'small' | 'default'
    /** 页码是否带底色 */
    background?: boolean
    /** 页码按钮数量 */
    pagerCount?: number
    /** 仅一页时隐藏分页条 */
    hideOnSinglePage?: boolean
    disabled?: boolean
    /** 对齐方式，默认右对齐 */
    align?: 'left' | 'right'
    /** 整体隐藏（父级自行控制显示条件时使用） */
    hidden?: boolean
  }>(),
  {
    page: 1,
    pageSize: 10,
    pageSizes: () => [10, 20, 50, 100],
    layout: 'total, sizes, prev, pager, next, jumper',
    size: 'default',
    background: false,
    pagerCount: 7,
    hideOnSinglePage: false,
    disabled: false,
    align: 'right',
    hidden: false,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
  /** 用户翻页 */
  change: [page: number]
  /** 用户修改每页条数 */
  sizeChange: [size: number]
}>()

/** 先回写状态再抛出加载事件，保证父级读到的是新页码 */
function onPageChange(page: number): void {
  emit('update:page', page)
  emit('change', page)
}

function onSizeChange(size: number): void {
  emit('update:pageSize', size)
  emit('sizeChange', size)
}
</script>

<style scoped>
/* 双类名提高优先级：全局 .page-pagination 默认右对齐，样式注入顺序不保证 */
.app-pagination.app-pagination--left {
  justify-content: flex-start;
}
</style>
