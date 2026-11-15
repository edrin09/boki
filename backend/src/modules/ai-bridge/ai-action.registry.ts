import { Injectable, Logger } from '@nestjs/common'
import type { ActionAdapter, ActionManifest } from './protocol'
import { assertLanding } from './landing'

/**
 * 动作注册表（W2：动态注册）。
 *
 * 模型只能从这里选动作；不在表里的 action 一律拒绝。
 * 与改造前的区别：不再由构造器注入若干具体类，而是任何模块在 `onModuleInit`
 * 里 `register()` 自己的适配器——新增动作不必改内核，也不必互相 import。
 *
 * 注册是幂等的：同 id 重复注册以先到为准并告警（多插件撞 id 时先注册者生效）。
 */
@Injectable()
export class AiActionRegistry {
  private readonly logger = new Logger('AiActionRegistry')
  private readonly adapters = new Map<string, ActionAdapter>()

  register(adapter: ActionAdapter): void {
    const manifest: ActionManifest | undefined = adapter?.manifest
    const id = String(manifest?.id ?? '').trim()
    if (!id) throw new Error('动作注册失败：manifest.id 为空')
    if (!manifest.permission) throw new Error(`动作「${id}」未声明 permission，注册已拒绝`)
    // 草稿闸门第一道：landing 必须显式声明且合法，未声明即注册失败
    assertLanding({ ...manifest, id })

    if (this.adapters.has(id)) {
      this.logger.warn(`动作「${id}」已注册，忽略重复注册（以先到为准）`)
      return
    }
    this.adapters.set(id, adapter)
    this.logger.log(`已注册动作 ${id}（landing=${manifest.landing}）`)
  }

  registerAll(adapters: ActionAdapter[]): void {
    for (const adapter of adapters) this.register(adapter)
  }

  /** 动作清单：实时读注册表，不做缓存（跨插件注册顺序不影响） */
  manifests(): ActionManifest[] {
    return [...this.adapters.values()].map((adapter) => adapter.manifest)
  }

  get(id: string): ActionAdapter | undefined {
    return this.adapters.get(String(id ?? '').trim())
  }

  has(id: string): boolean {
    return this.adapters.has(String(id ?? '').trim())
  }

  /** 已注册动作数（status 接口用） */
  get size(): number {
    return this.adapters.size
  }
}
