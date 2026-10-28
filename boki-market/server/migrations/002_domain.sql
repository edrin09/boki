-- =====================================================================
-- 002_domain.sql — P1：市场业务表（表单见接入说明 3）
--
-- 本迁移只建表与索引，不写业务数据：
--   plugins / plugin_versions / index_snapshots / licenses / orders
--   download_events / audit_log
--
-- 相对设计基线的增量（P1 实现需要，向前兼容）：
--   index_snapshots.content_hash  签名快照原始字节的 SHA-256（十六进制）
--   index_snapshots.data_version  激活时库内数据版本，用于 /v1/health 的 snapshotStale
--   index_snapshots.plugin_count  激活时下发的插件数量
--   plugins / index_snapshots 的 CHECK 约束，防止非法状态写入
--
-- 迁移只追加、不修改已应用的文件（schema_migrations 以文件名记版本）。
-- =====================================================================

-- 插件主体（上下架状态在这里）
CREATE TABLE plugins (
  id             TEXT PRIMARY KEY,                 -- ^[a-z0-9][a-z0-9-]*$
  name           TEXT NOT NULL,
  description    TEXT,
  trust          TEXT NOT NULL DEFAULT 'community', -- official/verified/community
  license        TEXT,                              -- Apache-2.0 / proprietary …
  price          INTEGER NOT NULL DEFAULT 0,       -- 分；0 = 免费
  currency       TEXT NOT NULL DEFAULT 'CNY',
  license_url    TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',    -- draft/published/hidden/deprecated
  latest_version TEXT,                              -- 当前对外版本（发布版本时更新）
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (price >= 0),
  CHECK (status IN ('draft', 'published', 'hidden', 'deprecated')),
  CHECK (trust IN ('official', 'verified', 'community'))
);
CREATE INDEX idx_plugins_status ON plugins(status, updated_at);

-- 版本与制品（一个版本一行，不可覆盖）
CREATE TABLE plugin_versions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id      TEXT NOT NULL REFERENCES plugins(id),
  version        TEXT NOT NULL,                    -- semver
  api_version    TEXT NOT NULL,
  engines_json   TEXT,
  sha256         TEXT NOT NULL,                    -- zip 完整性
  size           INTEGER NOT NULL,
  zip_path       TEXT NOT NULL,                    -- 相对 MARKET_DATA_DIR 的路径
  signature      TEXT,                             -- manifest 包级签名（base64）
  published_at   TEXT NOT NULL,
  revoked_at     TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (plugin_id, version),
  CHECK (size >= 0),
  CHECK (download_count >= 0)
);
CREATE INDEX idx_versions_plugin ON plugin_versions(plugin_id, published_at);
CREATE INDEX idx_versions_sha ON plugin_versions(sha256);

-- 对外索引快照（签名后才可激活）
CREATE TABLE index_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  version      INTEGER NOT NULL,                   -- 快照版本，单调递增
  published_at TEXT NOT NULL,
  raw          BLOB NOT NULL,                      -- index.json 原始字节（验签对象）
  signature    TEXT NOT NULL,                      -- detached Ed25519 签名（base64）
  key_id       TEXT NOT NULL,                      -- 轮换期区分公钥
  status       TEXT NOT NULL DEFAULT 'candidate',  -- candidate/active/superseded
  content_hash TEXT,                               -- raw 的 SHA-256（十六进制）
  data_version INTEGER NOT NULL DEFAULT 0,         -- 激活时的 market_meta.data_version
  plugin_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  CHECK (version > 0),
  CHECK (status IN ('candidate', 'active', 'superseded'))
);
CREATE UNIQUE INDEX idx_snapshot_active ON index_snapshots(status) WHERE status = 'active';
CREATE UNIQUE INDEX idx_snapshot_version ON index_snapshots(version);

-- 授权（收费期；免费插件不写）
CREATE TABLE licenses (
  id          TEXT PRIMARY KEY,                    -- 授权记录 ID
  key_hash    TEXT NOT NULL UNIQUE,                -- 授权码 SHA-256，不存明文
  plugin_id   TEXT NOT NULL REFERENCES plugins(id),
  plan        TEXT NOT NULL,                       -- perpetual/subscription
  status      TEXT NOT NULL DEFAULT 'active',      -- active/revoked/expired
  order_id    TEXT,
  buyer_ref   TEXT,                                -- 外部买家标识（邮箱哈希 / 租户 ID）
  issued_at   TEXT NOT NULL,
  expires_at  TEXT,                                -- NULL = 永久
  revoked_at  TEXT,
  CHECK (status IN ('active', 'revoked', 'expired')),
  CHECK (plan IN ('perpetual', 'subscription'))
);
CREATE INDEX idx_licenses_plugin ON licenses(plugin_id, status);

CREATE TABLE orders (
  id           TEXT PRIMARY KEY,
  plugin_id    TEXT NOT NULL,
  license_id   TEXT,
  amount       INTEGER NOT NULL,                   -- 分
  currency     TEXT NOT NULL DEFAULT 'CNY',
  status       TEXT NOT NULL DEFAULT 'pending',    -- pending/paid/refunded/closed
  provider     TEXT,                               -- 手动/微信/支付宝/Stripe
  provider_ref TEXT,
  buyer_ref    TEXT,
  created_at   TEXT NOT NULL,
  paid_at      TEXT,
  CHECK (amount >= 0),
  CHECK (status IN ('pending', 'paid', 'refunded', 'closed'))
);
CREATE INDEX idx_orders_plugin ON orders(plugin_id, created_at);
CREATE INDEX idx_orders_status ON orders(status, created_at);

-- 下载事件（脱敏统计）
CREATE TABLE download_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id  TEXT NOT NULL,
  version    TEXT NOT NULL,
  license_id TEXT,
  ip_hash    TEXT,
  ua         TEXT,
  status     INTEGER NOT NULL,                     -- 200/402/404/409/500
  created_at TEXT NOT NULL
);
CREATE INDEX idx_download_events_plugin_time ON download_events(plugin_id, created_at);
CREATE INDEX idx_download_events_time ON download_events(created_at);

-- 管理审计
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,                        -- admin / system
  action     TEXT NOT NULL,                        -- release.create / index.activate / license.revoke …
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_log_time ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at);

-- 数据版本：任何会影响索引内容的写操作都会 +1；
-- 激活快照时记录当时的版本，/v1/health 据此判断 snapshotStale。
INSERT INTO market_meta (key, value, updated_at)
VALUES ('data_version', '1', datetime('now'))
ON CONFLICT(key) DO NOTHING;
