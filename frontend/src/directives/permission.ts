import type { App, Directive, DirectiveBinding } from 'vue'
import { useUserStore } from '@/stores/user'

/**
 * 权限指令：v-permission="'voucher:create'" 或 v-permission="['a','b']"
 * 无权限时移除元素
 */
export const permissionDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const userStore = useUserStore()
    const required = binding.value
    if (!required) return
    if (!userStore.hasPermission(required)) {
      el.parentNode?.removeChild(el)
    }
  },
}

/**
 * 角色指令：v-role="'admin'"
 */
export const roleDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const userStore = useUserStore()
    const required = binding.value
    if (!required) return
    if (!userStore.hasRole(required)) {
      el.parentNode?.removeChild(el)
    }
  },
}

export function setupDirectives(app: App): void {
  app.directive('permission', permissionDirective)
  app.directive('role', roleDirective)
}