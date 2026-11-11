# AI 智能记账插件（receipts）语音能力 — 需求与开发文档

> 状态：已排期开发（P1 落地中）
> 日期：2026-11-11
> 上位文档：`docs/AI操作中间层-通用方案.md`（设计定稿）
> 适用范围：BOKI 内核 + 官方插件 `receipts`（AI 智能记账）+ 可选的 `voice`（语音识别通道）
> 变更：2026-11-11 原独立插件 `ai-voice` 已并入 `receipts`，本文档按合并后的形态描述

---

## 1. 背景与目标

### 1.1 背景

现有 `voice` 插件只做**只读**：按住 Alt 说话 → ASR → 意图/AI 智能体查询 → 表格 + Excel。账务的**写入**（记账、发工资、建档、改凭证、审核）仍要手工点表单。

《AI 操作中间层-通用方案.md》已定稿一条固定流水线：

```
自然语言 → 模型输出 {action, args} → 服务端预演 → 用户确认 → commit 入账
```

这条流水线落到财务域有两个入口：**票据**（上传 → OCR → 归类）与**语音**（一句话）。两者共用同一套「解析 → 预演 → 人工确认 → 草稿」内核，因此合并进同一个插件 `receipts`（AI 智能记账），语音通道以**可选依赖**复用 `voice` 的 ASR 与流式通道。

### 1.2 目标

1. 一句话完成五类写操作：**记账 / 发工资 / 添加人员 / 修改凭证 / 审核凭证**。
2. 模型永远不碰数据库：只输出结构化指令，预演与入账由服务端适配器完成。
3. 所有写入**先预览、再人工确认**；凭证类一律落草稿，人工审核后才正式入账。
4. 与 `voice` 插件保持松耦合：装了 `voice` 才有语音入口；没装则退化为纯票据记账，票据通道不受影响。

### 1.3 不在本期范围

- 删除凭证、反审核、批量冲销（方案 §8：删除/反审核后置）。
- 自动审核（任何路径都不允许模型直接审核入账）。
- 多轮复杂对话（本期单轮 + 缺参追问一次）。
- 票据 OCR → 记账（已由 `receipts` 插件覆盖）。

---

## 2. 术语

| 术语 | 含义 |
|---|---|
| 动作（action） | 白名单内的一个写能力，如 `voucher.create`；由适配器实现，模型只能选不能造 |
| 预演（preview） | 只读地算出「将要写入什么」，含字段、分录、缺口、警告 |
| 令牌（token） | 一次性、15 分钟过期、绑定公司/用户/载荷哈希，commit 只认 token |
| 技能包（skill） | 纯数据：schema + rules + examples + terms，决定模型「听不听得懂」 |
| 适配器（adapter） | 每个动作的 `preview` / `commit` 实现，业务规则唯一落点 |
| 人工审核 | 用户在界面上点击确认/审核；是入账的唯一合法触发点 |

---

## 3. 插件形态与依赖

### 3.1 归属：语音能力是「AI 智能记账」的一条通道（2026-11-11 合并）

> 合并决策：原独立插件 `ai-voice`（AI 语音记账）已并入 `receipts`（AI 智能记账）。
> 两者本质是同一条链路 ——「非结构化输入 → AI 解析 → 草稿单据 → 人工确认」，
> 只是一个从票据进、一个从语音进，没有必要拆成两个插件。

合并后的 `receipts`（**AI 智能记账**，v1.1.0）同时提供两条通道：

| 通道 | 入口 | 后端前缀 |
|---|---|---|
| 票据通道 | 菜单「上传记账 / 票据列表 / 归类规则」 | `/api/receipts/*` |
| 语音通道 | 挂在 `voice` 语音弹窗内的面板（**不新增页面/菜单/悬浮球**） | `/api/receipts/voice/*` |

与 `voice` 的分工：

| 项 | `voice`（语音助手） | `receipts` 语音通道 |
|---|---|---|
| 定位 | 语音查询（只读）+ 语音播报 | AI 一句话操作（写入，需人工确认） |
| 版本 | 1.0.2（新增一个扩展插槽，其余不变） | 1.1.0 |
| 前端入口 | 悬浮球（🎙️）+ 语音弹窗 | **无独立入口**：注册到 `voice.assistant.panel` 插槽 |
| 后端能力 | ASR、流式识别 WS、只读查询 | 指令编译、预演、确认入账、审计 |
| 依赖 | `ai`、`report-pack` | `ocr`、`hr`、`ai`；`voice` 为**可选依赖** |

`voice` 侧的全部改动只有两处，均为纯增量：

1. 弹窗内、输入框上方加一个插槽占位：`<PluginSlot name="voice.assistant.panel" :transcript :visible :busy />`
2. `onSubmitText()` 里补一行 `dialog.transcript = text`，把用户原话（语音与打字两条路径的唯一汇合点）暴露给插槽

没装 `voice` 时插槽无人渲染，`voice` 的执行路径一行都不变；`receipts` 则退化为纯票据记账。

