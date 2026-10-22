<p align="center">
  <img src="brand/boki-lockup.svg" width="380" alt="BOKI — 开源财务软件" />
</p>

<h1 align="center">BOKI — 开源财务软件，像搭积木一样记账</h1>

<p align="center">
  <strong>复式记账内核 · 插件化 · 离线私有化 · AI 会计员</strong>
</p>

<p align="center">
  <a href="https://github.com/boki-app/boki/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-4F46E5.svg" alt="License: AGPL v3" /></a>
  <img src="https://img.shields.io/badge/官方插件-14-0EA5E9.svg" alt="plugins 14" />
  <img src="https://img.shields.io/badge/Vue-3.5-42b883.svg" alt="Vue 3.5" />
  <img src="https://img.shields.io/badge/NestJS-11-e0234e.svg" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/SQLite-003B57.svg?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-64748B.svg" alt="platform" />
</p>

<p align="center">
  <a href="https://github.com/boki-app/boki">GitHub</a> ·
  <a href="https://gitee.com/boki-app/boki">码云镜像</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-插件化架构">插件</a> ·
  <a href="#️-赞助">赞助</a>
</p>

---

## BOKI 是什么

BOKI 是一套面向小微企业的**开源财务软件**：前端 Vue 3 + 后端 NestJS + SQLite 单文件数据库，单命令启动，开箱即用。

内核只保留记账必需的**复式记账引擎**（科目、凭证、期初、公司上下文），其余能力全部**插件化**——想要什么功能装什么插件，不装的插件在界面里不留一丝痕迹。数据全部留在本机，配合本地 OCR，**断网也能用，数据不出机器**。

- 记账方式：**复式记账**（借贷必相等，后端强校验）
- 报表：资产负债表、利润表（本期 + 本年累计）、票据台账、现金流量简表、费用结构分析
- 权限：JWT 登录 + RBAC（菜单级 + 操作级）
- 多公司：一个账号可管理多家记账公司，数据完全隔离，顶部一键切换
- 数据库：SQLite 单文件，零配置，支持一键备份/恢复

---

## ✨ 核心特性

| | 特性 | 说明 |
|:--|:--|:--|
| 📒 | **复式记账强校验** | 每张凭证至少 2 条分录，借方合计 = 贷方合计，前后端双重校验，不平衡无法保存；明细科目限制、辅助核算必填 |
| 🧩 | **插件化架构** | 后端业务模块 29 → 8，前端页面 45 → 18；14 个官方插件覆盖档案/资金/薪酬/票据/报表/AI/语音/IAM/多公司，系统内一键安装、停用、卸载 |
| 🔒 | **离线私有化** | SQLite 单文件 + 本地 OCR（PP-OCRv4）+ 本地语音模型，内网/断网环境完整可用，财务数据不出机器 |
| 🏢 | **多公司隔离** | 所有业务表带 `company_id`，仓储层自动追加过滤；令牌内 `companyId` 由服务端签名保证不可伪造 |
| 🧾 | **票据智能记账** | 上传电子发票 PDF / 扫描件，自动解析类型、金额、税额、购销方；sha256 去重、归类规则、待确认工作台，确认后自动生成凭证 |
| 🤖 | **AI 会计员** | AI 插件提供模型配置（本地/云端），语音插件支持自然语言操作，悬浮入口即问即答 |
| 💻 | **一键安装包** | Electron 桌面壳 + NestJS sidecar，产出单个 `BOKI-Setup.exe`；未装 Node、未装数据库、不能联网的 Windows 机器装完即用，同机即局域网服务器 |
| 📊 | **报表与导出** | 资产负债表 / 利润表 / 科目余额表 / 试算平衡表 / 票据台账 / 月度报表包，支持导出 Excel |

---

## 🚀 快速开始

### 方式一：免环境安装包（推荐，内部办公场景）

产出一个 `BOKI-Setup-1.0.0.exe`，在**未装 Node、未装数据库、不能联网**的 Windows 机器上装完即用；那台机器同时充当局域网服务器，同事用浏览器访问即可。

```bash
cd desktop
npm run pack          # 产物：desktop/release/BOKI-Setup-1.0.0.exe
```

