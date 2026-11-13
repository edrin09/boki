<p align="center">
  <img src="assets/boki-lockup.svg" width="360" alt="BOKI — 开源财务软件" />
</p>

<h1 align="center">BOKI — 离线优先的开源财务软件</h1>

<p align="center">
  <strong>加密数据库 · AI 一句话记账 · 你的数据，永远只属于你</strong>
</p>

<p align="center">
  <a href="https://github.com/edrin09/boki/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-4F46E5.svg" alt="License: AGPL v3" /></a>
  <img src="https://img.shields.io/badge/数据库-SQLCipher%20加密-16A34A.svg" alt="SQLCipher encrypted" />
  <img src="https://img.shields.io/badge/云端依赖-0-16A34A.svg" alt="no cloud" />
  <img src="https://img.shields.io/badge/官方插件-14-0EA5E9.svg" alt="plugins 14" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-64748B.svg" alt="platform" />
</p>

<p align="center">
  <a href="#-30-秒演示ai-一句话记账">演示</a> ·
  <a href="#-它能做什么">功能</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-方式一下载安装包推荐">下载安装包</a> ·
  <a href="https://edrin09.github.io/boki/">官网</a> ·
  <a href="https://gitee.com/edrin/boki">码云镜像</a>
</p>

---

## BOKI 是什么

**一套装在自己电脑上的开源财务软件：录入凭证、出报表、管多家公司，AI 帮你记账，数据库整库加密，断网也能用。**

- **给谁用**：小微企业、个体工商户、代理记账公司，以及要求数据不出内网的团队
- **凭什么**：库文件被拷走也打不开（SQLCipher 整库加密）；没有云端、没有埋点、没有遥测
- **怎么用**：免环境安装包装完即用；内核免费开源，要什么功能装什么插件（14 个官方插件）

---

## 🎬 30 秒演示：AI 一句话记账

> 打字或说话都行。AI 解析成凭证草稿，你确认后才入账 —— 本演示由真实运行实例录制。

<video src="https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/assets/ai-bookkeeping-demo.mp4" autoplay muted loop playsinline></video>

🔍 [下载高清版 MP4（1440p，15 秒）](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/assets/ai-bookkeeping-demo.mp4)

流程只有三步：

1. **说一句话** ——「记一笔 800 的水电费，银行付的」，支持语音（按住 Alt）或直接打字
2. **改确认卡片** —— AI 生成凭证草稿：科目、金额、往来单位全部可改，科目只能从科目表选，不会写错
3. **确认执行** —— 一律生成**草稿凭证**，在凭证列表复核、审核后才正式入账，AI 永远不直接动账

同一套能力还覆盖：**发工资、添加员工、修改凭证、审核凭证**，以及上传发票 PDF / 扫描件自动识别生成凭证（本地 OCR）。五类操作全部先预演、再人工确认，操作留审计记录。

---

## 🧩 它能做什么

| | 能力 | 说明 |
|:--|:--|:--|
| 🤖 | **AI 智能记账** | 一句话记账 / 发工资 / 审凭证；发票 PDF、扫描件上传自动识别去重生成凭证；语音查账 + 导出 Excel。**AI 全链路可离线**（本地 OCR + 本地语音识别 + 本地大模型） |
| 📒 | **复式记账** | 借贷必相等前后端双重强校验；75 个中文科目预置；辅助核算（往来单位/部门/项目） |
| 📊 | **财务报表** | 资产负债表、利润表、科目余额表、试算平衡表、明细账、票据台账、经营看板，导出 Excel |
| 🗓️ | **期末结转** | 一键结转本期损益并生成结转凭证；已结转期间锁定，禁止新增、修改、删除、反审核凭证，历史账不可被改 |
| 🔁 | **固定费用** | 房租、宽带、水电等周期性支出按模板自动生成单据与凭证，支持补漏生成、幂等去重、月结检查提醒 |
| 👥 | **员工辅助核算** | 工资、报销、借款按员工/部门逐条拆分辅助核算；期初余额、明细账支持员工维度筛选，个人往来可结清 |
| 🏦 | **银行流水** | 对账单导入自动去重，智能匹配往来单位、员工、工资、社保、税费、房租等关键词，高置信流水一键批量入账 |
| 🏢 | **多公司** | 一个账号管多家记账公司，数据完全隔离，顶部一键切换 |
| 🧩 | **插件化** | 内核只留记账引擎，14 个官方插件按需安装，不装的插件界面里不留痕迹 |
| 🔐 | **安全** | SQLCipher 整库加密 + 附件 AES-256-GCM + RBAC 权限 + 审计日志 + 备份密钥校验 |
| 💻 | **桌面安装包** | 不装 Node、不装数据库、不能联网的机器装完即用，同机即局域网服务器 |

<details>
<summary>📸 更多界面截图（真实运行实例）</summary>

**科目余额表** — 期初、本期借贷、期末余额，余额方向由复式记账规则自动判定

![科目余额表](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/screenshots/subject-balance.jpg)

**插件市场** — 官方插件一键安装，自动补齐依赖，有更新直接显示「更新」按钮

![插件市场](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/screenshots/plugin-market.jpg)

</details>

---

## 🚀 快速开始

### 方式一：下载安装包（推荐）