### 3.2 依赖声明（合并后）

`receipts/manifest.json`：

```json
"dependencies":         { "ocr": "^1.0.0", "hr": "^1.0.0", "ai": "^1.0.0" },
"optionalDependencies": { "voice": "^1.0.2", "departments": "^1.0.0", "banks": "^1.0.0" }
```

- `voice` 由硬依赖改为**可选依赖**：只想用票据记账的人不必被迫安装语音插件；装了 `voice` 才有语音入口。
- 内核安装器（`RemoteMarketService.installRecursive`）对硬依赖先递归安装再落目录；`voice` 不在其中，因此不影响票据通道的安装。
- 运行期 `PluginsService.enabledManifests()` 对硬依赖缺失的插件做剔除；`voice` 缺失时本插件照常加载，只是插槽无人渲染。

### 3.3 语音能力怎么复用（重要实现决策）

语音通道**不 import** `voice` 的 Nest 模块，只复用它的 HTTP/WS 契约：

| 能力 | 通道 |
|---|---|
| 流式识别 | `ws://…/api/voice/stream?token=<jwt>`（由 `voice` 弹窗自己发起，本插件不重复录音） |
| 整段兜底识别 | `POST /api/voice/transcribe` |
| ASR 就绪状态 | `GET /api/voice/status` |

前端同理：`ai-voice` **不自己录音**，只消费 `voice` 弹窗透传的 `transcript`。

原因：Nest 的模块实例按「导入路径」区分，同一个模块类被两个父模块导入会生成两个实例，
导致 `VoiceStreamService` 把 WebSocket 挂载两次（同一路径两个 `upgrade` 监听）。
因此两个插件在代码上完全解耦，只在运行时依赖对方的接口存在。

**插槽渲染器必须是全局组件**：插件产物不引用内核组件（`@/components/PluginSlot.vue` 会把 AppLayout
整条依赖拖进插件包，构建直接失败）。因此在 `frontend/src/main.ts` 里
`app.component('PluginSlot', PluginSlot)`，插件模板写标签即可，运行时从宿主上下文解析。

---

## 4. 需求清单

优先级：**P0** 首发必须；**P1** 首个迭代内；**P2** 后续增强。

### 4.1 功能需求

