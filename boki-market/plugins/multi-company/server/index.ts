import { MultiCompanyModule } from './modules/multi-company.module'

export const module = MultiCompanyModule

// sys_company / sys_user_company 属于内核保留 schema：
// 公司上下文、登录与权限判定在插件停用/卸载后仍需工作，因此不随插件走。
export const entities = []