| 平台 | 下载 |
|:--|:--|
| Windows x64 | [GitHub Releases (latest)](https://github.com/edrin09/boki/releases/latest) · [Gitee 发行版](https://gitee.com/edrin/boki/releases) |

当前最新版本 **v1.1.0**，安装包文件名 `BOKI-Setup-1.1.0.exe`（约 410 MB）。自带运行时，离线可装；由 **西安市未央区鹏云智码软件开发部（个体工商户）** 签名发布。浏览器提示 SmartScreen 拦截时点「仍要运行」即可。

### 方式二：源码运行

```bash
# 终端 1 —— 后端（端口 3000）
cd backend
npm install
copy .env.example .env        # macOS/Linux 用 cp
npm run start:dev             # 首次启动自动建加密库 + 种子数据

# 终端 2 —— 前端（端口 5173）
cd frontend
npm install
npm run dev                   # 打开 http://localhost:5173
```

### 默认账号（首次登录后请改密码）

| 角色 | 账号 | 密码 |
|:--|:--|:--|
| 超级管理员 | `admin` | `123456` |
| 会计 | `accountant` | `123456` |
| 出纳 | `cashier` | `123456` |
| 查看员 | `viewer` | `123456` |

> 离线 AI 能力按需下载模型：`npm run models:fetch`（OCR 约 25MB）、`npm run models:fetch-asr`（语音识别约 160MB）；大模型可接 Ollama / llama.cpp 本地推理，也可接 DeepSeek、通义千问等云端 API。模型没就绪不影响其余功能使用。

---

## 🔐 数据安全，两句话说清

1. **数据库整库加密，默认开启、零配置**：密钥文件 `vault.key` 生成在程序目录，没有它库就打不开——**备份 / 搬机器请务必连它一起带走**。
2. **没有任何外传**：无云端依赖、无第三方 SDK 回传、无埋点遥测，代码可审计。

安全架构细节（HKDF 密钥派生、附件加密、备份校验、已知边界）见[官网](https://edrin09.github.io/boki/)与 [SECURITY.md](.github/SECURITY.md)。

---

## 🧱 14 个官方插件

| 插件 | 能力 | 插件 | 能力 |
|:--|:--|:--|:--|
| `receipts` | **AI 智能记账**（票据 + 一句话记账） | `report-pack` | 报表包 / 月结 / 经营看板 |
| `ai` | AI 模型接入（本地 / 云端） | `voice` | 语音助手（查账 + 语音通道） |
| `ocr` | 离线 OCR 引擎 | `hr` | 员工 / 报销 / 工资 |
| `banks` | 资金账户 | `cash-bank` | 收付款 / 转账 / 报销 |
| `ar-ap` | 往来核销 | `income-expense` | 其他收支 / **固定费用** |
| `departments` | 部门档案 | `projects` | 项目档案与辅助核算 |
| `iam` | 用户 / 角色 / 权限管理 | `multi-company` | 多公司管理 |

在应用内「插件市场」安装；插件唯一来源是远程插件市场（配置 `PLUGIN_MARKET_URL` 与验签公钥），详见 [插件发布与升级手册](docs/插件发布与升级手册.md)。零插件状态也能完成「登录 → 建账 → 记账」完整闭环。

---

## 📁 更多文档

- [AI 语音记账插件：需求与开发文档](docs/AI语音记账插件-需求与开发文档.md) —— 一句话记账的完整设计（预演 / 令牌 / 确认协议）
- [插件发布与升级手册](docs/插件发布与升级手册.md) · [开源运营与赞助落地方案](docs/开源运营与赞助落地方案.md)
- 社区规范：[CONTRIBUTING](.github/CONTRIBUTING.md) · [行为准则](.github/CODE_OF_CONDUCT.md) · [安全策略](.github/SECURITY.md) · [隐私](.github/PRIVACY.md) · [条款](.github/TERMS.md)

---

## 💬 联系与支持

**BOKI 由西安市未央区鹏云智码软件开发部（个体工商户）开发维护**

| 渠道 | |
|:--|:--|
| 📮 邮箱 | y_p09@163.com |
| 📞 电话 | 15389232340 |
| 💬 微信 | PengYunZhiMa |
| 🌐 官网 | https://edrin09.github.io/boki/ |

- **企业私有化部署 / 商业授权（豁免 AGPL 传染性）**：邮件说明规模与部署环境，可开票
- **赞助**：[爱发电](https://afdian.com/a/edrin) / 微信 / 支付宝，企业赞助见 [SPONSORS.md](.github/SPONSORS.md)

---

## 📄 License

- **内核**（backend / frontend / desktop）：[AGPL-3.0](./LICENSE) —— 自由使用、修改、分发；改成网络服务对外提供时须同样开源
- **官方插件**：Apache-2.0，可自由复用
- 闭源商用请购买[商业授权](#-联系与支持)；品牌资产（logo / 商标）不在开源许可范围

<!--
Keywords: 开源记账软件, 免费财务软件, 复式记账, 数据库加密, SQLCipher, 私有化部署, 内网部署, 离线记账, 会计软件, 代理记账, 小微企业记账, AI 记账, 电子发票识别, 发票 OCR, 一句话记账, open-source accounting software, self-hosted bookkeeping, offline-first finance, double-entry bookkeeping, encrypted database, invoice OCR, local-first
-->

<p align="center">
  <sub>BOKI — 你的数据，永远只属于你。</sub>
</p>