| 编号 | 需求 | 说明 | 优先级 | 验收标准 |
|---|---|---|---|---|
| FR-01 | 一句话记账 | 说「记一笔 8000 应收，客户某某公司，还没开票」→ 生成两行平衡分录预览 | P0 | 预览分录借贷相等且合计=8000.00；确认后生成**草稿**凭证 |
| FR-02 | 一句话发工资 | 说「发一下 10 月工资，10 号发」→ 预览人数/应发合计 → 生成工资单草稿 | P0 | 生成 `DRAFT` 工资单；期间重号时明确拒绝并提示已有单号 |
| FR-03 | 一句话添加人员 | 说「新增员工张三，销售部，月薪 8000」→ 预览工号/部门 → 建档 | P0 | 工号自动生成、部门名称正确解析、确认后员工存在 |
| FR-04 | 一句话修改凭证 | 说「把记-0012 的摘要改成差旅费，金额改成 1200」→ 展示改前/改后 | P0 | 仅草稿可改；已审核凭证给出明确提示而非静默失败 |
| FR-05 | 一句话审核凭证 | 说「审核这个月所有差旅费凭证」→ 列出待审清单 → 人工确认后审核 | P0 | 清单最多 20 条并显示合计；未确认不写库；借贷不平的凭证被拦下 |
| FR-06 | 预览确认卡片 | 所有动作统一一张卡片：字段（可编辑）、分录（只读）、缺口（选择器）、警告 | P0 | 五种动作复用同一套渲染，不出现「每个动作一个表单」 |
| FR-07 | 缺参追问 | 信息不足时返回 `missing`，不猜金额/不猜科目 | P0 | 说「买了点东西」→ 返回追问，不产生任何写入 |
| FR-08 | 字段二次编辑 | 用户只改 `editable: true` 字段，改完走 `commit(patch)`，不重调模型 | P0 | 改金额后服务端重新校验，凭证金额以服务端为准 |
| FR-16 | 字段控件化 | `PreviewField.kind` 决定控件：`account` 走科目下拉、`date` 走日期选择、`amount` 走数字框，档案类走档案下拉 | P0 | 卡片上没有任何需要手输科目/档案的输入框 |
| FR-17 | 科目推荐 | 借方缺失时按「贷方科目 + 原话线索」给出候选并预填首选，卡片写明推荐理由 | P0 | 「还没开票的收入」→ 借方预填 1122 应收账款；用户可改选 |
| FR-18 | 单通道回复 | 写操作由面板接管后，voice 不再输出查询结论与语音播报 | P0 | 一句话只出现一张卡，不再同时出现「没有听明白」 |
| FR-19 | 解析中反馈 | 交出话术的瞬间就渲染「正在理解这句话 → 正在匹配科目和往来单位 → 正在生成凭证草稿」三段文案，并提示本地模型首次响应约 5–15 秒 | P0 | 等待期间界面不空白，用户不会以为卡死 |
| FR-20 | 活卡片 | 任一字段改动后 350ms 防抖调用 `POST /receipts/voice/preview`（只读）重新预演，分录、辅助核算、缺项、警告随之刷新 | P0 | 改借方科目后，表格里的科目与「客户：xxx」立刻同步 |
| FR-21 | 缺项即时判定 | 是否需要补充以**本地草稿值**为准，服务端 `missing` 只提供字段与话术；已填缺项显示 ✓，未填显示 * | P0 | 补上部门后按钮立刻可点，不再出现「* 都填了还是不能提交」 |
| FR-22 | 方向纠偏 | 借方落在收入类（60xx）、贷方落在货币资金时判定为模型写反，自动对调并在卡片上说明；另提供「↔ 借贷对调」一键操作 | P0 | 「记一笔 6000 收入」得到 借 银行存款 / 贷 营业收入 |
| FR-23 | 档案兜底识别 | 模型漏填往来单位时用档案反扫原话（全名 / 去括注与公司后缀的核心名 / 核心名前缀≥3 字）；科目「编码+名称」冲突时以名称为准 | P0 | 「对方是 光影空间」能匹配到「光影空间（广州）视觉科技有限公司」，且挂到收入行的辅助核算 |
| FR-24 | 空值语义 | 部门留空即「全部（不限部门）」；「全部 / 不限 / 所有」等占位词在预览与提交两侧统一归一为空，绝不拿去查档案；下拉顶部提供同义选项 | P0 | 部门不选也能提交，不再报「部门『全部』不存在」 |
| FR-09 | 一次性令牌 | token 绑定 公司/用户/载荷哈希，15 分钟过期（可交互改字段后需放宽；一次性与归属约束不变） | P0 | 重复提交同一 token 只入账一次；篡改 token 报错 |
| FR-10 | 人工审核闸 | 凭证类写入默认 `autoApprove=false`，只落草稿 | P0 | 代码中不存在模型触发的 approve 路径 |
| FR-11 | 指令历史与审计 | 原话、动作、参数、预览哈希、执行结果、操作人、时间全部留痕 | P1 | 记账台页可查看最近指令与结果 |
| FR-12 | 语音 + 文字双通道 | 语音复用 `voice` 的流式 ASR；不可说话时打字同链路 | P0 | 两条入口走同一 `plan` 接口 |
| FR-13 | 权限分级 | 计划（读）与执行（写）分权，逐动作二次校验底层权限 | P0 | 无 `voucher:create` 的用户能预览但 commit 被拒 |
| FR-14 | 金额限额提示 | 单笔 ≥ 5 万元时预览卡片显示高风险警告 | P2 | 警告可见，但仍可由有权用户确认 |
| FR-15 | 口语同义词 | 「发工资/发薪/打工资」「新增/加个/入职」等同义 | P1 | 技能包 `terms.md` 覆盖，命中率达标 |

### 4.2 非功能需求

| 编号 | 需求 | 指标 |
|---|---|---|
| NFR-01 | 模型不接触数据库 | prompt 中只出现动作清单、参数 schema、top-N 候选；无 SQL、无主键表 |
| NFR-02 | 白名单 | 模型输出的 action 不在注册表 → 直接拒绝，不猜测 |
| NFR-03 | 幂等 | 同一 token 重复 commit 返回同一结果，0 重复入账 |
| NFR-04 | 预演无副作用 | `preview` 全程只读，可在同一句话上反复调用 |
| NFR-05 | 失败可解释 | 模型不可用 / JSON 非法 / 业务校验失败，都返回人类可读原因 |
| NFR-06 | 模型可替换 | 仅通过 `ai` 插件的 OpenAI 兼容层调用，不写 `if (model === ...)` |
| NFR-07 | 零插件降级 | 未安装 `receipts` 时内核与 `voice` 行为完全不变；未安装 `voice` 时票据通道行为完全不变 |
| NFR-08 | 单笔延迟 | 文字指令 ≤ 20s（在线模型），本地模型可放宽 |

---

## 5. 技术方案

### 5.1 分层

```
语音（复用 voice 的 WS/ASR） / 文字
        │  文本
        ▼
┌──────────────────────────────────────────┐
│ 指令编译器 compiler                        │  ai 插件 chat()（OpenAI 兼容）
│ 动作清单 + 技能包 + top-N 候选 → {action,args} │  约束纯 JSON、缺参 ask
└───────────────┬──────────────────────────┘
                ▼ 结构化指令（模型不碰库）
┌──────────────────────────────────────────┐
│ 指令网关 gateway                           │  白名单、权限、补 ID、
│ plan → preview → token → commit           │  一次性 token、幂等、审计
└───────────────┬──────────────────────────┘
                ▼ preview + token
┌──────────────────────────────────────────┐
│ 确认卡片（插件前端统一组件）                 │  字段可编辑 / 分录只读 / 缺口语义
└───────────────┬──────────────────────────┘
                ▼ commit(token, patch)
┌──────────────────────────────────────────┐
│ 动作适配器 actions/                        │  voucher / employee / payroll
│ preview 只读；commit 复用现有 service       │  落草稿，等待人工审核
└───────────────┬──────────────────────────┘
                ▼
     VouchersService / EmployeesService / PayrollService
```

