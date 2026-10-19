# 离线语音助手（这一期）

## Context

用户希望新增卖点功能：对着应用说"看看这个月的统计数据"，系统整理后输出一份 Excel 并语音播报总结。经确认的技术决策（全部离线、零持续成本、不接 LLM）：

- **ASR**：sherpa-onnx-node 离线中文模型，后端 NestJS 进程内识别（与 OCR 同为 onnx 生态）；录音整段上传后离线识别（非流式，短指令延迟可接受）
- **意图理解**：纯规则引擎（关键词+同义词+中文时间解析），不做 LLM（用户已拍板本期不接）
- **总结文案**：后端模板话术拼接（数字来自真实查询，百分百准确）
- **TTS**：前端 `window.speechSynthesis`（Electron Chromium 走 Windows SAPI 中文语音）；实测无效才启用 Plan B（desktop 主进程 spawn PowerShell SAPI，本期不实现）
- **Excel**：后端已有 `xlsx` 依赖，直接复用

## 第 0 步：Spike 验证（先做，决定后续走向）

1. `cd backend && npm i sherpa-onnx-node`，用项目 Node 24 验证加载：`node -e "require('sherpa-onnx-node')"`（NAPI 插件与 ABI 无关，风险低）
2. 下载 **SenseVoice-small-int8**（~230MB，推荐：自带标点、中文数字/金额反标准化、"应收账款/凭证"等财务词识别质量高）到 `backend/models/asr/`，跑一段 16kHz 测试 wav 验证识别效果与耗时
3. 若体积是硬约束，zipformer-zh-int8（~67MB）作为二档配置项，目录结构不变
4. **Plan B（spike 失败）**：NLU/查询/Excel/话术流水线与 ASR 解耦（接口同时接受文字输入），前端 dialog 保留打字框，90% 价值仍在。不采用 Web Speech API 识别（Chromium 实现走 Google 云，违背全离线）

