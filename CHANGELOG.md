# 更新日志（Changelog）

本项目所有显著变更将记录在本文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 提交信息遵循 Conventional Commits；后续接入 CI 从提交历史自动生成（见 roadmap）。
> 用户视角的变化请写在提交信息正文里——**每个 `feat:` / `fix:` 都会出现在这里**。

## [Unreleased]

### Changed（调整）

- **插件只有一个来源：远程插件市场**。删除本地插件目录模式（`BOKI_MARKETPLACE_DIR`、随包 `marketplace/`）与对应接口（`GET /api/market/catalog`、`POST /api/market/plugins/:id/install`），前端插件页只认 `/market/remote/*`
- 远程市场去掉一切兜底：不再写/读本地索引缓存（断源降级、`degraded`、`source: 'cache'` 全部移除），未配置公钥不再「跳过验签」，硬依赖在索引里找不到直接报错而不是退回本地目录——配置或网络问题当场暴露
- 桌面安装包**不再预置任何插件**：随包插件种子、随包市场目录、启动时铺载与官方插件同步全部删除；打包改为把根 `.env` 的 `PLUGIN_MARKET_URL` / `PLUGIN_MARKET_PUBLIC_KEYS` 生成到 `desktop/src/marketplace.js` 随包出厂
- 新装客户端插件目录为空，插件一律由用户自己在「插件市场」安装（Web 端与桌面端一致）

### Removed（移除）

- 源码树瘦身：移除内部端到端验证脚本、调试探针与临时抓包文件，仓库只保留内核与官方插件源码
- 插件编译产物（`.js` / `client/style.css`）不再入库，改由 `boki-market` 构建脚本按需生成
- 清理未被引用的模块与声明（`auth.guard`、`operator` 类型、`enums` 编译残留、两个未调用的私有方法等）

### Added（新增）

- 打包脚本强制校验出厂配置：缺市场地址/公钥直接失败；产物里残留随包插件目录也直接失败
- 打包产物校验改为「零插件 + 登录/建账 → 市场安装 → 重启 → OCR/票据识别」全链路

- 开源化改造：AGPL-3.0 主许可 + 官方插件 Apache-2.0 双许可边界确立
- 赞助与社区体系文档（统一收口在 `.github/`）：`SPONSORS.md` / `GOVERNANCE.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `PRIVACY.md` / `TERMS.md` / `.github/FUNDING.yml`
- 品牌资产体系（logo / wordmark / 色板 / 品牌规范页）
- 插件市场后端 boki-market：已签名索引快照、授权下载、发布管理（marketctl）

### 沿革

- **1.x（闭源 / 内部阶段）**：复式记账内核、凭证与账簿、财务报表、多公司隔离、JWT + RBAC、本地 OCR / 流式语音识别、桌面离线安装包、官方插件 14 个。此阶段的细节版本未逐条记录，完整能力见官网「开发进度」页（`roadmap.html`）。

## [1.0.0] - 2026-10-22

首个对外打包的桌面版（内部编号，未公开发布）：

- Vue 3 前端 + NestJS 后端 + SQLite 单文件数据库
- Electron 桌面壳（Windows 优先，含 macOS / Linux 构建配置）
- 免环境安装包（自带运行时，断网可安装使用）
