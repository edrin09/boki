<template>
  <div class="page">
    <div class="page-card page-card--narrow">
      <div class="page-title">公司信息</div>
      <el-alert type="info" :closable="false" show-icon class="mb12"
        :title="`此处维护的是当前记账公司「${companyName}」的信息。多公司记账时，各公司的信息相互独立；需要新建或切换公司请使用顶部公司切换器。`" />
      <el-alert type="info" :closable="false" show-icon class="mb12"
        title="用于票据方向判定：系统用本公司的纳税人识别号比对发票购销方，从而区分「进项发票」与「销项发票」（本公司=销售方记销项、收到钱；本公司=购买方记进项、付出钱）。未填写时无法判断进项/销项方向，发票将无法自动生成凭证，请务必填写。" />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="form.companyName" maxlength="100" placeholder="营业执照上的公司全称" />
        </el-form-item>
        <el-form-item label="纳税人识别号" prop="taxNo">
          <el-input v-model="form.taxNo" maxlength="30" placeholder="统一社会信用代码 / 纳税人识别号" />
        </el-form-item>

        <el-divider content-position="left">税务口径</el-divider>
        <el-alert type="info" :closable="false" show-icon class="mb12"
          title="纳税人类型决定增值税申报方式：小规模按征收率计算应纳税额；一般纳税人按销项减进项分税率申报。此处选择会影响后续「纳税申报」的算税口径。" />

        <el-form-item label="纳税人类型" prop="taxpayerType">
          <el-radio-group v-model="form.taxpayerType" @change="onTaxpayerTypeChange">
            <el-radio-button value="small_scale">小规模纳税人</el-radio-button>
            <el-radio-button value="general">一般纳税人</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.taxpayerType === 'small_scale'" label="征收率" prop="vatRate">
          <el-input-number v-model="form.vatRate" :min="0" :max="100" :precision="2" :step="1" style="width: 200px" />
          <span class="unit">%</span>
        </el-form-item>
        <el-form-item v-else label="增值税" prop="vatRate">
          <span class="text-muted">一般纳税人按 13% / 9% / 6% 等分税率归集发票后申报，无需设置统一征收率</span>
        </el-form-item>
        <el-form-item label="申报周期" prop="taxDeclareCycle">
          <el-radio-group v-model="form.taxDeclareCycle">
            <el-radio-button value="month">按月申报</el-radio-button>
            <el-radio-button value="quarter">按季申报</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-divider content-position="left">AI 自动记账</el-divider>
        <el-alert type="info" :closable="false" show-icon class="mb12"
          title="开启后，上传票据识别成功且置信度达标时，系统自动生成借贷平衡的凭证草稿。你只需核对后点一次「确认入账」即可入账，低于阈值的单据会留给你人工判断。" />

        <el-form-item label="自动生成凭证" prop="autoPostEnabled">
          <el-switch v-model="form.autoPostEnabled" :active-value="1" :inactive-value="0" />
          <span class="form-hint">{{ form.autoPostEnabled ? '已开启：上传即生成草稿' : '已关闭：仅识别，不自动建凭证' }}</span>
        </el-form-item>
        <el-form-item v-if="form.autoPostEnabled === 1" label="置信度阈值" prop="autoPostThreshold">
          <el-slider v-model="form.autoPostThreshold" :min="0.5" :max="0.99" :step="0.01" show-input
            :format-tooltip="(v: number) => `${(v * 100).toFixed(0)}%`" style="max-width: 420px" />
          <div class="text-muted">
            建议 80%。调高更保守（更多单据转人工），调低更自动（错账风险更高）。
          </div>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { type FormInstance, type FormRules } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { systemApi } from '@/api'
import { ok } from '@/composables/useList'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({
  companyName: '',
  taxNo: '',
  taxpayerType: 'small_scale' as string,
  vatRate: 3 as number | null,
  taxDeclareCycle: 'month' as string,
  autoPostEnabled: 1,
  autoPostThreshold: 0.8,
})

/** 当前记账公司名称：新建/改名后头部切换器同步显示 */
const companyName = computed(() => userStore.companyName || '未选择公司')

const rules: FormRules = {
  companyName: [{ max: 100, message: '公司名称过长', trigger: 'blur' }],
  taxNo: [{ max: 30, message: '纳税人识别号过长', trigger: 'blur' }],
}

/** 切到一般纳税人时征收率不再适用 */
function onTaxpayerTypeChange(val: string | number | boolean | undefined) {
  if (val === 'general') form.vatRate = 0
  else if (!form.vatRate) form.vatRate = 3
}

async function load() {
  try {
    const data = await systemApi.company()
    form.companyName = data?.companyName ?? ''
    form.taxNo = data?.taxNo ?? ''
    form.taxpayerType = data?.taxpayerType ?? 'small_scale'
    form.vatRate = data?.vatRate ?? (form.taxpayerType === 'small_scale' ? 3 : 0)
    form.taxDeclareCycle = data?.taxDeclareCycle ?? 'month'
    form.autoPostEnabled = data?.autoPostEnabled ?? 1
    form.autoPostThreshold = data?.autoPostThreshold ?? 0.8
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
      taxpayerType: form.taxpayerType,
      vatRate: form.vatRate ?? undefined,
      taxDeclareCycle: form.taxDeclareCycle,
      autoPostEnabled: form.autoPostEnabled,
      autoPostThreshold: form.autoPostThreshold,
    })
    // 名称变化需同步顶部切换器显示
    await userStore.fetchProfile()
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
.unit {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}
.text-muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.form-hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
