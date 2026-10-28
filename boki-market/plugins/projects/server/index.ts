import { ProjectsModule } from './modules/projects/projects.module'

export const module = ProjectsModule

// 迁移过渡期：Project 由内核实体注册（凭证/期初余额等内核模块引用它）。
// 实体归属随最终批次迁入插件后，再改为 [Project]。
export const entities = []
