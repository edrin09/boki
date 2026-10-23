# 贡献指南（Contributing Guide）

> 感谢你对 BOKI 感兴趣！本文告诉你：怎么搭环境、怎么提 PR、怎么写插件、以及我们需要遵守什么。
> **写插件是成本最低的贡献方式**——新票据版式解析器、新报表、新皮肤、新语言包都欢迎。

## 快速进Directory

| 你想做的事 | 看哪节 |
|:--|:--|
| 报 bug / 提需求 | [Issue 规范](#issue-规范) |
| 改代码 / 修 bug | [开发流程](#开发流程) |
| 写一个插件 | [插件贡献](#插件贡献) |
| 补文档 / 翻译 | 翻译指南（占位，`locale-en-US` 完善后单独成文） |
| 做 UI / 设计 | Issues 中 `good first issue: design` 标签 |
| 找个小事干 | [Good first issue](#good-first-issue) |

---

## 环境搭建

**技术栈**：前端 Vue 3 + Vite；后端 NestJS + TypeORM + SQLite；桌面 Electron。

```bash
# 前端
cd frontend && npm install && npm run dev

# 后端（自动建 SQLite 数据库与默认管理员 admin/123456，只用于开发）
cd backend && npm install && npm run start:dev

# 桌面端
cd desktop && npm install && npm run dev
```

**版本约束（重要）**：仓库在 CI 中固定 Node 版本（`better-sqlite3` 的 ABI 依赖特定 Node 版本），本地请与 CI 使用相同 Node 大版本，避免原生模块编译失败；Windows 下建议同时装 Visual Studio Build Tools。

详细部署文档见官网 `/docs`（上线后替换为链接）与各目录内 README。

---

## Issue 规范

| 类型 | 模板 | 放哪 |
|:--|:--|:--|
| Bug | `.github/ISSUE_TEMPLATE/bug_report.md` | GitHub Issues |
| 功能建议 | `.github/ISSUE_TEMPLATE/feature_request.md` | GitHub Issues |
| 插件想法 | 同 Feature，标题加 `[plugin]` | GitHub Issues |
| 使用问答 | GitHub Discussions（问题、建议、投票） | Discussions |

好的 bug 报告包含：版本 / 平台、复现步骤、期望 vs 实际、（界面问题）截图。**安全类问题不要走公开 Issue**，见 [SECURITY.md](./SECURITY.md)。

---

## 开发流程

### 分支

- `main` 稳定（受保护，PR 合入）
- `dev` 集成（可选，多改动并行时用）
- 功能分支：`feat/xxx`；修复：`fix/xxx`；文档：`docs/xxx`

### 提交信息（Conventional Commits）

```
feat(报表): 现金流量简表支持按季度切换
fix(凭证): 已审核凭证导出 Excel 少了制单人列
docs: 补充插件开发指南的 manifest 字段说明
```

- 类型：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `chore`
- CHANGELOG 由提交信息自动生成，**一行提交信息 = 一条更新日志**，所以请把"用户视角的变化"写清楚

### PR 要求

1. 先开 Issue 讨论（除非是 typo 级小修改），PR 关联 issue
2. 一个 PR 一个主题，不要夹带无关重构
3. 本地通过 `typecheck` 与测试再提；CI 会重跑一遍（安装、typecheck、断言测试、构建）
4. PR 描述按模板 `.github/PULL_REQUEST_TEMPLATE.md` 的检查清单来
5. 至少 1 个 Maintainer / Reviewer 批准后合并

### 代码风格

- 遵循各目录现有 ESLint / Prettier 配置，不要新引风格
- 后端入库的数据完整性逻辑（借贷平衡、余额计算）**必须服务端校验**，不要只靠前端
- 优先复用内核既有校验与工具函数；新能力讨论时优先考虑做成**插件**而不是塞进内核

### 许可约定（提交即代表认可）

- 你对**内核**的贡献按 AGPL-3.0 发布（与项目整体一致）
- 你对**官方插件 / plugin-sdk**的贡献按 Apache-2.0 发布
- 贡献者的名字与头像会用于贡献者墙展示（可要求匿名，发邮件或 issue 声明即可）

---

## 插件贡献

插件是 BOKI 生态的核心杠杆，也是新贡献者的最佳切入点。

**可以贡献的插件类型**：新票据 / 凭证版式解析器、新财务报表、行业模板（如电商 / 餐饮 / 工程项目账）、新皮肤主题、新语言包、对接器（税控 / 网银 / 电商 API）。

**起步**：

1. 阅读官网插件开发指南（`docs-plugin.html` → 域名上线后 `/docs/plugins`）
2. 用 `plugin-template` 脚手架生成骨架（`npx create-boki-plugin` 占位，随 SDK 发布）
3. manifest 声明能力，运行时按声明放行——**插件不要绕过声明能力直接碰内核内部**
4. 测试通过 + 按 `.finplugin` 打包后提 PR 或发布到插件市场（社区插件自选 MIT / Apache 许可）

**认证插件标识**：市场为通过审核的插件打「认证」标（审核只看安全与兼容性，跟赞助无关；黄金档赞助商的可选权益是"插件市场认证位展示权"，技术审核标准不放宽）。

---

## Good first issue

维护者会持续维护两类标签：

- `good first issue` —— 小而清晰，适合第一次贡献
- `help wanted` —— 稍复杂，但驱动明确

没有合适的也可以自己提 issue 或在 Discussions 里问"最近什么适合上手"。

---

## 行为

社区全部场合（Issues / PR / 社群 / 线下活动）遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 需要帮助？

- Discussions / Issues：技术问题首选
- [y_p09@163.com](mailto:y_p09@163.com)：合作、授权、无法公开讨论的问题