### 5.2 协议（对齐方案 §3）

三个接口，长期稳定：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/receipts/voice/capabilities` | GET | 返回动作清单（模型与前端共用） |
| `/api/receipts/voice/plan` | POST | `{text}` → `{planId, action, args, missing, preview, token, expiresAt}`，只读 |
| `/api/receipts/voice/commit` | POST | `{token, patch, confirmed:true}` → `{ok, result, auditId}` |
| `/api/receipts/voice/cancel` | POST | `{token}` → token 置为作废 |

预览结构（所有动作统一）：

```json
{
  "title": "记账凭证 · 未开票收入",
  "summary": "借 1122 应收账款 / 贷 6001 主营业务收入",
  "fields": [
    { "key": "amount", "label": "金额", "value": "8000.00", "editable": true, "kind": "amount" },
    { "key": "debitAccount", "label": "借方科目", "value": "1122 应收账款", "editable": true,
      "kind": "account", "placeholder": "从科目表选择",
      "options": [{ "value": "1122 应收账款", "label": "1122 应收账款", "hint": "还没开票/收款，先挂应收" }] }
  ],
  "lines": [
    { "account": "1122 应收账款", "debit": 8000, "credit": 0, "aux": "客户：某某公司" },
    { "account": "6001 主营业务收入", "debit": 0, "credit": 8000 }
  ],
  "missing": [{ "field": "partnerName", "label": "往来单位", "type": "partner" }],
  "warnings": ["未开票，补发票后需关联"],
  "items": []
}
```

### 5.3 动作清单（首发五个）

| 动作 ID | 标题 | 关键参数 | 权限（二次校验） | 落点（commit） | 结果状态 |
|---|---|---|---|---|---|
| `voucher.create` | 一句话记账 | 金额、借方科目、贷方科目、摘要、日期、往来单位 | `voucher:create` | `VouchersService.create(..., autoApprove=false)` | 草稿凭证 |
| `voucher.modify` | 修改凭证 | 凭证号、期间、新摘要/新金额/新日期/新科目 | `voucher:update` | `VouchersService.update` | 仍为草稿 |
| `voucher.approve` | 审核凭证 | 凭证号 / 期间 + 关键词（批量≤20） | `voucher:approve` | `VouchersService.approve` × N | 已审核（=人工确认） |
| `employee.create` | 添加人员 | 姓名、部门、岗位、月薪、手机、入职日期 | `hr:employee:create` | `EmployeesService.create` | 员工档案 |
| `payroll.run` | 发工资 | 工资期间、发放日期、部门（可选） | `hr:payroll:create` | `PayrollService.generate` | 工资单草稿 |

参数只描述业务语义（`借方科目`、`往来单位`），不出现 `account_id`。`resolve` 声明该参数需要名称→档案 ID 的解析：

```
partner / employee / department / account / bankAccount / voucher
```

### 5.4 技能包（数据，不是代码）

`server/modules/voice-ops/skills/bookkeeping.skill.ts` 导出四段数据：

| 段 | 内容 |
|---|---|
| `schema` | 模型必须输出的结构：`{action, args, missing, ask}` |
| `rules` | 只写「怎么听懂」：相对日期换算、金额两位小数、禁止猜、缺参必问、一次只出一个 JSON |
| `examples` | 18 条真实口语 → 期望输出（覆盖简称、缺参、批量、诱导） |
| `terms` | 「发薪/打工资 → 发工资」「加人/入职 → 添加人员」等同义词 |

编译时按用户原话做关键词召回，只注入 top-N 候选（科目 40 / 往来单位 15 / 员工 15 / 部门 10 / 资金账户 10），避免小模型上下文爆炸（方案 §5）。

### 5.5 网关硬规则

1. 动作必须命中注册表，否则 `400 不支持的操作`。
2. `plan` 需要 `receipts:voice:use`；`commit` 需要 `receipts:voice:commit` **且**动作自身的业务权限。
3. token 服务端保存完整载荷；commit 不信任客户端传的金额，`patch` 只允许改 `editable` 字段并重新跑一遍参数校验与预演。
4. 同一 token 二次提交直接返回首次结果（`idempotent: true`）。
5. 凭证类动作固定 `autoApprove=false`；代码里不存在自动审核分支。
6. 审计必写：`fin_ai_voice_audit`（原话、动作、参数、预览哈希、结果、状态、操作人、公司、时间）。

### 5.6 名称解析的两条护栏（实现要点）

1. **科目别名**：模型按行业口径说「主营业务收入」，本账套是「营业收入」。
   别名表放在 `CatalogService`（业务知识外置，不进 prompt）：主营业务收入→营业收入、
   主营业务成本→营业成本、应交税金→应交税费、应付工资→应付职工薪酬、工行/建行→银行存款、
   办公费/差旅费/房租→管理费用 等。
2. **模糊匹配必须过半**：双字重合度 < 50% 或命中 < 2 个字时返回「未匹配」，
   宁可让用户重说或手选，也不能把「主营业务收入」错配成「其他业务收入」写进账。
3. **辅助核算强校验**：科目要求 `partner/department/employee` 而参数缺失时，
   进 `missing` 并阻止 commit（内核 `normalizeEntries` 同样会拦，这里提前暴露）。

### 5.7 「今天」的口径

服务器多为 UTC，直接用服务器日期会让「今天」在跨零点时段差一天。
`plan` 接受客户端传的本地日期 `today`（YYYY-MM-DD），服务端只做 ±2 天合理性校验；
该日期写入令牌并在 `commit` 复用，保证「预览里的日期」与「入账日期」完全一致。

---

## 6. 数据模型

新增一张表，只做审计，不承载业务：

```
fin_ai_voice_audit
├── id            uuid
├── company_id    varchar(36)   ← 公司隔离
├── user_id       varchar(36)
├── user_name     varchar(50)
├── source        varchar(10)   voice | text
├── transcript    text          原始口语
├── action        varchar(50)   动作 ID
├── args_json     text          结构化参数
├── preview_hash  varchar(64)   sha256(预览)
├── status        varchar(20)   planned | committed | cancelled | failed
├── result_json   text          执行结果（凭证号/工号/工资单号）
├── message       varchar(500)  失败原因
├── token         varchar(64)
└── created_at    datetime
```

凭证、工资单、员工一律沿用现有表与状态机，不新增业务表。

---

## 7. 接口清单

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/receipts/voice/status` | `receipts:voice:use` | 状态：ASR 就绪、模型就绪、可用动作数 |
| GET | `/api/receipts/voice/capabilities` | `receipts:voice:use` | 动作清单 |
| POST | `/api/receipts/voice/plan` | `receipts:voice:use` | 文本 → 预览（只读） |
| POST | `/api/receipts/voice/commit` | `receipts:voice:commit` + 动作权限 | 确认入账 |
| POST | `/api/receipts/voice/cancel` | `receipts:voice:commit` | 作废令牌 |
| GET | `/api/receipts/voice/records` | `receipts:voice:use` | 最近指令与结果（审计只读） |
| GET | `/api/receipts/voice/pending` | `voucher:list` | 待审核草稿（供审核动作挑选） |

