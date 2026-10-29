# boki-market

BOKI 插件市场的**独立服务端**：已签名索引快照、插件分类浏览、插件下载、授权与管理接口，使用独立 SQLite 库，与财务主程序物理隔离。

> 初版已完成（v0.3.0，2026-10-27）：14 个官方插件源码已迁入 `plugins/`，签名索引、下载闸门、授权校验、统计审计与 `marketctl` 发布链均可用于生产部署；同时提供 Docker 容器化部署（根目录 `docker-compose-market.yml` + `docker/Dockerfile`）。

---

## 边界

| 项 | boki-market | financial（主仓库） |
|:--|:--|:--|
| 市场服务进程 | ✅ `server/` | ❌ 不运行 |
| 市场数据库 | ✅ 独立 `market.db`（WAL） | ❌ 不与 `financial.db` 共用 |
| 签名私钥 | ❌ 服务器永不持有 | ❌ 不入库 |
| 发布 CLI | ✅ `cli/`（开发机 / CI 用） | ❌ |
| 插件源码与构建链 | `plugins/` + `scripts/` | 插件业务运行时 |
| 客户端接入代码 | ❌ 不在这里 | ✅ `backend/src/plugins/`、前端市场页 |

三条硬规则（`npm run check` 强制检查）：

1. `server/` 与 `deploy/` 不出现任何签名私钥或 PEM 私钥；
2. `.env.example` 不包含 `PLUGIN_MARKET_PRIVATE_KEY`，服务端也不读取它；
3. `server/`、`cli/` 的相对导入不得越出 `boki-market/`，CLI 源码中不得出现真实 PEM 私钥。

---

## 快速开始（Node）

要求 **Node.js ≥ 22.5**（使用内置 `node:sqlite`，无第三方运行时依赖，无需 `npm install`）。

```bash
cd boki-market
cp .env.example .env          # Windows: copy .env.example .env
npm start                     # 默认 http://127.0.0.1:8789
```

验证：

```bash
curl http://127.0.0.1:8789/v1/health
# {"ok":true,...,"db":{"ok":true,"schemaVersion":"003_categories.sql"},
#  "snapshotStale":false,"snapshot":{"active":false,...},"marketId":"<uuid>"}

curl -i http://127.0.0.1:8789/v1/index
# HTTP/1.1 503 —— 尚未激活任何签名快照
```

其它命令：

```bash
npm run dev        # node --watch
npm run migrate    # 手工执行迁移（启动时也会自动执行）
npm run check      # 目录边界检查
node cli/marketctl.mjs --help
```

> `node:sqlite` 在 Node 22/24 仍会打印一条 `ExperimentalWarning`，属预期。

---

## Docker 部署

容器化部署由根目录的 `docker-compose-market.yml` 与 `docker/Dockerfile` 组成：Compose 只负责运行已构建的镜像，构建走独立脚本或手动 `docker build`。

```bash
cd boki-market
cp .env.example .env                                  # 按实际环境修改
docker build -f docker/Dockerfile -t boki-market:latest .   # 构建（或用 starts\生产环境-构建插件市场镜像.bat）
docker compose -f docker-compose-market.yml up -d           # 运行
curl http://127.0.0.1:8789/v1/health
```

- 构建上下文是项目根目录（`boki-market/`），Dockerfile 位于 `docker/Dockerfile`；单独构建：`docker build -f docker/Dockerfile -t boki-market:latest .`
- `docker-compose-market.yml` 放在 `boki-market/` 根目录，`env_file` 指向同目录 `.env`，因此 `docker compose -f docker-compose-market.yml up -d` 必须在 `boki-market/` 下执行。
- 容器内强制监听 `0.0.0.0`，宿主机只发布到 `127.0.0.1:8789`，对外统一走 nginx 反代（模板见 `deploy/nginx.conf`）。
- 数据库与制品存放在命名卷 `boki-market_market-db` / `boki-market_market-data`，升级容器不丢数据。
- 管理接口不鉴权，必须保持回环发布，并在 nginx 上对 `/v1/admin/` 限制来源 IP。
- 备份必须**库 + data 两个卷成套**：

```bash
docker run --rm \
  -v boki-market_market-db:/db -v boki-market_market-data:/data \
  -v "$PWD/backups:/backups" alpine:latest \
  sh -c 'tar czf /backups/market-$(date +%Y%m%d-%H%M%S).tar.gz -C / db data'
```

