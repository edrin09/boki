import { Injectable } from '@nestjs/common'
import type { ActionAdapter, ActionManifest } from './protocol'
import { VoucherCreateAction, VoucherModifyAction, VoucherApproveAction } from '../actions/voucher.action'
import { EmployeeCreateAction } from '../actions/employee.action'
import { PayrollRunAction } from '../actions/payroll.action'

/**
 * 动作注册表 = 白名单。
 *
 * 模型只能从这里选动作；不在表里的 action 一律拒绝（方案 §8）。
 * 新增能力只需注册一个适配器，协议与前端不用改。
 */
@Injectable()
export class ActionRegistry {
  private readonly adapters: Map<string, ActionAdapter>

  constructor(
    voucherCreate: VoucherCreateAction,
    voucherModify: VoucherModifyAction,
    voucherApprove: VoucherApproveAction,
    employeeCreate: EmployeeCreateAction,
    payrollRun: PayrollRunAction,
  ) {
    this.adapters = new Map(
      [voucherCreate, voucherModify, voucherApprove, employeeCreate, payrollRun].map((adapter) => [
        adapter.manifest.id,
        adapter as ActionAdapter,
      ]),
    )
  }

  manifests(): ActionManifest[] {
    return [...this.adapters.values()].map((adapter) => adapter.manifest)
  }

  get(id: string): ActionAdapter | undefined {
    return this.adapters.get(String(id ?? '').trim())
  }

  has(id: string): boolean {
    return this.adapters.has(String(id ?? '').trim())
  }
}
