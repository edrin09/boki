<template>
  <el-date-picker
    v-model="period"
    type="month"
    value-format="YYYYMM"
    placeholder="选择会计期间"
    format="YYYY 年 MM 月"
    :clearable="clearable"
    :style="{ width }"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: number | null
    clearable?: boolean
    width?: string
  }>(),
  {
    modelValue: undefined,
    clearable: false,
    width: '150px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
  (e: 'change', value: number | null): void
}>()

/** 内部以 YYYYMM 字符串操作，对外暴露 number */
const period = computed<string>({
  get: () => {
    const v = props.modelValue
    if (!v) return ''
    return String(v)
  },
  set: (val: string) => {
    const next = val ? Number(val) : null
    emit('update:modelValue', next)
    emit('change', next)
  },
})
</script>