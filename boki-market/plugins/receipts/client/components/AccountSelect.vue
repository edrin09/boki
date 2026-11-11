<template>
  <!--
    明细科目下拉（本插件内统一入口）。

    为什么不每个页面各写一遍 el-select：
    - 科目列表来自内核 basicStore，已经做了「按需加载 + 缓存」，各页面重复请求纯属浪费；
    - 语音面板还要把「推荐科目」置顶，三处写三遍必然长歪。

    value-key 决定回传什么：凭证分录要 id，归类规则要 code，语音卡片要「编码 + 名称」。
  -->
  <el-select
    :model-value="modelValue"
    filterable
    :clearable="clearable"
    :size="size"
    :placeholder="placeholder || '选择明细科目'"
    :loading="loading"
    style="width: 100%"
    @update:model-value="onChange"
  >
    <el-option-group v-if="recommendList.length" label="推荐">
      <el-option
        v-for="item in recommendList"
        :key="`rec-${item.value}`"
        :label="item.label"
        :value="item.value"
      >
        <span class="acc__label">{{ item.label }}</span>
        <span v-if="item.hint" class="acc__hint">{{ item.hint }}</span>
      </el-option>
    </el-option-group>
    <el-option-group label="全部明细科目">
      <el-option
        v-for="acc in restList"
        :key="acc.id"
        :label="labelOf(acc)"
        :value="valueOf(acc)"
      />
    </el-option-group>
  </el-select>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBasicStore } from '@/stores/basic'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** 回传口径：分录行用 id，规则/语音卡片用「编码 + 名称」 */
    valueKey?: 'id' | 'code' | 'label'
    /** 推荐项（置顶分组），只用于语音卡片 */
    suggest?: Array<{ value: string; label: string; hint?: string }>
    placeholder?: string
    size?: 'large' | 'default' | 'small'
    clearable?: boolean
  }>(),
  { valueKey: 'label', size: 'small', clearable: true },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const basic = useBasicStore()
const loading = ref(false)

function labelOf(acc: any): string {
  return `${acc.code} ${acc.fullName || acc.name}`
}

function valueOf(acc: any): string {
  if (props.valueKey === 'id') return acc.id
  if (props.valueKey === 'code') return acc.code
  return labelOf(acc)
}

const recommendList = computed(() => props.suggest ?? [])

/** 推荐项已置顶，全部列表里去掉重复项，避免同一个科目出现两次 */
const restList = computed(() =>
  basic.accounts.filter((acc: any) => !recommendList.value.some((item) => item.value === valueOf(acc))),
)

function onChange(value: string): void {
  emit('update:modelValue', value ?? '')
}

onMounted(async () => {
  if (basic.loaded.accounts) return
  loading.value = true
  try {
    await basic.loadAccounts()
  } catch {
    // 科目表取不到时下拉为空，不阻塞页面其余部分
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.acc__label {
  flex: 1;
}
.acc__hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
