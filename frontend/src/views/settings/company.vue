<template>
  <div class="page">
    <div class="page-card page-card--narrow">
      <div class="page-title">公司信息</div>
      <el-alert type="info" :closable="false" show-icon class="mb12"
        title="用于票据方向判定：系统用本公司的纳税人识别号比对发票购销方，从而区分「进项发票」与「销项发票」。未填写时进项/销项判断不精确，但仍可按默认模板生成费用凭证。" />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="form.companyName" maxlength="100" placeholder="营业执照上的公司全称" />
        </el-form-item>
        <el-form-item label="纳税人识别号" prop="taxNo">
          <el-input v-model="form.taxNo" maxlength="30" placeholder="统一社会信用代码 / 纳税人识别号" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">
            <el-icon><Check /></el-icon>保存
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { type FormInstance, type FormRules } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { ok } from '@/composables/useList'

const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({ companyName: '', taxNo: '' })

const rules: FormRules = {
  companyName: [{ max: 100, message: '公司名称过长', trigger: 'blur' }],
  taxNo: [{ max: 30, message: '纳税人识别号过长', trigger: 'blur' }],
}

async function load() {
  try {
    const data = await systemApi.company()
    form.companyName = data?.companyName ?? ''
    form.taxNo = data?.taxNo ?? ''
  } catch {
    // 接口只读，失败不阻断页面
  }
}

async function onSave() {
  await formRef.value?.validate()
  saving.value = true
  try {
    await systemApi.saveCompany({
      companyName: form.companyName || undefined,
      taxNo: form.taxNo || undefined,
    })
    ok('公司信息已保存')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-card--narrow {
  max-width: 720px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}
.mb12 {
  margin-bottom: 12px;
}
</style>
