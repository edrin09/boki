-- =====================================================================
-- 003_categories.sql — P1：分类表、内置四大类、现有 15 个插件回填
--
-- 分类只是市场侧展示元数据，不参与安装、加载、依赖与权限判断。
-- 回填规则（接入说明 4）：
--   manifest.kind ∈ {ai, ocr} → ai
--   其余（domain / report / platform / 未知）→ function
-- 回填只执行一次；之后以数据库为准，不再读取 manifest.kind。
--
-- 插件行以 draft 状态入库（尚无版本，P6 迁入源码并发布版本后再上架），
-- 这样 P1 的迁移、查询、分类管理都能在真实数据上验证，且不会产生
-- 「已上架但没有版本」的坏索引。
-- =====================================================================

-- 插件分类（树形；功能/皮肤/AI/语言 四大类）
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,                     -- slug：function/theme/ai/language
  name        TEXT NOT NULL,                        -- 展示名：功能类 / 皮肤类 / AI 类 / 语言类
  parent_id   TEXT REFERENCES categories(id),       -- NULL = 一级分类；预留多级
  sort_order  INTEGER NOT NULL DEFAULT 0,           -- 同级排序，越小越前
  icon        TEXT,                                 -- 图标名或相对路径，前端映射
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'visible',      -- visible/hidden
  is_system   INTEGER NOT NULL DEFAULT 0,           -- 1 = 内置分类，不可删除
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (status IN ('visible', 'hidden')),
  CHECK (is_system IN (0, 1)),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);

-- 插件 ↔ 分类（多对多；每个插件最多一个主分类）
CREATE TABLE plugin_categories (
  plugin_id   TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  is_primary  INTEGER NOT NULL DEFAULT 0,           -- 1 = 主分类
  sort_order  INTEGER NOT NULL DEFAULT 0,           -- 同分类内的展示排序
  created_at  TEXT NOT NULL,
  PRIMARY KEY (plugin_id, category_id),
  CHECK (is_primary IN (0, 1))
);
CREATE INDEX idx_plugin_categories_category ON plugin_categories(category_id, sort_order);
CREATE UNIQUE INDEX idx_plugin_categories_primary
  ON plugin_categories(plugin_id) WHERE is_primary = 1;

-- 内置分类种子（is_system=1：可改名/排序/隐藏，不可删除）
INSERT INTO categories (id, name, parent_id, sort_order, icon, description, status, is_system, created_at, updated_at) VALUES
  ('function', '功能类', NULL, 10, 'grid',     '记账、报表、票据、HR、项目、权限、平台等业务功能', 'visible', 1, datetime('now'), datetime('now')),
  ('theme',    '皮肤类', NULL, 20, 'palette',  '主题、配色、布局与图标包',                         'visible', 1, datetime('now'), datetime('now')),
  ('ai',       'AI 类',  NULL, 30, 'sparkles', 'AI 问答、OCR、语音识别',                           'visible', 1, datetime('now'), datetime('now')),
  ('language', '语言类', NULL, 40, 'language', '界面语言包、术语表与翻译',                         'visible', 1, datetime('now'), datetime('now'));

-- 现有 15 个插件（来源：marketplace/plugins/*/manifest.json）
INSERT INTO plugins (id, name, description, trust, license, price, currency, license_url, status, latest_version, created_at, updated_at) VALUES
  ('ai',             'AI 增强',             'AI 模型接入配置与连接测试（仅迁移现有能力，不新增 AI 功能）',                         'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('ar-ap',          '应收应付',             '应收应付往来余额、核销记录与自动凭证',                                             'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('banks',          '资金账户',             '库存现金 / 银行存款账户档案',                                                      'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('cash-bank',      '现金银行',             '现金银行收付款、内部转账与银行对账单智能入账',                                     'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('departments',    '部门管理',             '部门（辅助核算维度）档案',                                                         'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('hr',             '薪酬报销',             '员工档案、报销单、借款单、工资表与凭证生成',                                       'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('iam',            '用户与权限',           '用户账号、角色与权限管理（登录与权限判定仍在内核）',                               'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('income-expense', '其他收支',             '其他收入/支出单据、固定费用模板与自动生成凭证',                                    'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('multi-company',  '多公司管理',           '记账公司（账套）档案、成员授权与多账套管理（公司上下文与登录仍在内核）',           'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('ocr',            'OCR 识别',             '图片/PDF 文字识别、证件字段抽取与文档解析（模型文件位于内核 models/ocr）',         'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('projects',       '项目管理',             '项目档案、合同台账与合同 PDF 自动识别',                                           'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('receipts',       'AI 智能记账',          '票据上传、OCR 解析、智能归类、批量记账与归类规则',                                 'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('report-pack',    '财务报表与经营看板',   '资产负债表、利润表、票据台账、现金流量简表、费用结构分析、一键月结与经营看板',     'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now')),
  ('voice',          '语音助手',             '按住 Alt 语音提问，自动查询账务数据并导出 Excel',                                  'official', 'Apache-2.0', 0, 'CNY', NULL, 'draft', NULL, datetime('now'), datetime('now'));

-- 分类回填：每个插件恰好一个主分类
INSERT INTO plugin_categories (plugin_id, category_id, is_primary, sort_order, created_at) VALUES
  ('ar-ap',          'function', 1, 10,  datetime('now')),
  ('banks',          'function', 1, 20,  datetime('now')),
  ('cash-bank',      'function', 1, 30,  datetime('now')),
  ('departments',    'function', 1, 40,  datetime('now')),
  ('hr',             'function', 1, 50,  datetime('now')),
  ('income-expense', 'function', 1, 60,  datetime('now')),
  ('projects',       'function', 1, 70,  datetime('now')),
  ('receipts',       'function', 1, 80,  datetime('now')),
  ('report-pack',    'function', 1, 90,  datetime('now')),
  ('iam',            'function', 1, 100, datetime('now')),
  ('multi-company',  'function', 1, 110, datetime('now')),
  ('ai',             'ai',       1, 10,  datetime('now')),
  ('ocr',            'ai',       1, 20,  datetime('now')),
  ('voice',          'ai',       1, 30,  datetime('now'));

-- 迁移记录：谁在什么时候按什么规则回填了什么
INSERT INTO audit_log (actor, action, target, detail, created_at) VALUES
  ('system', 'categories.backfill', 'plugins',
   '{"source":"marketplace/plugins/*/manifest.json","rule":{"kind:ai|ocr":"ai","otherwise":"function"},"plugins":15,"primaryCategories":{"function":12,"ai":3},"migration":"003_categories.sql"}',
   datetime('now'));

INSERT INTO market_meta (key, value, updated_at) VALUES
  ('category_backfill', '003_categories.sql', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