`plan` 的请求体：

```json
{ "text": "记一笔 8000 应收，客户某某公司", "source": "voice", "today": "2026-11-11" }
```

`today` 是客户端本地日期（可选）。`commit` 的请求体：

```json
{ "token": "t_xxx", "patch": { "amount": 8600 }, "confirmed": true }
```

---

## 8. 前端交互

### 8.1 只有一个悬浮球、一个弹窗

- 右下角只有 `voice` 的 🎙️，没有第二个悬浮球。
- 语音通道的面板渲染在 `voice` 语音弹窗内部（输入框上方），与对话区同屏。
- 面板只在**识别到写操作意图**时出现；纯查询（看看这个月收支）完全不受影响，`voice` 照旧回答并播报。
- 卸载 `receipts` → 插槽为空 → 弹窗回到原始形态，无残留；卸载 `voice` → 面板无处挂载，票据通道照常。

### 8.2 主流程（4 步）

1. 点 🎙️ → 语音弹窗，按住 Alt 说话（或直接打字）。
2. `voice` 把原话透传给插槽；`receipts` 的语音面板先做**本地意图预筛**（纯正则，不调模型），命中写操作才继续。
3. 卡片嵌在弹窗内展示：标题、摘要、可编辑字段、分录表、缺口、警告 → 点「确认执行」。
4. 结果条：`已生成草稿凭证，请到「凭证列表」复核后审核` / `已建档：王小明（工号 E0003）`。

意图预筛规则（避免纯查询多花一次模型调用）：

- 命中关键词：`记一笔 / 记账 / 入账 / 改+凭证 / 审核+凭证 / 新增员工 / 发工资` 等。
- 排除问句：含 `多少 / 几笔 / 怎么样 / 看看 / 统计 / 导出 / 余额` 时不当写操作。
- 记账类必须带数字金额，否则交给 `voice` 正常回答。

### 8.3 不再有独立页面

原独立工作台与 `/ai-voice` 路由已随合并取消（指令历史在审计表，草稿走凭证列表）：

- 草稿凭证的复核走内核「凭证管理 → 凭证列表」按状态筛选，不需要重复做一套列表。
- 指令历史保留在审计表 `fin_ai_voice_audit`，通过 `GET /api/receipts/voice/records` 可查，不占界面。

### 8.4 弹窗只能主动关闭

