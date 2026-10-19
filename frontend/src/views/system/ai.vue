<template>
  <div class="page">
    <div class="page-card page-card--narrow">
      <div class="page-title">AI模型设置</div>
      <el-alert type="info" :closable="false" show-icon class="mb12"
        title="接入任意 OpenAI 兼容大模型接口后，语音助手与人工智能能力自动增强：自由说法的指令由模型理解，未接入或模型不可用时自动回退现有规则引擎，功能不受影响。" />
      <el-alert :type="ready ? 'success' : 'warning'" :closable="false" show-icon class="mb12"
        :title="ready
          ? `已接入：${providerName} · ${form.model}。说话更自由，回复更自然。`
          : '未接入大模型，语音助手按关键词匹配工作（现状）。可获取/自部署模型后在此开启。'" />

      <el-form ref="formRef" :model="form" label-width="110px">
        <el-form-item label="启用AI增强">
          <el-switch v-model="form.enabled" />
          <span class="form-hint">{{ form.enabled ? '已开启：接入后自动启用' : '已关闭：保持现状' }}</span>
        </el-form-item>

        <el-form-item label="厂商">
          <el-select v-model="form.provider" placeholder="选择厂商或自部署方式" style="width: 100%" @change="onProviderChange">
            <el-option v-for="p in providers" :key="p.id" :value="p.id"
              :label="`${p.name}${p.local ? '（本地）' : ''}`" />
          </el-select>
          <div v-if="preset?.remark" class="text-muted">{{ preset.remark }}</div>
        </el-form-item>

        <el-form-item label="接口地址" prop="baseURL">
          <el-input v-model="form.baseURL" placeholder="OpenAI 兼容 Base URL，如 https://api.deepseek.com/v1" />
          <div class="text-muted">系统会向该地址下的 /chat/completions 发起请求，结尾不需要带斜杠</div>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password autocomplete="new-password"
            :placeholder="hasKey ? `已保存（${apiKeyMasked}），留空保持不变` : (preset?.keyRequired ? '必填' : '本地部署可留空')" />
          <div class="text-muted">Key 只保存在本机数据库，不上传任何第三方（除你填写的厂商）</div>
        </el-form-item>

        <el-form-item label="模型名称" prop="model">
          <el-input v-model="form.model" placeholder="如 qwen-plus / deepseek-chat / qwen2.5:1.5b-instruct" />
        </el-form-item>

        <el-divider content-position="left">高级</el-divider>
        <el-form-item label="生成温度">
          <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.05" show-input style="max-width: 420px" />
          <div class="text-muted">财务场景建议低温（0~0.3），回答更稳定</div>
        </el-form-item>
        <el-form-item label="请求超时">
          <el-input-number v-model="form.timeoutMs" :min="3000" :max="60000" :step="1000" style="width: 200px" />
          <span class="unit">ms</span>
        </el-form-item>

        <el-form-item>
          <el-button :loading="testing" @click="onTest">
            <el-icon><Connection /></el-icon>测试连接
          </el-button>
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
import { type FormInstance } from 'element-plus'
import { Check, Connection } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { systemApi } from '@/api'
import { ok } from '@/composables/useList'

interface ProviderPreset {
  id: string
  name: string
  baseURL: string
  model: string
  keyRequired: boolean
  local: boolean
  remark?: string
}

const formRef = ref<FormInstance>()
const saving = ref(false)
const testing = ref(false)

const providers = ref<ProviderPreset[]>([])
const apiKeyMasked = ref<string | null>(null)

const form = reactive({
  provider: 'custom',
  baseURL: '',
  apiKey: '',
  model: '',
  enabled: false,
  temperature: 0.2,
  timeoutMs: 15000,
})

const preset = computed(() => providers.value.find((p) => p.id === form.provider))
const providerName = computed(() => preset.value?.name ?? form.provider)
const ready = computed(() => form.enabled && !!form.baseURL && !!form.model)
const hasKey = computed(() => Boolean(apiKeyMasked.value))

/** 切换厂商：预填该厂商的默认地址与模型（自定义不覆盖已填内容） */
function onProviderChange() {
  const p = preset.value
  if (!p || p.id === 'custom') return
  form.baseURL = p.baseURL
  form.model = p.model
}

async function load() {
  try {
    const data = await systemApi.aiConfig()
    providers.value = data?.providers ?? []
    form.provider = data?.provider ?? 'custom'
    form.baseURL = data?.baseURL ?? ''
    form.model = data?.model ?? ''
    form.enabled = Boolean(data?.enabled)
    form.temperature = data?.temperature ?? 0.2
    form.timeoutMs = data?.timeoutMs ?? 15000
    apiKeyMasked.value = data?.apiKeyMasked ?? null
  } catch {
    // 只读失败不阻断页面
  }
}

async function onSave() {
  await formRef.value?.validate()
  saving.value = true
  try {
    // 留空 = 保持原 Key；需要清空时按钮在输入框保持空即可（后端以空串清除仅当显式传入空串，
    // 这里传 undefined 保持不变；先清除 Key 的场景少见，重新保存新 Key 即覆盖）
    await systemApi.saveAiConfig({
      provider: form.provider,
      baseURL: form.baseURL,
      model: form.model,
      enabled: form.enabled,
      temperature: form.temperature,
      timeoutMs: form.timeoutMs,
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    })
    form.apiKey = ''
    await load()
    ok('AI模型设置已保存')
  } finally {
    saving.value = false
  }
}

async function onTest() {
  if (!form.baseURL || !form.model) {
    ElMessage.warning('请先填写接口地址和模型名称')
    return
  }
  testing.value = true
  try {
    // 未保存的表单内容先落库再测，保证测的就是保存的
    await onSave()
    const result = await systemApi.testAi()
    ElMessage.success(`连接成功：${result.model}，耗时 ${result.latencyMs}ms`)
  } catch {
    // 错误信息由全局拦截器提示
  } finally {
    testing.value = false
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
  line-height: 1.6;
}
.form-hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
