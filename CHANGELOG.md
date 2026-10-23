# 更新日志（Changelog）

本项目所有显著变更将记录在本文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 提交信息遵循 Conventional Commits；后续接入 CI 从提交历史自动生成（见 roadmap）。
> 用户视角的变化请写在提交信息正文里——**每个 `feat:` / `fix:` 都会出现在这里**。

## [Unreleased]

### Added（新增）

- 开源化改造：AGPL-3.0 主许可 + 官方插件 Apache-2.0 双许可边界确立
- 赞助与社区体系文档（统一收口在 `.github/`）：`SPONSORS.md` / `GOVERNANCE.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `PRIVACY.md` / `TERMS.md` / `.github/FUNDING.yml`
- 品牌资产体系（logo / wordmark / 色板 / 品牌规范页）

### 沿革

- **1.x（闭源 / 内部阶段）**：复式记账内核、凭证与账簿、财务报表、多公司隔离、JWT + RBAC、本地 OCR / 流式语音识别、桌面离线安装包、官方插件 14 个。此阶段的细节版本未逐条记录，完整能力见官网「开发进度」页（`roadmap.html`）。

## [1.0.0] - 2026-10-22

首个对外打包的桌面版（内部编号，未公开发布）：

- Vue 3 前端 + NestJS 后端 + SQLite 单文件数据库
- Electron 桌面壳（Windows 优先，含 macOS / Linux 构建配置）
- 免环境安装包（自带运行时，断网可安装使用）
