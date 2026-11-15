# 安全策略（Security Policy）

> BOKI 是离线优先的开源财务软件。我们认真对待每一个漏洞，特别是涉及**本地数据安全、认证授权、SQL 注入、任意文件读写**的问题。

## 支持的版本

| 版本 | 支持状态 |
|:--|:--|
| main 分支最新 Release | ✅ 安全修复只发在此（随下一个 Release 发布） |
| 旧版本 | ❌ 请升级到最新版 |

## 如何报告漏洞

**请不要在公开 Issue / Discussions / PR 里描述漏洞细节。**

推荐渠道（按优先级）：

1. **GitHub Private Vulnerability Reporting**（仓库 → Security → Report a vulnerability，私密且留痕）
2. 邮箱：[y_p09@163.com](mailto:y_p09@163.com)，标题加 `[Security]` 前缀，可附加密说明（协商 PGP 公钥）

报告请尽量包含：

- 影响版本 / 部署方式（桌面安装包 / Docker / 源码自建）
- 复现步骤（最小复现优先）
- 影响评估（能读到什么 / 能改什么 / 是否需要登录）
- 如有，修复建议

## 响应时限（目标值，非承诺上限）

| 阶段 | 目标 |
|:--|:--|
| 确认收到 | 72 小时内 |
| 初步评估与定级 | 7 天内 |
| 高危修复 | 30 天内发布补丁或临时规避方案 |
| 低危修复 | 随下一个功能版本发布 |
| 公开披露 | 修复发布后，与 reporter 协商一致时公开（默认连带致谢） |

## 范围（In Scope）

- `backend/`：认证（JWT）、RBAC 权限、SQL（SQLite）、文件上传与导入解析
- `frontend/`：XSS、越权操作、敏感信息泄露
- `desktop/`：Electron 配置（nodeIntegration / contextIsolation / 协议注册）、自动更新链路、安装包完整性
- 插件运行时：插件隔离边界、manifest 校验、插件可访问的 API 面
- 构建脚本与 CI：供应链（依赖注入、构建产物篡改）

## 范围外（Out of Scope）

- 对官方演示站点的扫描（如临时部署的演示环境，会明确标注"仅供演示，勿攻击"）
- 社会工程、_near 物理接触
- 对已明确文档化的"设计权衡"（例如：`DB_SYNCHRONIZE=true` 仅限开发模式）报漏洞——文档写明且默认关闭的不计
- 自行修改源码引入的安全问题

## 安全设计说明（供评估参考）

- **数据完全本地**：账务数据是 SQLite 单文件（`data/financial.db`），不出机器、无遥测、无埋点
- **整库加密**：SQLCipher 兼容整库加密默认开启、零配置；密钥文件 `vault.key` 与库分离，没有它拿到的 `.db` 只是密文。附件另有 AES-256-GCM 流式加密；备份与恢复强制校验密钥一致性
- **借贷强校验 + 已审核凭证禁改**：数据完整性在内核层校验，不依赖前端
- **认证**：JWT（默认 8h）+ RBAC（菜单级 + 操作级）
- **离线优先**：核心功能无任何第三方 SDK、无后台上报通道，攻击面天然收窄
- **插件沙箱边界**：插件能力由 manifest 声明、运行时按声明放行（详见插件开发文档）

### AI 边界（v1.4 起）

AI 在本项目中**不具备写入正式账目的能力**，这不是提示词约束，是代码结构约束：

| 机制 | 实现位置 | 约束方式 |
|:--|:--|:--|
| 草稿闸门 | `backend/src/modules/ai-bridge/landing.ts` | `landing` 白名单仅 `draft` / `list` / `archive`，**不存在 `direct`**。注册期 `assertLanding()` 未声明即抛错；运行期 `assertDraftOnly()` 递归扫描结果，出现 `approved` / `audited` / `paid` / `posted` 或 `autoApprove: true` 立即抛 `DraftGateViolation` |
| 一次性确认令牌 | `ai-bridge/token.store.ts` | 绑定「当前用户 + 载荷哈希 + 所属公司」，TTL 15 分钟；提交时校验归属，跨用户 / 跨公司 / 重放均拒绝；同一令牌重复提交幂等返回，不重复入账 |
| 只读 MCP | `backend/src/modules/mcp/mcp-tool.ts` | 工具契约的 `readOnly` 为字面量 `true`，注册表校验；只实现 `initialize` / `tools/list` / `tools/call` / `ping`，不开 SSE、不提供 `resources` / `prompts` / `sampling`；`GET /api/mcp` 明确返回 405 |
| 二次权限校验 | `mcp.controller.ts` · 各 `ActionAdapter` | 不信任模型侧的权限判断，调用时按当前用户权限码再校验一次 |
| 全程留痕 | `ai-bridge/audit.service.ts` | 每次 plan / commit 落审计表，含操作人、原话、动作、落点与结果 |

**模型与网络边界**：模型接入使用 OpenAI 兼容协议，地址与密钥由部署方自行配置。默认配置不含任何云端出口；一旦配置云端 API，出站流量由该配置唯一决定——这是部署方的主动选择，不是产品默认行为。

> 我们的表述纪律：说「默认零外传」，不说「绝对不泄露」。前者可验证，后者不可承诺。

## 致谢

安全贡献者会出现在 Release 公告与本文件致谢区（可匿名）。

<!-- 首个报告产生后在此列表化：姓名/ID · 发现 · 日期 -->
