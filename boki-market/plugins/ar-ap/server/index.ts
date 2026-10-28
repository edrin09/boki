import { ArApModule } from './modules/ar-ap/ar-ap.module'

export const module = ArApModule

// 迁移过渡期：WriteOff 由内核实体注册，迁完实体后再改为 [WriteOff]。
export const entities = []