`el-dialog` 设置 `:close-on-click-modal="false"`，关闭方式只有两种：右上角 ✕、ESC。

原因：面板里有部门/往来单位/账户等下拉，下拉浮层挂在 `body` 上，Element Plus 会把「点选下拉项」判定为点击遮罩 → 弹窗关闭、已解析好的确认卡片丢失。禁用遮罩关闭后这条误关路径消失，卡片不会因为一次误触白解析一遍。

---

## 9. 权限与角色

权限点（`permission.seed.ts`，`syncPermissions` 对老库增量补齐）：

| code | 名称 | 类型 | 说明 |
|---|---|---|---|
| `receipts:voice:use` | 使用 AI 一句话指令 | ACTION | 面板是否渲染 |
| `receipts:voice:commit` | AI 指令确认入账 | ACTION | 「确认执行」按钮是否可用 |

两个权限码挂在 `receipts`（AI 智能记账）菜单节点下，不再单独建分组节点。

老库升级：`seed.service.ts` 新增 `cleanupObsoletePermissions()`，启动时把
`ai-voice` / `ai-voice:use` / `ai-voice:commit` 三个废弃权限码先解绑角色、再删除，
避免权限树留下指向已不存在菜单的死节点（`syncPermissions` 本身只增不减）。

授权策略：

- `admin`：全量（`allPermissions`）。
- `accountant`（会计）：`receipts:voice:use`、`receipts:voice:commit`。
- `cashier`（出纳）：本期不授予写入权限，可后续按动作细分。

动作级权限（`voucher:create` / `voucher:update` / `voucher:approve` / `hr:employee:create` / `hr:payroll:create`）在 commit 时二次校验，不能只凭「能用 AI」放行。

---

## 10. 分期计划

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P0**（本期） | 中间层内核 + 五个动作 + 确认卡片 + 审计 | 文字/语音闭环，全部落草稿 |
| **P1** | 同义词扩充、动作扩展、语音回执（避免 voice 回答「没听明白」） | 可日常使用 |
| **P2** | 收支单据类动作（收款/付款/报销）、限额二次确认 | 动作扩到 8-10 个 |
| **P3** | 网关抽独立服务（方案 §9），接第二个项目 | 协议不变 |

P0 完成定义：五条真实口语各自跑通「说 → 预览 → 确认 → 草稿」，重复确认不重复入账，凭证类无自动审核路径。

---

## 11. 验收用例（节选）

| # | 口语 | 期望 |
|---|---|---|
| 1 | 记一笔 8000 应收，客户某某公司，还没开票 | 分录平衡，2 行，草稿凭证 |
| 2 | 记一笔收入，客户是某某公司 | `missing: amount` 追问，不写库 |
| 3 | 买了一台电脑 6000，从工行付的 | 借固定资产 / 贷银行存款，警告「未指定供应商」 |
| 4 | 发一下 10 月工资，11 月 10 号发 | 工资单草稿，人数与应发合计正确 |
| 5 | 10 月工资已经发过了 | 明确提示已存在工资单及其单号 |
| 6 | 新增员工李四，销售部，月薪 8000，手机 138xxxx | 工号自动、部门=销售部 |
| 7 | 把记-0012 的摘要改成差旅费 | 改前/改后对照，仅草稿可改 |
| 8 | 审核这个月所有差旅费凭证 | 列出待审清单（≤20），确认后审核 |
| 9 | 重复点确认 | 第二次返回首次结果，不重复入账 |
| 10 | 借 1000 贷 800 | 预演直接报借贷不平，拒绝生成 |

---

## 12. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 模型科目映射偏差 | 记错科目 | 科目由适配器按候选匹配 + 预览可改 + 只落草稿 |
| 小模型上下文不足 | JSON 截断/乱答 | 只注入 top-N 候选；JSON 修复；失败即要求重说，不猜 |
| 语音识别同音错字 | 客户名错 | 预览显示候选与相似度，确认前可改 |
| 审核动作被滥用 | 误审凭证 | 仅草稿、列清单、二次确认、审计留痕、权限分离 |
| 插件间耦合过紧 | voice 升级破坏语音通道 | 只依赖 `/api/voice/stream` 与 `/api/voice/transcribe` 两个公开接口，不 import 对方模块 |

---

## 13. 实现清单（已落地）