裸机部署仍可使用 `deploy/` 下的 systemd / nginx / backup 模板。

---

## 发布插件

`marketctl` 只在**开发机 / CI**运行，是唯一接触签名私钥的地方。

```bash
# 1) 生成发布密钥（只需一次）：公钥写入服务端 MARKET_PUBLIC_KEYS，私钥留本地 / CI secret
node cli/marketctl.mjs keygen --key-id key-1

# 2) 发布端环境变量（PowerShell 示例）
$env:MARKET_URL = 'https://market.example.com'
$env:PLUGIN_MARKET_PRIVATE_KEY = Get-Content 'dist/keys/key-1.private' -Raw
$env:PLUGIN_MARKET_KEY_ID = 'key-1'

# 3) 一条命令：打包 → 上传 → 上架 → 候选 → 本地签名 → 激活
node cli/marketctl.mjs publish --plugin banks --status published

# 发布前演练：只打包，不联网、不读私钥
node cli/marketctl.mjs publish --plugin banks --dry-run
```

分步链路：

```bash
node cli/marketctl.mjs pack      --plugin banks
node cli/marketctl.mjs release   --zip dist/plugins/banks-1.0.0.zip
node cli/marketctl.mjs candidate --out dist/candidate.json
node cli/marketctl.mjs sign      --raw dist/candidate.json
node cli/marketctl.mjs activate  --raw dist/candidate.json --signature-file dist/candidate.json.sig.json
```

授权：

```bash
node cli/marketctl.mjs license issue  --plugin banks --plan perpetual
node cli/marketctl.mjs license verify --key '<授权码>' --plugin banks
node cli/marketctl.mjs license revoke --id <授权记录 ID>
```

- 打包默认排除 `.ts / .tsx / .map / node_modules / .git / dist / 隐藏文件（含 .env）`；`manifest.id` 必须等于目录名。
- `pack` 会在 zip 旁写 `<zip>.json`（sha256、文件清单）；同版本换包由服务端 `409` 拒绝。
- `--json` 时 stdout 只有一行 JSON，进度走 stderr；退出码 `0` 成功 / `1` 运行期错误 / `2` 用法错误。

---

## 目录结构

```text
boki-market/
├── README.md                   # 唯一文档
├── package.json                # start / dev / migrate / marketctl / check
├── .env.example                # 配置样例（复制为 .env）
├── .dockerignore
├── docker-compose-market.yml   # 运行编排（只运行已构建镜像，env_file=./.env）
├── docker/                     # 镜像构建
│   └── Dockerfile
├── server/
│   ├── src/                    # main / routes / services / db / lib
│   └── migrations/             # 001_init / 002_domain / 003_categories
├── cli/                        # marketctl 发布 CLI
├── plugins/                    # 14 个官方插件源码（.ts 入库，编译产物 .js 不入库）
├── scripts/                    # build-client / build-server / dev-sync / check-boundary
├── deploy/                     # systemd / nginx / backup 裸机模板
├── data/                       # 运行时 zip 制品（不入库）
├── db/                         # 运行时 market.db（不入库）
├── dist/                       # 打包 / 候选 / 签名留档（不入库）
├── tsconfig.json
└── vite.plugin.config.mjs
```

---

## 接口

| 方法 | 路径 | 说明 |
|:--|:--|:--|
| GET | `/v1/health` | 库连通、迁移版本、快照版本/插件数、`snapshotStale`、`marketId` |
| GET | `/v1/index` | 无 active 快照 → 503；否则返回签名原文（ETag / 304），带 `X-Boki-Key-Id` / `X-Boki-Signature` |
| GET | `/v1/plugins/:id/download` | 索引白名单 + 授权闸门（402）+ 目录穿越防护 + 计数 |
| GET | `/v1/plugins/:id` | 激活索引里的插件详情（含分类） |
| POST | `/v1/license/verify` | 未配密钥 → 501；否则 HMAC 验签 + 查库 + 吊销/过期 |
| POST | `/v1/admin/plugins` | 新建/更新插件元数据 |
| PUT | `/v1/admin/plugins/:id/status` | 上架/下架/弃用；上架校验版本、主分类与制品 |
| PUT | `/v1/admin/plugins/:id/categories` | 设置主分类 + 副分类 |
| GET/POST | `/v1/admin/categories` | 分类列表（含计数）/ 新建 |
| PATCH/DELETE | `/v1/admin/categories/:id` | 改名/排序/可见性/父级；被引用 409、内置 403 |
| POST | `/v1/admin/releases` | 登记版本并上传 zip（`application/zip` 或 JSON + `zipBase64`） |
| GET | `/v1/admin/index/candidate` | 生成未签名候选（422 时指出具体插件） |
| POST | `/v1/admin/index/activate` | 公钥验签 + 单调性 + 库内一致性校验后激活 |
| POST | `/v1/admin/licenses` | 签发授权（明文只返回一次，库内只存哈希） |
| POST | `/v1/admin/licenses/:id/revoke` | 吊销授权 |
| GET | `/v1/admin/orders` / `stats` / `audit` | 订单、下载/收入统计、审计日志 |

