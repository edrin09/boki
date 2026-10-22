<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <img class="login__logo" src="/boki-mark.svg" alt="BOKI" />
        <h1 class="login__title">BOKI</h1>
        <p class="login__subtitle">开源财务软件 · 复式记账 · 凭证管理 · 账簿报表</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @keyup.enter="onSubmit"
      >
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" clearable>
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>

        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password clearable>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" class="login__submit" :loading="loading" @click="onSubmit">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { mountBusinessRoutes, firstAccessiblePath } from '@/router'
import { ensurePluginsLoaded } from '@/plugins/runtime'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: 'admin',
  password: '123456',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.login(form.username, form.password)
    // 先加载插件（携带插件路由/菜单/插槽），再挂载业务路由；
    // 否则插件贡献的工作台、语音助手等要到刷新后才出现
    await ensurePluginsLoaded()
    mountBusinessRoutes()
    ElMessage.success('登录成功')

    const redirect = (route.query.redirect as string) || ''
    if (redirect && redirect.startsWith('/')) {
      await router.replace(redirect)
    } else {
      await router.replace(firstAccessiblePath(userStore.profile?.permissions ?? []))
    }
  } catch (error) {
    // 错误提示已在拦截器中统一处理
    console.warn('登录失败', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #0ea5e9 100%);
}

.login__card {
  width: 380px;
  background: #fff;
  border-radius: 10px;
  padding: 32px 34px 26px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);
}

.login__brand {
  text-align: center;
  margin-bottom: 22px;
}

.login__logo {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  display: block;
}

.login__title {
  margin: 0 0 6px;
  font-size: 20px;
  color: #111827;
}

.login__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.login__submit {
  width: 100%;
}

.login__tips {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px dashed var(--app-border);

  &-title {
    font-size: 12px;
    color: var(--app-text-secondary);
    margin-bottom: 8px;
  }
}

.login__tag {
  margin: 0 6px 6px 0;
  cursor: pointer;
}
</style>
