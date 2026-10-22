<template>
  <div :class="['vault-unlock', variant === 'page' ? 'vault-unlock--page' : 'vault-unlock--overlay']">
    <div v-if="variant === 'page'" class="vault-unlock__brand">
      <img class="vault-unlock__logo" src="/boki-mark.svg" alt="BOKI" />
      <h1 class="vault-unlock__title">BOKI · 数据已加密</h1>
      <p class="vault-unlock__subtitle">输入主密码解锁本地数据库后即可继续使用</p>
    </div>

    <div class="vault-unlock__card">
      <template v-if="migrating">
        <el-result icon="warning" title="数据库正在迁移中">
          <template #sub-title>
            <div class="vault-unlock__manual">
              检测到未完成的加密迁移，为保护数据已拒绝访问。<br />
              请在后端目录执行 <code>npm run vault:recover</code> 完成恢复。
            </div>
          </template>
        </el-result>
      </template>

      <template v-else>
        <h2 class="vault-unlock__heading">
          <el-icon><Lock /></el-icon>
          解锁加密数据
        </h2>
        <p class="vault-unlock__hint">
          {{ mode === 'password' ? '请输入主密码解锁' : '请输入恢复码解锁（忘记主密码时使用）' }}
        </p>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          class="vault-unlock__error"
        />

        <el-form size="large" @keyup.enter="onSubmit">
          <el-form-item v-if="mode === 'password'">
            <el-input
              v-model="password"
              type="password"
              placeholder="主密码"
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
              placeholder="恢复码（26 位字符，可含短横线）"
              clearable
            >
              <template #prefix><el-icon><Tickets /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              class="vault-unlock__submit"
              :loading="posting"
              @click="onSubmit"
            >
              解 锁
            </el-button>
          </el-form-item>
        </el-form>

        <div v-if="hasRecovery" class="vault-unlock__alt">
          <el-link type="primary" :underline="false" @click="toggleMode">
            {{ mode === 'password' ? '使用恢复码解锁' : '返回主密码解锁' }}
          </el-link>
        </div>

        <div v-if="mode === 'recovery'" class="vault-unlock__note">
          恢复码解锁后，请进入「数据加密」设置重新设置主密码并更新恢复码。
        </div>
      </template>
    </div>

    <div v-if="variant === 'page'" class="vault-unlock__foot">
      忘记主密码且没有恢复码 = 数据无法恢复 · 请牢记主密码
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 加密解锁页（内核内置，方案 §11）。
 *
 * 必须放在内核而不是插件：M4/M5 场景下插件可能被停用甚至删除，
 * 但「解锁」这条最基本链路永远要可用（方案 D1 判定标准）。
 *
 * - variant="page"    由 main.ts 在应用挂载前单独渲染（库已加密且锁定时）
 * - variant="overlay" 由 App.vue 在收到 423（进程内锁定）时作为遮罩渲染
 *
 * 解锁成功后统一重载页面：让 boot 流程重新判断，正常进入完整应用。
 */
import { onMounted, ref } from 'vue'
import { Lock, Key, Tickets } from '@element-plus/icons-vue'

const props = defineProps<{
  /** page：独立页面；overlay：全屏遮罩 */
  variant?: 'page' | 'overlay'
}>()

const variant = props.variant ?? 'page'

interface VaultStatus {
  enabled: boolean
  locked: boolean
  migrating: boolean
  hasRecovery: boolean
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const password = ref('')
const recoveryCode = ref('')
const mode = ref<'password' | 'recovery'>('password')
const posting = ref(false)
const error = ref('')
const migrating = ref(false)
const hasRecovery = ref(false)

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

/** 表单里只填一种凭据 */
function onSubmit(): void {
  if (posting.value || migrating.value) return
  void submit()
}

async function submit(): Promise<void> {
  error.value = ''
  const payload =
    mode.value === 'password'
      ? { password: password.value }
      : { recoveryCode: recoveryCode.value }
  if (mode.value === 'password' && !password.value) {
    error.value = '请输入主密码'
    return
  }
  if (mode.value === 'recovery' && !recoveryCode.value.trim()) {
    error.value = '请输入恢复码'
    return
  }

  posting.value = true
  try {
    const resp = await fetch(`${API_BASE}/vault/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await resp.json().catch(() => null)
    if (!resp.ok || body?.code !== 0) {
      error.value = body?.message || `解锁失败（HTTP ${resp.status}）`
      return
    }

    // 引导壳 → Nest 交接存在 50~300ms 端口空窗（方案 §5.3），
    // 轮询 status 直到确认解锁生效，再重载页面进入完整应用。
    const ok = await waitUntilUnlocked()
    if (!ok) {
      error.value = '已提交解锁，但服务尚未就绪，请稍候刷新重试'
      return
    }
    window.location.reload()
  } catch (err) {
    error.value = (err as Error)?.message || '网络异常，请检查后端服务'
  } finally {
    posting.value = false
  }
}

/** 轮询 /vault/status 直到 locked=false（或超时） */
async function waitUntilUnlocked(): Promise<boolean> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const status = await fetchStatus()
      if (!status.locked && !status.migrating) return true
    } catch {
      // 端口交接空窗 / Nest 启动中：继续等待
    }
    await sleep(400)
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
    // 没配恢复码时不要露出「使用恢复码」入口（避免无效分支）
    if (!status.hasRecovery) mode.value = 'password'
  } catch {
    // 状态查询失败不阻塞表单：等待用户提交后由 unlock 结果反馈
  }
})
</script>

<style scoped lang="scss">
.vault-unlock {
  &--page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #312e81 100%);
  }
}

.vault-unlock__brand {
  text-align: center;
  margin-bottom: 26px;

  .vault-unlock__logo {
    width: 52px;
    height: 52px;
    margin: 0 auto 12px;
    display: block;
  }

  .vault-unlock__title {
    margin: 0 0 6px;
    font-size: 20px;
    color: #e2e8f0;
  }

  .vault-unlock__subtitle {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
  }
}

.vault-unlock__card {
  width: 400px;
  max-width: calc(100vw - 40px);
  background: #fff;
  border-radius: 10px;
  padding: 30px 34px 26px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);
}

.vault-unlock__heading {
  margin: 0 0 6px;
  font-size: 18px;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 6px;
}

.vault-unlock__hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

.vault-unlock__error {
  margin-bottom: 14px;
}

.vault-unlock__submit {
  width: 100%;
}

.vault-unlock__alt {
  text-align: center;
  margin-top: 2px;
}

.vault-unlock__note {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #fdf6ec;
  color: #92400e;
  font-size: 12px;
  line-height: 1.6;
}

.vault-unlock__manual {
  font-size: 13px;
  line-height: 1.8;
  color: #4b5563;

  code {
    padding: 1px 6px;
    border-radius: 4px;
    background: #f3f4f6;
    color: #b91c1c;
  }
}

.vault-unlock__foot {
  margin-top: 24px;
  font-size: 12px;
  color: #64748b;
}
</style>
