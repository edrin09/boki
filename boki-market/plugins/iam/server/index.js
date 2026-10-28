"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const iam_module_1 = require("./modules/iam.module");
exports.module = iam_module_1.IamModule;
// 用户 / 角色 / 权限表（sys_*）属于内核保留 schema：
// 登录、守卫与权限解析在插件停用/卸载后仍需工作，因此不随插件走。
exports.entities = [];
