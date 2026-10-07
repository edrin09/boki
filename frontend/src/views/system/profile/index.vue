<template>
  <div class="page">
    <el-row :gutter="12">
      <el-col :xs="24" :md="10">
        <el-card shadow="never" header="个人信息">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="登录账号">{{ profile?.username }}</el-descriptions-item>
            <el-descriptions-item label="姓名">{{ profile?.nickname }}</el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag v-for="r in profile?.roleNames ?? []" :key="r" size="small" class="tag">
                {{ r }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="权限数">{{ profile?.permissions?.length ?? 0 }}</el-descriptions-item>
            <el-descriptions-item label="上次登录">
              {{ formatDateTime(profile?.lastLoginAt) || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14">
        <el-card shadow="never" header="修改密码">
          <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" style="max-width: 460px">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="form.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="form.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="form.confirmPassword" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="onSubmit">保存修改</el-button>
              <el-button @click="reset">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { formatDateTime } from '@/utils/format'

const userStore = useUserStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const profile = ref(userStore.profile)

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_r, value: string, cb) => {
        if (value !== form.newPassword) cb(new Error('两次输入的密码不一致'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

function reset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  formRef.value?.clearValidate()
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.changePassword(form.oldPassword, form.newPassword)
    ElMessage.success('密码修改成功，请重新登录')
    window.location.href = '/login'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (userStore.profile) {
    profile.value = userStore.profile
    return
  }
  profile.value = await userStore.fetchProfile()
})
</script>

<style scoped lang="scss">
.tag {
  margin-right: 6px;
}
</style>