`/v1/index` 返回签名快照的**原始字节**（不重排 JSON），ETag 按原始字节计算；下载只认索引登记过的 `(id, version)`。

---

## 配置

完整清单见 `.env.example`，常用项：

| 变量 | 默认 | 说明 |
|:--|:--|:--|
| `MARKET_HOST` | `127.0.0.1` | 监听地址；Docker Compose 内改为 `0.0.0.0` |
| `MARKET_PORT` | `8789` | 监听端口 |
| `MARKET_PUBLIC_BASE_URL` | `http://<host>:<port>` | 对外地址；`MARKET_REQUIRE_HTTPS=true` 时必须 `https://` |
| `MARKET_NAME` | `boki-official` | 索引里的 market 标识 |
| `MARKET_DB_FILE` | `./db/market.db` | 独立市场库；相对路径按项目根解析 |
| `MARKET_DATA_DIR` | `./data` | zip 制品目录 |
| `MARKET_MAX_UPLOAD_BYTES` | `67108864` | 单次 zip 上传上限（64 MiB） |
| `MARKET_LICENSE_SECRET` | 空 | 授权码 HMAC 密钥（收费期启用） |
| `MARKET_IP_HASH_SALT` | 空 | 统计脱敏盐（只存 IP 哈希） |
| `MARKET_PUBLIC_KEYS` | 空 | `keyId:<raw-base64>`，逗号分隔；服务端只验签 |
| `MARKET_RATE_LIMIT` | `120` | 每来源每分钟请求上限，`0` = 关闭 |
| `MARKET_TRUST_PROXY` | `false` | 置于 nginx 后开启；取 `X-Forwarded-For` 最后一个 |
| `MARKET_REQUIRE_HTTPS` | 生产为 `true` | 拒绝非 HTTPS 公共请求（回环健康检查除外） |
| `MARKET_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` / `silent` |

发布端（CLI）额外变量：`MARKET_URL`、`PLUGIN_MARKET_PRIVATE_KEY`、`PLUGIN_MARKET_KEY_ID`（默认 `key-1`）、`PLUGIN_MARKET_PLUGIN_ROOT`（默认 `plugins/`）、`PLUGIN_MARKET_DIST_DIR`（默认 `dist/`）。私钥只存在于开发机 / CI，永不写入服务器 `.env`。

---

## 数据库与迁移

- 库文件：`db/market.db`（WAL，追加 `-wal` / `-shm`），启动时自动建目录并迁移。
- 迁移文件：`server/migrations/NNN_name.sql`，按文件名顺序执行，单文件事务内执行、失败整体回滚；只追加，不改已应用文件。
- `market_meta` 保存 `market_id`、`schema_version`、`data_version`（影响索引的写操作 +1，用于 `snapshotStale`）。
- 业务表：`plugins` / `plugin_versions` / `index_snapshots` / `licenses` / `orders` / `download_events` / `audit_log` / `categories` / `plugin_categories`。
- 内置四大分类（功能 / 皮肤 / AI / 语言）；14 个插件在 `003_categories.sql` 中按 `manifest.kind` 回填。

---

## 安全约定

- 管理接口无内置鉴权：必须保持 `MARKET_HOST=127.0.0.1`（或 Docker 只发布回环端口），并在 nginx 对 `/v1/admin/` 做来源 IP 白名单。
- 服务端只持有验签公钥，签名私钥永不出现在服务器目录、镜像或环境变量中。
- 下载入口同时校验索引白名单、授权、路径穿越与限流。

---

## License

服务端代码：AGPL-3.0-or-later（与财务内核一致）；官方插件保持 Apache-2.0。
