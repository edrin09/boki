<template>
  <component
    :is="component"
    v-for="(component, index) in components"
    :key="`${name}-${index}`"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getPluginSlotComponents } from '@/plugins/runtime'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ name: string }>()

const components = computed(() => getPluginSlotComponents(props.name))
</script>
