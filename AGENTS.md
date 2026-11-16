# BOKI 开源财务软件

单品牌 BOKI，内核 AGPL-3.0 + 官方插件 Apache-2.0。单体仓库：`backend`（NestJS + TypeORM + SQLite）、`frontend`（Vue3 + Element Plus + Vite）、`desktop`（Electron，仅本地不入库）、`boki-market`（远程插件市场 + 14 个官方插件源码）、`website`/`docs`/`brand`（本地维护）。

## 环境
- **开发环境**：`D:\wwwroot\financial`（本仓库，改代码只在这里）。
- **生产环境**：`C:\ProgramData\BOKI`，含 `config.json`、`data`（SQLite 主库 + backup）、`logs`、`plugins`、`vault.key`。**禁止在开发调试时写入或覆盖该目录**；只有发布安装包后由用户实际运行才会用到。
- 启动/构建脚本在 `starts/`（开发启动、启动插件市场、清数据、构建市场镜像、生成安装包）。

## 硬约束
1. Node 必须用 24.4.1：`C:\Users\yuepeng\AppData\Local\Author Software\nvm\installs\v24.4.1\node.exe`（PATH 上的 node 22 跑 better-sqlite3/sharp 会 ABI 报错）。本机 curl 自测加 `--noproxy '*'`。
2. 构建用 `--emptyOutDir false`、`backend/nest-cli.json` 的 `deleteOutDir` 保持 `false`，避免安全策略中断清目录。内核重编译用 `tsc -p backend/tsconfig.json --incremental false`。
3. 插件唯一来源是远程市场：客户端不随包任何插件、无本地插件目录，缺 `PLUGIN_MARKET_URL`/`PLUGIN_MARKET_PUBLIC_KEYS` 一律报错，不加兜底。
4. 插件包禁止 import 内核组件（会把 AppLayout 等拖进产物）；同一模块类不得在两个父模块重复导入。
5. 数据访问走实体/仓库；改表结构与线上对齐。**恢复主库必须走 `backend/src/vault/pending-restore.ts` 的启动期换文件链路**，运行期不得直接 copy 覆盖主库（WAL 残留会导致库损坏）；恢复前安全备份用 `createBackupSnapshot`（VACUUM INTO）。

## 业务数据约定（财务口径，记账/对账必读）
- **唯一权威数据源 = 银行对账单**。生产账套「西安市未央区鹏云智码软件开发部」公户为**兴业银行（尾号6452）**，全量流水以此为准；凭证日期一律对齐银行流水**实际到账/付款日**，不按开票日、人为录入日。
- **对账单「用途/摘要」列写「劳务收入」的，实际是员工工资发放**（本账套仅两名员工：岳鹏、张亚飞）。银行转账时用途随手选的「劳务收入」≠ 劳务报酬，记账时按**工资**处理，冲「应付职工薪酬-工资（2211.01）」，勿按劳务费/劳务成本记。
- **银行存款不得出现负数**：银行不会垫钱给你，账面银行存款余额出现负数，一定是「收款漏记」或「付款多记/记错账户」。发现负数先比对对账单找漏记的收款，不要用「法人转存」去硬凑。
- **销售开票与收款是两笔凭证**：开票（借应收 / 贷收入+销项税）用开票日；收款（借银行 / 贷应收）用到账日。两者日期可相差 1 天属正常，勿合并。

## 提交前自检
类型检查通过 · 无调试残留（console.log/临时脚本） · 插件依赖方向未反转 · 数据库改动有迁移/兼容 · 生产目录 `C:\ProgramData\BOKI` 未被写入
