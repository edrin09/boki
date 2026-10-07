# 简易财务软件（B/S 版）

一套面向小微企业的轻量财务系统，采用 **Vue 3 + NestJS + SQLite**，单命令启动，开箱即用。

- 记账方式：**复式记账**（借贷必相等，后端强校验）
- 报表：资产负债表、利润表（本期 + 本年累计）
- 权限：JWT 登录 + RBAC（菜单级 + 操作级）
- 数据库：SQLite 单文件，零配置，支持一键备份/恢复

---

## 一、快速开始

需要两个终端。

### 终端 1 — 后端（端口 3000）

```bash
cd backend
npm install
copy .env.example .env      # Windows；macOS/Linux 用 cp
npm run start:dev
```

首次启动会自动创建 `backend/data/financial.db`，并写入种子数据：
73 条权限、4 个角色、75 个中文会计科目、4 个默认用户。

离线 OCR 模型首次使用前需下载（约 25MB，放 `backend/models/ocr/`）：

```bash
npm run models:fetch
```

> 模型缺失时服务仍可正常启动（自动降级），仅「识别 / 票据上传 / 证件建档」相关功能会提示模型未就绪；`GET /api/ocr/status` 可查看就绪状态。

API 地址：<http://localhost:3000/api>

### 终端 2 — 前端（端口 5173）

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

## 二、功能清单

| 模块 | 功能 |
|:--|:--|
| 系统管理 | 用户管理、角色管理、权限管理（RBAC）、操作日志、数据备份/恢复、个人中心 |
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

---

## 三、核心会计规则

| 规则 | 实现说明 |
|:--|:--|
| 复式记账 | 每张凭证至少 2 条有效分录，`借方合计 = 贷方合计`，**前后端双重校验**，不平衡无法保存 |
| 同一行借贷互斥 | 单条分录不能同时有借方和贷方金额 |
| 明细科目限制 | 只能记在「明细科目」上，父级科目与非启用科目会被拒绝 |
| 辅助核算必填 | 科目声明了往来单位/部门/项目时，分录必须指定对应对象 |
| 审核控制 | 草稿 → 已审核 → 已作废；**已审核凭证禁止修改与删除**，需先反审核 |
| 单据联动 | 现金银行/往来核销/其他收支单据删除时，同步删除其生成的凭证 |
| 金额精度 | 全链路 `decimal(18,2)`，内部以「分」做整数运算，避免浮点误差 |
| 报表平衡 | 资产负债表差额 = 未结转的损益净额（系统不含期末结转功能） |

---

## 四、目录结构

```
financial-bs/
├── backend/                    # NestJS API
│   ├── data/                   # SQLite 数据库（运行时自动生成，不入版本库）
│   ├── scripts/reset-db.ts     # 数据库重置脚本
│   ├── test/smoke.mjs          # 冒烟测试 1：认证/凭证/账簿/RBAC
│   ├── test/smoke2.mjs         # 冒烟测试 2：期初/报表/资金往来/系统
│   └── src/
│       ├── common/             # 装饰器、守卫、拦截器、过滤器、工具
│       ├── config/             # 数据库与 JWT 配置
│       ├── db/                 # 种子数据
│       ├── entities/           # TypeORM 实体
│       └── modules/            # 业务模块（auth/users/roles/... /books /reports）
├── frontend/                   # Vue 3 前端
│   └── src/
│       ├── api/                # Axios 封装与接口定义
│       ├── components/         # 布局与通用组件
│       ├── composables/        # 分页列表等组合逻辑
│       ├── directives/         # v-permission / v-role
│       ├── router/              # 路由与菜单
│       ├── stores/             # Pinia
│       ├── styles/
│       ├── utils/              # 金额/日期格式化、Excel 导出
│       └── views/              # 38 个业务页面
├── desktop/                    # Electron 桌面壳（免环境安装包）
│   ├── src/                    # 主进程：sidecar 拉起 / 窗口 / 托盘
│   ├── scripts/build-package.mjs   # 一键打包编排
│   ├── electron-builder.yml    # NSIS 安装包配置
│   └── release/                # 安装包产物（不入版本库）
├── 产品介绍.md                  # 交付对象看的成品说明
├── 打包与更新指南.md             # 维护者看的打包与升级流程
└── README.md                   # 开发与部署技术说明
```

---

## 五、常用命令

### 后端（`backend/`）

