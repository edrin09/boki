-- =====================================================================
-- 001_init.sql — P0：建立市场元信息表（迁移框架的最小可验证落点）
--
-- P1 将新增 002_domain.sql，建立接入说明 3 的业务表：
--   plugins / plugin_versions / index_snapshots / licenses / orders
--   download_events / audit_log
-- 迁移只追加、不修改已应用的文件（schema_migrations 以文件名记版本）。
-- =====================================================================

CREATE TABLE market_meta (
  key        TEXT PRIMARY KEY,          -- schema_version / market_id / active_snapshot_id …
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
