<template>
  <div class="vault-convert vault-convert--page">
    <div class="vault-convert__brand">
      <img class="vault-convert__logo" src="/boki-mark.svg" alt="BOKI" />
      <h1 class="vault-convert__title">BOKI · 旧版加密库升级</h1>
      <p class="vault-convert__subtitle">一次性转换为主密钥文件模式，转换后主密码/恢复码立即失效</p>
    </div>

    <div class="vault-convert__card">
      <h2 class="vault-convert__heading">
        <el-icon><Switch /></el-icon>
        转换为 vault.key
      </h2>
      <p class="vault-convert__hint">
        检测到旧版主密码加密的数据库。升级必须完成本次转换，否则系统无法启动。
        请输入一次原主密码（或恢复码）以解出原主密钥，随后密钥将保存到：
      </p>
      <p class="vault-convert__path">{{ keyFile }}</p>

      <el-alert
        v-if="migrating"
        title="该库上次加密迁移未完成，本次转换会自动恢复并完成加密"
        type="warning"
        show-icon
        :closable="false"
        class="vault-convert__error"
      />

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="vault-convert__error"
      />

      <el-form size="large" @keyup.enter="onSubmit">
        <el-form-item v-if="mode === 'password'">
          <el-input
            v-model="password"
            type="password"
            placeholder="原主密码"
            show-password
            clearable
            autofocus
          >
            <template #prefix><el-icon><Key /></el-icon></template>
          </el-input>
        </el-form-item>

        <el-form-item v-else>
          <el-input
            v-model="recoveryCode"
            placeholder="原恢复码（26 位字符，可含短横线）"
            clearable
          >
            <template #prefix><el-icon><Tickets /></el-icon></template>
          </el-input>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            class="vault-convert__submit"
            :loading="posting"
            @click="onSubmit"
          >
            开始转换
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="hasRecovery" class="vault-convert__alt">
        <el-link type="primary" :underline="false" @click="toggleMode">
          {{ mode === 'password' ? '使用原恢复码转换' : '返回主密码转换' }}
        </el-link>
      </div>

      <div class="vault-convert__note">
        转换只更换密钥的保存方式，不会改写账套数据。
        转换完成后请备份 <code>vault.key</code> —— 没有它数据库将无法打开。
      </div>
    </div>

    <div class="vault-convert__foot">
      主密码/恢复码仅用于本次升级；转换后系统只认 vault.key
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 旧版主密码库的一次性转换页（内核内置）。
 *
 * 由 `main.ts` 在应用启动前判定：`GET /vault/status` 返回 `legacy: true`
 * 时先渲染本页。转换成功后引导壳退出、Nest 接管端口，页面轮询到
 * `legacy: false` 后重载进入完整应用。
 *
 * 这是系统里**唯一**还会出现主密码/恢复码输入的地方，仅用于升级，
 * 转换完成后不会再出现。
 */
import { onMounted, ref } from 'vue'
import { Key, Switch, Tickets } from '@element-plus/icons-vue'

interface VaultStatus {
  enabled: boolean
  legacy: boolean
  migrating: boolean
  hasRecovery?: boolean
  keyFile: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const password = ref('')
const recoveryCode = ref('')
const mode = ref<'password' | 'recovery'>('password')
const posting = ref(false)
const error = ref('')
const migrating = ref(false)
const hasRecovery = ref(false)
const keyFile = ref('程序根目录\\vault.key')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchStatus(): Promise<VaultStatus> {
  const resp = await fetch(`${API_BASE}/vault/status`, { headers: { Accept: 'application/json' } })
  const body = await resp.json()
  if (!resp.ok || body?.code !== 0) {
    throw new Error(body?.message || `查询状态失败（HTTP ${resp.status}）`)
  }
  return body.data as VaultStatus
}

function onSubmit(): void {
  if (posting.value) return
  void submit()
}

async function submit(): Promise<void> {
  error.value = ''
  if (mode.value === 'password' && !password.value) {
    error.value = '请输入原主密码'
    return
  }
  if (mode.value === 'recovery' && !recoveryCode.value.trim()) {
    error.value = '请输入原恢复码'
    return
  }

  const payload =
    mode.value === 'password'
      ? { password: password.value }
      : { recoveryCode: recoveryCode.value }

  posting.value = true
  try {
    const resp = await fetch(`${API_BASE}/vault/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await resp.json().catch(() => null)
    if (!resp.ok || body?.code !== 0) {
      error.value = body?.message || `转换失败（HTTP ${resp.status}）`
      return
    }

    // 引导壳 → Nest 交接存在端口空窗，轮询到 legacy=false 再重载
    const ok = await waitUntilConverted()
    if (!ok) {
      error.value = '转换已完成，但服务尚未就绪，请稍候刷新页面'
      return
    }
    window.location.reload()
  } catch (err) {
    error.value = (err as Error)?.message || '网络异常，请检查后端服务'
  } finally {
    posting.value = false
  }
}

/** 轮询 /vault/status 直到转换态消失（或超时） */
async function waitUntilConverted(): Promise<boolean> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const status = await fetchStatus()
      if (!status.legacy) return true
    } catch {
      // 端口交接 / Nest 启动中：继续等待
    }
    await sleep(500)
  }
  return false
}

function toggleMode(): void {
  mode.value = mode.value === 'password' ? 'recovery' : 'password'
  error.value = ''
}

onMounted(async () => {
  try {
    const status = await fetchStatus()
    migrating.value = !!status.migrating
    hasRecovery.value = !!status.hasRecovery
    if (status.keyFile) keyFile.value = status.keyFile
    if (!status.hasRecovery) mode.value = 'password'
  } catch {
    // 状态查询失败不阻塞表单，提交后由接口结果反馈
  }
})
</script>

<style scoped lang="scss">
.vault-convert {
  &--page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #312e81 100%);
  }
}

.vault-convert__brand {
  text-align: center;
  margin-bottom: 26px;

  .vault-convert__logo {
    width: 52px;
    height: 52px;
    margin: 0 auto 12px;
    display: block;
  }

  .vault-convert__title {
    margin: 0 0 6px;
    font-size: 20px;
    color: #e2e8f0;
  }

  .vault-convert__subtitle {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
  }
}

.vault-convert__card {
  width: 460px;
  max-width: calc(100vw - 40px);
  background: #fff;
  border-radius: 10px;
  padding: 30px 34px 26px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);
}

.vault-convert__heading {
  margin: 0 0 6px;
  font-size: 18px;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 6px;
}

.vault-convert__hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--app-text-secondary, #6b7280);
}

.vault-convert__path {
  margin: 0 0 16px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f3f4f6;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  color: #b91c1c;
  word-break: break-all;
}

.vault-convert__error {
  margin-bottom: 14px;
}

.vault-convert__submit {
  width: 100%;
}

.vault-convert__alt {
  text-align: center;
  margin-top: 2px;
}

.vault-convert__note {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #fdf6ec;
  color: #92400e;
  font-size: 12px;
  line-height: 1.7;

  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: #fff7e6;
  }
}

.vault-convert__foot {
  margin-top: 24px;
  font-size: 12px;
  color: #64748b;
}
</style>