| 命令 | 说明 |
|:--|:--|
| `npm run start:dev` | 开发模式（热重载） |
| `npm run build` | 生产构建 → `dist/` |
| `npm run start:prod` | 运行构建产物 |
| `npm run typecheck` | 类型检查 |
| `npm run db:reset -- --yes` | **清空并重置数据库** |
| `npm run test:smoke` | 冒烟测试 1（需先启动服务） |
| `npm run test:smoke2` | 冒烟测试 2（需全新数据库） |
| `npm run test:ocr` | OCR 识别验证（需模型已下载） |
| `npm run test:parsers` | 票据解析器验证（PDF 文本层 / OCR 双路径） |
| `npm run test:receipts` | 票据上传 / 去重 / 字段抽取验证（需 3000 端口） |
| `npm run test:extract` | 证件一键录入端到端验证（需 3000 端口） |
| `npm run test:reports` | P18 报表接口验证（需 3000 端口） |
| `npm run models:fetch` | 下载 OCR 模型到 `models/ocr/` |

### 前端（`frontend/`）

| 命令 | 说明 |
|:--|:--|
| `npm run dev` | 开发模式 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 本地预览构建产物 |

---

## 六、生产部署

### 方式一：免环境安装包（推荐，内部办公场景）

产出一个 `Setup.exe`，在**未装 Node、未装数据库、不能联网**的 Windows 机器上装完即用；那台机器同时充当局域网服务器，同事用浏览器访问即可。

```bash
cd desktop
npm run pack          # 产物：desktop/release/FinancialApp-Setup-1.0.0.exe
```

架构：Electron 壳负责窗口与托盘，后端以 `node.exe` 子进程方式拉起（sidecar），后端同时托管前端静态文件，因此**前后端同源、单端口 9300**，不需要 Nginx、不需要处理跨域。

数据落在 `C:\ProgramData\FinancialApp\`（安装目录对普通用户只读，SQLite 必须写可写目录）。完整流程、升级方式与排障见 [`打包与更新指南.md`](./打包与更新指南.md)。

### 方式二：传统服务器部署（自备 Linux/云主机）

```bash
# 1. 构建
cd backend  && npm install && npm run build
cd ../frontend && npm install && npm run build

# 2. 运行后端（推荐 PM2 常驻）
cd ../backend
npm i -g pm2
pm2 start dist/main.js --name financial-bs-api
pm2 save && pm2 startup

# 3. 托管前端静态文件
#    将 frontend/dist 交由 Nginx / Caddy 等静态服务器
#    并把 /api 反向代理到 http://127.0.0.1:3000
```

也可以让后端直接托管前端（与安装包同源模型一致），只需设 `WEB_DIST_DIR`：

```bash
WEB_DIST_DIR=../frontend/dist APP_PORT=3000 node dist/main.js
```

Nginx 参考配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/financial/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA 路由回退
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 生产环境注意事项

| 项 | 建议 |
|:--|:--|
| `JWT_SECRET` | **必须**改为随机强密钥。安装包由 Electron 首次启动自动生成并持久化，无需手工设置；方式二请自行配置 |
| `DB_SYNCHRONIZE` | 安装包固定为 `true`（升级后自动同步新增表/字段）；方式二建议设 `false` 并改用迁移 |
| `CORS_ORIGIN` | 同源部署（安装包）用 `*` 即可；方式二请设为具体域名 |
| `APP_PORT` | 安装包默认 `9300`（避开开发常用 3000），可在 `config.json` 中修改 |
| 数据备份 | 使用「系统管理 → 数据备份」页面，或直接复制数据库文件 |
| 恢复数据 | SQLite 运行中无法删除 WAL 文件，恢复后请**重启服务**使数据完全生效 |

---

## 七、验证清单（首次部署建议按此顺序检查）

1. 打开 <http://localhost:5173>，用 `admin / 123456` 登录
2. 「基础资料 → 会计科目」能看到 75 个预置科目，层级与辅助核算正确
3. 「基础资料 → 往来单位」新增一个客户
4. 「基础资料 → 期初余额」录入期初（如 库存现金 借 100000、实收资本 贷 100000）
5. 「账簿查询 → 试算平衡表」确认借贷平衡（绿色「借贷平衡」标签）
6. 「凭证管理 → 凭证录入」新增一张凭证，故意让借贷不等 → 应被拦截
7. 改成借贷相等并「保存并审核」
8. 「凭证管理 → 凭证列表」可审核/反审核/作废
9. 「账簿查询 → 总账 / 科目余额表」能看到刚才的记账
10. 「财务报表 → 资产负债表 / 利润表」正常生成
11. 「资金往来 → 现金银行」新增收款单 → 自动生成已审核凭证
12. 「资金往来 → 应收应付」查看余额并执行核销
13. 「系统管理 → 数据备份」创建备份并下载

### 扩展功能验证（P14–P19）

14. 「系统管理 → 公司信息」维护本公司纳税人识别号（方向判定依据）
15. 访问 `GET /api/ocr/status` → `ready: true`（断网环境下同样可用）
16. 「档案一键录入 → 往来单位」上传营业执照图片 → 四项建议值自动填充，批量建档成功
17. 「档案一键录入 → 员工」上传身份证图片 → 姓名/证件号自动填充
18. 「票据智能记账 → 票据列表」上传电子发票 PDF → 解析出类型/金额/税额/购销方
19. 同一文件再次上传 → 提示重复（sha256 去重）
20. 「票据智能记账 → 待确认工作台」确认票据 → 生成借贷平衡的凭证草稿，先进入「已确认」再可查账簿
21. 「票据智能记账 → 归类规则」新增规则并调整优先级
22. 「薪酬报销 → 工资表」导入 Excel 工资表 → 生成工资单草稿
23. 「财务报表 → 票据台账 / 现金流量简表 / 费用结构分析」按期间查询与导出
24. 「财务报表 → 一键月结」查看未结账事项提示；全部办结后生成月度报表包
25. 「工作台」首页经营看板展示本月收入/支出/现金余额/待确认票据提醒

### 回归验证（版本交付前建议全量执行）

后端须以 **Node 24.4.1** 启动于 3000 端口。`smoke / smoke2 / smoke3` 均依赖**凭证号从 0001 起算**，必须各自在全新数据库上执行，因此按两阶段进行：

```bash
cd backend