模型路径解析：新建 `backend/src/modules/voice-assistant/asr-model.path.ts`，仿照 [ocr-model.path.ts](file:///d:/wwwroot/financial/backend/src/modules/ocr/ocr-model.path.ts) 的三级回退（`VOICE_MODEL_DIR` 环境变量 → `cwd/models/asr` → `__dirname` 上溯）+ `asrReady()` 检测。

## Backend 新模块 `voice-assistant/`

```
backend/src/modules/voice-assistant/
├── voice-assistant.module.ts      // 注册进 app.module.ts
├── voice-assistant.controller.ts  // 权限 guard + @RequirePermissions('voice:use')
├── voice-asr.service.ts           // 懒初始化 OfflineRecognizer（首次请求才加载，避免常驻内存）
├── voice-query.service.ts         // 识别→意图→查询→Excel→话术 流水线
├── asr-model.path.ts
├── nlu/intent-registry.ts         // IntentDef[] 指令表
├── nlu/time-parser.ts             // 中文时间解析（YYYYMM 期间格式，与 report.dto.ts 一致）
├── excel/excel-builder.ts         // xlsx 生成
└── excel/export-store.ts          // 内存 Map 缓存生成结果（10 分钟过期）
```

关键签名：

- `VoiceAsrService.recognize(wavBuffer: Buffer): Promise<{text, latencyMs}>`
- `VoiceQueryService.run(audio: Buffer, operator): Promise<VoiceQueryResult>`，其中 `VoiceQueryResult = {transcript, intentId, reply, card: {title, columns, rows, totals}, exportId?}`——card 即前端表格数据源，与 Excel 列共用一套定义
- `parseChineseTime(text): {startPeriod, endPeriod, label}`——正则覆盖：本月/上月/今年/去年/十月/10月/2025年10月/去年十月，默认本月
- `buildWorkbook(title, columns, rows, footerTotals?): Buffer`
- Controller：`POST /voice/query`（multipart，`FileInterceptor('audio', {storage: memoryStorage()})`，参照 payroll.controller 的 multipart 先例）+ `GET /voice/export/:exportId` 返回 xlsx 流

## 指令集 v1（intent-registry.ts）

统一结构 `{id, keywords[], timeSensitive, execute(range), excelColumns, replyTpl, emptyReply}`：

| 指令 | 关键词 | 数据来源（复用） | Excel 列 |
|---|---|---|---|
| 期间收支汇总 | 收支/收入支出/盈亏/赚 | `reports.service.ts` profitLoss（L148-263）currentPeriod.totals | 收入/成本/费用/净利润 |
| 年度收支 | 今年/全年/年度 | 同上（yearToDate.totals） | 同上 |
| 应收汇总 | 应收/欠我/客户欠款 | [ar-ap.service.ts](file:///d:/wwwroot/financial/backend/src/modules/ar-ap/ar-ap.service.ts) `receivable()`（L35） | 往来单位/期末余额/方向 |
| 应付汇总 | 应付/我欠/供应商 | 同上 `payable()`（L40） | 同上 |
| 员工借款 | 员工借/借支/未还 | EmployeeSettlementService 员工余额查询 | 员工/未还金额 |
| 资金余额 | 余额/账上/资金 | cashBank 账户列表 | 账户/类型/余额 |
| 费用结构 | 费用明细/花在哪 | analysis.service.ts `expenseAnalysis`（L307-414） | 费用项/金额/占比 |
| 凭证统计 | 凭证多少/记了几笔 | vouchers 按期间聚合（如仅分页则在 vouchers.service 加 `statsForPeriod(range)` 轻量方法） | 张数/借方/贷方合计 |
| 导出凭证 | 导出凭证 | 凭证明细 | 凭证号/日期/摘要/金额 |
| 导出报销/借款单 | 导出报销/导出借款 | expenseClaims/loans 列表查询 | 按现有列表列 |

兜底：无匹配意图 → reply 列出可用指令；查询为空 → emptyReply（"{label}没有收支记录，要不要试试其他月份？"）。

## 前端（frontend/src）

- 新建 `components/voice/VoiceAssistant.vue`：悬浮 FAB（固定右下，登录后布局内显示）、录音动画、结果 dialog（el-table 展示 card + 话术文本 + "下载 Excel"/"重新说"按钮，含文字输入框作为 Plan B 通道）。挂载到 [AppLayout.vue](file:///d:/wwwroot/financial/frontend/src/components/layout/AppLayout.vue) 根元素末尾，按钮加 `v-permission="'voice:use'"`
- 新建 `utils/voice-recorder.ts`：`startRecording()`/`stop(): Promise<Blob>`——getUserMedia → AudioContext 重采样 16k → PCM16 → WAV 封装；静音 RMS 2s 自动停，上限 15s
- 新建 `utils/tts.ts`：`speak(text)`——`speechSynthesis` 选 zh-CN 语音，失败静默降级为仅展示
- 新建 `api/voice.ts`：`queryVoice(audio: Blob)`（FormData post）+ `downloadVoiceExport(exportId)`（复用 http.ts 的 `download()`）

## 打包（desktop/scripts/build-package.mjs 五处修改）

1. 前置检查段：追加 `backend/models/asr/sensevoice-small-int8/model.int8.onnx`、`tokens.txt` 存在性校验
2. 暂存拷贝段：追加 asr 模型目录
3. `trimStage()`：按 spike 确认的 sherpa-onnx-node 安装结构裁剪非 win32-x64 二进制
4. 原生模块 ABI 验证脚本：追加 `require('sherpa-onnx-node')`
5. 安装包产物校验清单：追加 asr 模型文件

## 权限

[permission.seed.ts](file:///d:/wwwroot/financial/backend/src/db/seeds/permission.seed.ts) 新增节点（增量只插不删，参照 L215 fixed-expense 先例）：`{code: 'voice:use', name: '语音助手', module: 'voice', path: '/voice'}`；controller 挂现有权限 guard，admin/accountant 角色经现有角色-权限同步自动获得。

## 实施顺序

1. Spike（模型下载、加载验证、识别效果确认、二进制结构确认）
2. backend `nlu/time-parser` + `excel/excel-builder`（纯函数，先写）
3. `intent-registry` + `voice-query.service`（流水线，此时接口已可吃文字输入 = Plan B 落位）
4. `voice-asr.service` + controller + permission seed
5. 前端 recorder/tts/voice.ts/VoiceAssistant.vue + AppLayout 挂载
6. build-package.mjs 打包改造
7. E2E 验证

## E2E 验证

1. 造数：当月录 3 收 2 支凭证 + 1 未收发票 + 1 未付发票 + 1 员工未还借款
2. 点 FAB 说"看看这个月的收支"→ 核对话术/卡片数字与利润表页 currentPeriod 完全一致
3. 下载 Excel 与统计页逐数比对
4. 说"十月应收"验证跨期时间解析；空月份测试兜底话术
5. 无权限账号：FAB 不显示且接口 403
6. 打包验证：跑 desktop/scripts/build-package.mjs，确认产物含 asr 模型且原生模块加载 probe 通过

## 风险与规避

- Node 24 加载 sherpa-onnx-node 失败 → Plan B 文字模式（流水线先行，切换成本≈0）
- SenseVoice 首次初始化 3-5s → 懒加载 + 前端 loading 动画
- Windows 无中文 TTS 语音 → tts.ts 静默降级仅展示文字
- exportId 内存缓存重启丢失 → 前端提示"请重新提问"，不做持久化
- 安装包 +230MB → 已与用户确认接受（换 zipformer 仅 67MB，留作配置项）