```
boki-market/plugins/receipts/                     # AI 智能记账（v1.1.0，合并后的唯一插件）
├── manifest.json                       # 硬依赖 ocr/hr/ai；voice 为可选依赖；3 菜单 + 1 插槽
├── server/index.ts                     # 导出 module + entities(审计表)
├── server/modules/receipts/            # 票据通道：上传 / OCR / 归类 / 工作台
└── server/modules/voice-ops/           # 语音通道（原 ai-voice 整体迁入）
    ├── ai-voice.module.ts              # 装配：内核 + ai + hr，不 import voice 模块
    ├── ai-voice.controller.ts          # /api/receipts/voice/*（读写分离）
    ├── ai-voice.service.ts             # 门面：capabilities/plan/commit/cancel/records/pending
    ├── bridge/
    │   ├── protocol.ts                 # 协议类型（ActionAdapter / Preview / TokenPayload）
    │   ├── action.registry.ts          # 动作白名单
    │   ├── compiler.service.ts         # 自然语言 → {action,args}（技能包 + top-N 候选）
    │   ├── catalog.service.ts          # 候选召回 + 名称→档案解析（含科目别名与模糊护栏）
    │   ├── token.store.ts              # 一次性令牌（15 分钟、绑公司/用户、幂等）
    │   ├── gateway.service.ts          # plan/commit/cancel、权限、patch 收口、审计
    │   ├── audit.service.ts            # 审计落库与历史查询
    │   └── entities/ai-voice-audit.entity.ts
    ├── actions/
    │   ├── action.util.ts              # 金额/日期/分录工具
    │   ├── voucher.action.ts           # create / modify / approve（+ VoucherSupport）
    │   ├── employee.action.ts          # employee.create
    │   └── payroll.action.ts           # payroll.run
    └── skills/bookkeeping.skill.ts     # schema / rules / examples / terms
└── client/
    ├── index.ts                        # 3 个页面 + 注册 voice.assistant.panel 插槽
    ├── voice-api.ts                    # 语音通道 API 封装（含 localToday）
    └── components/AiVoicePanel.vue     # 嵌在 voice 弹窗内的确认卡片（意图预筛 + 差异提交）
```

内核改动四处：

| 文件 | 改动 |
|---|---|
| `backend/src/db/seeds/permission.seed.ts` | 新增 `receipts:voice:use` / `receipts:voice:commit`（挂在 receipts 节点下）并授权会计；删除 `ai-voice` 分组节点；新增 `OBSOLETE_PERMISSION_CODES` 常量 |
| `backend/src/db/seed.service.ts` | 新增 `cleanupObsoletePermissions()`：老库启动时解绑角色并删除废弃权限码（`syncPermissions` 只增不减） |
| `backend/src/common/types/operator.ts` | 恢复该类型（被此前的「死代码清理」误删，hr/ar-ap/cash-bank 等插件仍引用，导致插件编译失败） |
| `frontend/src/main.ts` | `app.component('PluginSlot', PluginSlot)`：把插槽渲染器注册为全局组件，插件包无需引用内核组件 |

`voice` 插件改动（1.0.0 → 1.0.2，纯增量）：

| 位置 | 改动 |
|---|---|
| `VoiceAssistant.vue` 模板 | 弹窗内输入框上方加 `<PluginSlot name="voice.assistant.panel" :transcript :visible :busy />`；`el-dialog` 加 `:close-on-click-modal="false"` |
| `onSubmitText()` | 补 `dialog.transcript = text`，把用户原话暴露给插槽 |

## 14. 联调结果（2026-11-11，本机 dev 库）

| 用例 | 结果 |
|---|---|
| `记一笔 8000 应收，还没开票` | 预览「借 应收账款 8,000.00 / 贷 营业收入 8,000.00」，缺往来单位被拦；补 `岳鹏` 后生成草稿 记-0001 |
| 重复 commit 同一 token | 返回同一 `voucherId`，`idempotent: true`，未重复入账 |
| `新增员工张三，销售部，月薪8000` | 部门不存在 → 明确提示并阻止；清空部门后建档 E0003 |
| `发一下这个月工资` | 预览 3 人 / 应发 8,000.00；commit 生成草稿工资单 GZ20261102（未自动审核、未发放） |
| `把记-0001的摘要改成差旅费` | 改前/改后对照，写入后仍为草稿 |
| `审核记-0001` | 人工确认后审核成功（approved 1，skipped 0） |
| 审计 | `GET /api/receipts/voice/records` 返回 plan/commit 全链路记录 |

联调结束后已删除测试凭证/工资单/员工，模型配置恢复为本机 llamacpp；审计表保留这几条联调记录（审计不删改）。

### 14.1 内嵌形态实测（2026-11-11，dev 前端 5175 / 后端 3000）

| 用例 | 结果 |
|---|---|
| 侧边栏与悬浮球 | 无「AI 语音记账」独立菜单，右下仅剩 🎙️；合并后 `/ai-voice` 路由 404 |
| 🎙️ 打开弹窗 → 输入「记一笔5000的应收账款，客户是岳鹏，还没开票」 | 弹窗内出现卡片：日期 2026-11-11 / 摘要 未开票收入 / 5,000.00 / 1122 应收账款 / 6001 营业收入 / 往来单位 岳鹏，按钮「放弃 / 确认执行」 |
| 点「确认执行」 | 生成草稿凭证 记-0001（status=draft），审计记 committed |
| 「新增员工王小明，技术部，月薪9000」 | 卡片含 姓名/部门/岗位/月薪/入职日期；确认后建档 E0003，面板显示「已建档：王小明（工号 E0003）」 |
| 停用语音能力来源后同一句话 | 无任何面板，`voice` 只回普通查询结果 → 卸载即退回纯查询（合并后对应「停用 receipts」或「卸载 voice」） |
| 停用/启用插件对已生成凭证 | 凭证数据不受影响（按 id 复查仍可读） |

