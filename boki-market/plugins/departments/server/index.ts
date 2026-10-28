import { DepartmentsModule } from './modules/departments/departments.module'

export const module = DepartmentsModule

// 迁移过渡期：Department 仍由内核实体注册（凭证/期初/账簿等模块引用）。
export const entities = []
