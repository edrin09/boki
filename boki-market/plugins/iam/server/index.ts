import { IamModule } from './modules/iam.module'

export const module = IamModule

// 用户 / 角色 / 权限表（sys_*）属于内核保留 schema：
// 登录、守卫与权限解析在插件停用/卸载后仍需工作，因此不随插件走。
export const entities = []