测试数据（草稿凭证、王小明）已删除，凭证总数回到 27。

## 15. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-11 | 首版：确立五动作、确认闸、令牌与审计；语音复用改为 HTTP/WS 契约（不 import voice 模块，避免 WS 重复挂载）；补科目别名与模糊护栏；「今天」以客户端本地日期为准 |
| 2026-11-11 | **形态调整**：取消独立悬浮球、菜单与 `/ai-voice` 工作台，改为挂在 `voice` 语音弹窗的 `voice.assistant.panel` 插槽内；`voice` 升 1.0.1 仅加插槽点；`ai-voice` 改为本地意图预筛后再调 plan，避免纯查询多花一次模型调用；插槽渲染器提为全局组件以守住插件边界 |
| 2026-11-11 | **确认卡片控件化 + 科目推荐**：`PreviewField` 增加 `kind`（text/date/amount/account/partner/department/employee）与 `options`（推荐候选 + 理由）；新增 `receipts/client/components/AccountSelect.vue`，工作台、归类规则、语音面板三处共用（复用内核 `basicStore` 的科目缓存）；借方科目缺失时按「贷方科目定性 + 原话线索」推荐并预填（`CatalogService.suggestDebit`），`preview` 与 `commit` 收口到同一份 `VoucherPlan`，避免两处各算一遍；面板确认时整体回传所有可编辑字段（推荐预填值也要回传）。`voice` 增加 `takeover` 事件：面板接手写操作后宿主丢弃查询结论与语音播报，修掉「没有听明白 + 记账卡片」同时出现的问题 | 1.2.0 / voice 1.1.0 |
| 2026-11-11 | **交互与识别修正（receipts 1.3.0 / voice 1.1.1）**：①等待感——面板接管时立刻渲染「正在理解这句话 / 正在匹配科目和往来单位 / 正在生成凭证草稿」，宿主 voice 保留 loading（由面板 `settled` 事件释放），修掉「输完没反应像卡死」；②活卡片——新增 `POST /receipts/voice/preview`（只读、不换令牌、不写审计），字段改动防抖重新预演，分录与辅助核算实时同步；③缺项判定本地化——`missing` 不再作为按钮开关，按草稿值实时判定，已填缺项显示 ✓（修掉「部门填了仍不能提交」）；④方向纠偏——借方为收入类、贷方为货币资金时自动对调并说明，另加「↔ 借贷对调」按钮；⑤档案识别增强——`guessPartner` 用档案反扫原话（全名 / 核心名 / 核心名前缀≥3 字），`resolveAccount` 在「编码+名称」冲突时以名称为准（修掉「6601其他业务收入」被静默记成 6601 销售费用）；⑥技能包新增收入类 few-shot 与「对方是 X 必须填 partnerName」规则；令牌 TTL 5→15 分钟 | receipts 1.3.0 / voice 1.1.1 |
| 2026-11-11 | **插件合并**：`ai-voice` 整体并入 `receipts`（AI 智能记账，升 1.1.0）——与票据通道共用同一套「解析 → 草稿 → 人工确认」链路。后端模块迁至 `receipts/server/modules/voice-ops`，路由改为 `/api/receipts/voice/*`；`voice` 由硬依赖降为**可选依赖**（没装则退化为纯票据记账）；权限码改为 `receipts:voice:use` / `receipts:voice:commit`，老库启动时自动清理废弃码；`ai-voice` 插件与市场条目下线 |
| 2026-11-11 | **体验增强（receipts 1.1.1 / voice 1.0.3 / ai 1.0.1）**：①执行成功返回 `route` + `routeText`，面板渲染「查看草稿凭证 / 查看工资表 / 查看员工档案」跳转，凭证列表支持 `?status=&period=` 预筛；②口语同义词扩充（挂账/帮我记/垫付/交了…）与科目别名扩充（水电费、物业费、快递费、利息、税金等 19 条）；③技能包补「借贷方向」规则与两条付款示例，适配器新增方向体检——借方为货币资金、贷方为成本费用时给出警告（不自动翻改，用户可改科目后重新预演）；④「AI 增强」更名为「AI 模型接入」，明确其为模型接入底座 |
| 2026-11-11 | **部门空值语义（receipts 1.3.1）**：`normalizeDept()` 把「全部 / 不限 / 所有 / 空」统一归一为「不按部门筛选」，`payroll.run` 与 `employee.create` 的预览、提交两侧共用（修掉 commit 侧照旧拿「全部」查档案报「部门『全部』不存在」）；部门字段留空显示「全部（不限部门）」占位，下拉顶部给出同值选项（`PreviewField.emptyLabel`），清空即全部；员工基本工资为 0 时提前说明「工资单金额会是 0」 | receipts 1.3.1 |
