<template>
  <div class="setup-company">
    <div class="setup-company__card">
      <div class="setup-company__brand">
        <div class="setup-company__logo">财务</div>
        <h1 class="setup-company__title">创建记账公司</h1>
        <p class="setup-company__subtitle">系统中还没有记账公司，请先创建一家以开始记账</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="公司名称" prop="name">
          <el-input v-model="form.name" maxlength="100" placeholder="营业执照上的公司全称" />
        </el-form-item>

        <el-form-item label="纳税人识别号" prop="taxNo">
          <el-input v-model="form.taxNo" maxlength="50" placeholder="统一社会信用代码" />
        </el-form-item>

        <el-form-item label="纳税人类型" prop="taxpayerType">
          <el-select v-model="form.taxpayerType" placeholder="请选择纳税人类型">
            <el-option label="小规模纳税人" value="small_scale" />
            <el-option label="一般纳税人" value="general" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" class="setup-company__submit" :loading="loading" @click="onSubmit">
            创建并进入
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { companyApi } from '@/api'
import { firstAccessiblePath } from '@/router'

const router = useRouter()
const userStore = useUserStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  name: '',
  taxNo: '',
  taxpayerType: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  taxNo: [{ required: true, message: '请输入纳税人识别号', trigger: 'blur' }],
  taxpayerType: [{ required: true, message: '请选择纳税人类型', trigger: 'change' }],
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const company = await companyApi.create(form)
    // 创建成功后以创建者为所有者加入公司，切换签发带 companyId 的新令牌
    await userStore.switchCompany(company.id)
    ElMessage.success(`记账公司「${company.name}」创建成功`)
    await router.replace(firstAccessiblePath(userStore.profile?.permissions ?? []))
  } catch (error) {
    // 错误提示已在拦截器中统一处理
    console.warn('创建记账公司失败', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.setup-company {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #60a5fa 100%);
}

.setup-company__card {
  width: 460px;
  background: #fff;
  border-radius: 10px;
  padding: 32px 34px 26px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);
}

.setup-company__brand {
  text-align: center;
  margin-bottom: 22px;
}

.setup-company__logo {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 10px;
  background: var(--app-primary);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 1px;
}

.setup-company__title {
  margin: 0 0 6px;
  font-size: 20px;
  color: #111827;
}

.setup-company__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.setup-company__submit {
  width: 100%;
}
</style>