# 阶段一：全新数据库（每次 reset 后重启后端）
npm run test:smoke3      # 员工 / 报销 / 工资表 / 红冲 / 复制
npm run db:reset -- --yes   # ← 换新库
npm run test:smoke       # 认证 / 凭证 / 账簿 / RBAC
npm run db:reset -- --yes   # ← 换新库
npm run test:smoke2      # 期初 / 报表 / 资金往来 / 系统

# 阶段二：任一数据库上执行（receipts 会自行清理历史票据，可重复运行）
npm run test:ocr         # 离线 OCR 识别
npm run test:parsers     # 票据解析（PDF 文本层 / OCR 双路径）
npm run test:receipts    # 上传 / 去重 / 字段抽取
npm run test:extract     # 证件一键录入 + 批量建档
npm run test:reports     # P18 报表（台账 / 现金流 / 费用分析 / 月结 / 看板）
```

> 阶段一每个测试之间必须 `db:reset` 并重启后端（`reset-db.ts` 会删除数据库文件，重启时自动重建并写入种子数据）。
>
> Node 版本注意：better-sqlite3 预编译包对应 ABI 137（Node 24.4.1）。若 shell 中的 `node` 是其他版本（如 22），启动与测试会报 `NODE_MODULE_VERSION` 不匹配，请改用 `C:\Program Files\nodejs\node.exe` 全路径或调整 PATH。

---

## 八、技术栈

| 层 | 技术 |
|:--|:--|
| 前端 | Vue 3.5 + TypeScript + Vite 6 + Element Plus 2.9 + Pinia 2 + Vue Router 4 + Axios + xlsx + dayjs |
| 后端 | NestJS 11 + TypeScript + TypeORM 0.3 + better-sqlite3 + JWT + Passport + class-validator |
| 数据库 | SQLite（better-sqlite3 驱动，开启 WAL） |
| 离线识别 | onnxruntime-node + PP-OCRv4（det/cls/rec）、pdfjs-dist（PDF 文本层）、sharp / @napi-rs/canvas（图像处理） |
| 测试 | 自研端到端验证脚本（冒烟 + OCR + 解析 + 上传 + 建档 + 报表，200+ 项断言） |

---

## 九、已知边界

本版本定位为「小微企业日常记账」，以下功能**未包含**，可按需扩展：

- 期末结账与损益自动结转（当前报表差额 = 未结转损益，属预期行为；现金流量为简表口径，未按完整准则分项列示）
- 完整准则版现金流量表（已提供经营/投资/筹资三分法简表）
- 多账套 / 多公司 / 多币种
- 固定资产折旧、工资核算（当前为工资单草稿，不含个税/社保精算）、发票管理（票据为智能记账入口，非税控开票）
- 单据多级审批流
- OCR 仅覆盖增值税发票、收据、营业执照、身份证四类版式，其余票据类型走人工录入

建议的下一步迭代顺序：期末结转损益 → 完整现金流量表 → 固定资产 → 审批流。