架构：Electron 壳负责窗口与托盘，后端以 `node.exe` 子进程方式拉起（sidecar），后端同时托管前端静态文件，**前后端同源、单端口 9300**，不需要 Nginx、不需要处理跨域。数据落在 `C:\ProgramData\BOKI\`（安装目录对普通用户只读，SQLite 必须写可写目录）。

### 方式二：源码运行（开发 / 自备服务器）

需要两个终端。

**终端 1 — 后端（端口 3000）**

```bash
cd backend
npm install
copy .env.example .env      # Windows；macOS/Linux 用 cp
npm run start:dev
```

首次启动会自动创建 `backend/data/financial.db`，并写入种子数据：1 家默认记账公司、80+ 条权限、4 个角色、75 个中文会计科目、4 个默认用户。

离线 OCR 模型首次使用前需下载（约 25MB，放 `backend/models/ocr/`）：

```bash
npm run models:fetch
```

> 模型缺失时服务仍可正常启动（自动降级），仅「识别 / 票据上传 / 证件建档」相关功能会提示模型未就绪；`GET /api/ocr/status` 可查看就绪状态。

**终端 2 — 前端（端口 5173）**

```bash
cd frontend
npm install
npm run dev
```

访问 <http://localhost:5173>，Vite 已把 `/api` 代理到后端，无需处理跨域。

### 默认账号

| 角色 | 账号 | 密码 | 说明 |
|:--|:--|:--|:--|
| 超级管理员 | `admin` | `123456` | 全部权限 |
| 会计 | `accountant` | `123456` | 凭证、账簿、报表、基础资料 |
| 出纳 | `cashier` | `123456` | 现金银行、往来核销、其他收支 |
| 查看员 | `viewer` | `123456` | 只读账簿与报表 |

> 首次登录后请尽快在「系统管理 → 个人中心」修改密码。

---

## 🧩 插件化架构

内核 = 复式记账引擎 + 插件运行时 + 插件市场。其余功能都是插件：

| 插件 | 能力 |
|:--|:--|
| `banks` | 资金账户（库存现金 / 银行存款） |
| `departments` | 部门档案 |
| `projects` | 项目档案与辅助核算 |
| `cash-bank` | 收款 / 付款 / 转账，自动生成凭证 |
| `bank-stmt` | 银行流水导入与核对 |
| `ar-ap` | 应收 / 应付余额查询与往来核销 |
| `income-expense` | 其他收入 / 其他支出单据 |
| `fixed-expense` | 固定费用（房租、折旧计划等） |
| `hr` | 员工档案、报销单、借款单、工资表 |
| `receipts` | 票据智能记账（上传 / 解析 / 去重 / 归类 / 待确认工作台） |
| `ocr` | 离线 OCR 引擎（PP-OCRv4）与票据解析器 |
| `report-pack` | 资产负债表、利润表、票据台账、现金流量、费用分析、一键月结、经营看板 |
| `ai` | AI 模型配置（本地 / 云端） |
| `voice` | 语音助手（自然语言记账查询） |
| `iam` | 用户 / 角色 / 权限管理面 |
| `multi-company` | 记账公司管理与成员授权 |

- 安装 / 停用 / 卸载：系统内「系统管理 → 插件」页面，或调用插件市场 API
- 插件源码：`marketplace/plugins/<id>/`，manifest 声明路由 / 菜单 / 插槽 / 权限
- 零插件状态下内核仍可完成「登录 → 建账套 → 记账」完整闭环
- 开发自己的插件：见 [`docs/插件开发与迁移指南.md`](./docs/插件开发与迁移指南.md)

---

## 📦 功能清单

| 模块 | 功能 |
|:--|:--|
| 记账公司 | 多公司建账、公司成员授权、顶部一键切换、各公司数据完全隔离 |
| 系统管理 | 用户管理、角色管理、权限管理（RBAC）、操作日志、数据备份/恢复、个人中心、插件管理 |
| 基础资料 | 会计科目（多级树 + 辅助核算）、往来单位、资金账户、部门、项目、公司信息 |
| 期初设置 | 按年度 + 科目 + 辅助核算录入期初余额，一键试算平衡 |
| 凭证管理 | 复式记账凭证录入（借贷强校验）、草稿/审核/反审核/作废、凭证号按月连续 |
| 现金银行 | 收款 / 付款 / 转账 / 费用报销 / 其他收入，自动生成记账凭证 |
| 应收应付 | 应收 / 应付余额查询（按往来单位）、往来核销与撤销（支持部分核销） |
| 其他收支 | 其他收入 / 其他支出单据，自动生成记账凭证 |
| 账簿查询 | 总账、明细账（按辅助核算分组）、科目余额表、试算平衡表 |
| 财务报表 | 资产负债表、利润表（本期 + 本年累计）、票据台账、现金流量简表、费用结构分析、一键月结、经营看板，支持导出 Excel / 月度报表包 |
| 薪酬报销 | 员工管理、报销单、工资表（Excel/CSV 导入、图片表格 OCR、工资单草稿） |
| 票据智能记账 | 票据上传与解析（PDF 文本层/扫描件 OCR）、发票去重、归类规则、待确认工作台、确认后自动生成凭证 |
| 档案一键录入 | 上传营业执照/身份证离线 OCR，批量填充往来单位与员工表单 |
| 离线 OCR | PP-OCRv4（det/cls/rec）本地推理，断网可用，`/ocr/status` 探活 |
| 数据维护 | SQLite 备份、下载、恢复；操作日志清理 |

### 核心会计规则

| 规则 | 实现说明 |
|:--|:--|
| 公司隔离 | 所有业务表带 `company_id`；仓储层自动追加过滤条件，令牌内 `companyId` 由服务端签名保证不可伪造 |
| 复式记账 | 每张凭证至少 2 条有效分录，`借方合计 = 贷方合计`，**前后端双重校验**，不平衡无法保存 |
| 同一行借贷互斥 | 单条分录不能同时有借方和贷方金额 |
| 明细科目限制 | 只能记在「明细科目」上，父级科目与非启用科目会被拒绝 |
| 辅助核算必填 | 科目声明了往来单位/部门/项目时，分录必须指定对应对象 |
| 审核控制 | 草稿 → 已审核 → 已作废；**已审核凭证禁止修改与删除**，需先反审核 |
| 单据联动 | 现金银行/往来核销/其他收支单据删除时，同步删除其生成的凭证 |
| 金额精度 | 全链路 `decimal(18,2)`，内部以「分」做整数运算，避免浮点误差 |
| 报表平衡 | 资产负债表差额 = 未结转的损益净额（系统不含期末结转功能） |

---

## 🧪 测试

自研端到端验证脚本（250+ 项断言），全部通过：

```bash
cd backend
npm run test:smoke       # 认证 / 凭证 / 账簿 / RBAC（需全新数据库）
npm run test:smoke2      # 期初 / 报表 / 资金往来 / 系统（需全新数据库）
npm run test:smoke3      # 员工 / 报销 / 工资表 / 红冲（需全新数据库）
npm run test:companies   # 多公司隔离：切换 / 隔离 / 越权 / 授权
npm run test:plugins     # 插件生命周期 109 项断言：安装 / 停用 / 卸载 / 依赖保护
npm run test:ocr         # 离线 OCR 识别（需模型已下载）
npm run test:parsers     # 票据解析（PDF 文本层 / OCR 双路径）
npm run test:receipts    # 票据上传 / 去重 / 字段抽取
npm run test:extract     # 证件一键录入端到端
npm run test:reports     # 报表接口（台账 / 现金流 / 费用分析 / 月结 / 看板）
```

> `smoke / smoke2 / smoke3` 依赖凭证号从 0001 起算，必须各自在全新数据库上执行（之间跑 `npm run db:reset -- --yes` 并重启后端）。

---

## 🛠 技术栈

| 层 | 技术 |
|:--|:--|
| 前端 | Vue 3.5 + TypeScript + Vite 6 + Element Plus 2.9 + Pinia 2 + Vue Router 4 + Axios + xlsx + dayjs |
| 后端 | NestJS 11 + TypeScript + TypeORM 0.3 + better-sqlite3 + JWT + Passport + class-validator |
| 数据库 | SQLite（better-sqlite3 驱动，开启 WAL） |
| 离线识别 | onnxruntime-node + PP-OCRv4（det/cls/rec）、pdfjs-dist（PDF 文本层）、sharp / @napi-rs/canvas（图像处理） |
| 桌面壳 | Electron + electron-builder（NSIS 安装包） |
| 插件系统 | manifest 驱动的运行时（后端动态 AppModule + 前端路由/菜单/插槽），`.finplugin` 分发格式 |
| 测试 | 自研端到端验证脚本（冒烟 + OCR + 解析 + 上传 + 建档 + 报表 + 多公司隔离 + 插件生命周期） |

---

## 📁 目录结构

```text
boki/
├── backend/                    # NestJS API（内核：记账引擎 + 插件运行时 + 插件市场）
│   ├── data/                   # SQLite 数据库（运行时自动生成，不入版本库）
│   ├── models/ocr/             # 离线 OCR 模型（npm run models:fetch 获取）
│   ├── scripts/reset-db.ts     # 数据库重置脚本
│   ├── test/                   # 端到端验证脚本（10 个）
│   └── src/
│       ├── common/             # 装饰器、守卫、拦截器、过滤器、工具
│       │   └── company/        # 多公司：请求上下文、隔离仓储、作用域拦截器
│       ├── config/             # 数据库与 JWT 配置
│       ├── db/                 # 种子数据
│       ├── entities/           # TypeORM 实体
│       ├── modules/            # 内核业务模块（auth/setup/plugins/...）
│       └── plugins/            # 后端插件运行时（manifest 校验 / loader / 动态 AppModule）
├── frontend/                   # Vue 3 前端
│   └── src/
│       ├── api/                # Axios 封装与接口定义
│       ├── components/         # 布局与通用组件
│       ├── composables/        # 分页列表等组合逻辑
│       ├── directives/         # v-permission / v-role
│       ├── plugins/            # 前端插件运行时（路由 / 菜单 / 插槽 / 静态资产注入）
│       ├── router/             # 路由与菜单
│       ├── stores/             # Pinia
│       ├── styles/
│       ├── utils/              # 金额/日期格式化、Excel 导出
│       └── views/              # 内核页面
├── desktop/                    # Electron 桌面壳（免环境安装包）
│   ├── src/                    # 主进程：sidecar 拉起 / 窗口 / 托盘
│   ├── scripts/build-package.mjs   # 一键打包编排
│   ├── electron-builder.yml    # NSIS 安装包配置
│   └── release/                # 安装包产物（不入版本库）
├── marketplace/                # 官方插件市场（14 个插件源码 + catalog）
│   ├── index.json              # 插件目录
│   └── plugins/<id>/           # 每个插件：manifest.json + server/ + client/
├── brand/                      # 品牌资产（logo / 色板 / 商标材料）
├── docs/                       # 插件化改造方案、插件开发指南、开发进度
├── website/                    # 官网（PC / 移动自适应静态站）
├── starts/                     # Windows 一键脚本（启动 / 打包 / 清数据）
└── README.md
```

---

## 🗺 路线图

本版本定位「小微企业日常记账」，已知边界与下一步：

- 期末结账与损益自动结转（当前报表差额 = 未结转损益，属预期行为）
- 完整准则版现金流量表（已提供经营/投资/筹资三分法简表）
- 固定资产折旧、工资核算个税/社保精算
- 单据多级审批流
- 插件 SDK 独立发布（`@boki/plugin-sdk`）与社区插件模板
- 官网与文档中英双语

建议的迭代顺序：期末结转损益 → 完整现金流量表 → 固定资产 → 审批流 → 插件 SDK 开放。

---

## ❤️ 赞助

BOKI 靠社区支持持续维护。赞助不影响技术决策、不换取代码投票权。

- [GitHub Sponsors](https://github.com/sponsors/boki-app)（个人 / 企业月度）
- Open Collective（企业赞助，可开票，账本透明）
- 爱发电 / 微信 / 支付宝（国内个人小额捐赠）

> 档位与权益、开票说明见 `SPONSORS.md`（随赞助通道开通后发布）。企业赞助通常需要可开票主体，欢迎通过 hello@boki.app 联系。

---

## 💬 社区

- GitHub Issues / Discussions：问题、建议、投票
- 码云镜像：国内快速克隆（GitHub 访问慢时可用）
- 贡献方式：欢迎通过 Issue 提交建议；写插件是成本最低的贡献（开发指南见 [`docs/插件开发与迁移指南.md`](./docs/插件开发与迁移指南.md)）

---

## 📄 License

- **内核**（`backend/` `frontend/` `desktop/`）：[AGPL-3.0](./LICENSE) —— 防止云厂商白嫖，财务数据场景强 copyleft
- **官方插件**（`marketplace/plugins/`）：Apache-2.0 —— 促生态，社区可自由复用
- 社区插件可自选许可（MIT / Apache 等），但调用内核 API 需遵守内核许可

品牌资产（logo / 商标）见 [`brand/知识产权与商标方案.md`](./brand/知识产权与商标方案.md)，**不属于**开源许可范围。
