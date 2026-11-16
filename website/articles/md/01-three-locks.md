# 我把 AI 接进财务软件，然后给它上了三道锁

先交代背景：我做了个开源财务软件（BOKI，复式记账 + 凭证 + 报表），去年底开始琢磨着把 AI 接进去。

动机特别朴素——我自己记账最烦的不是做账，是**录入**。一张报销单，摘要、科目、金额、日期、往来单位，五个字段来回点。如果有 AI，我说一句「陈晓报销客户拜访打车费 128，现金付的」，它把卡片填好，我点一下确认，这事就完了。

做完之后效果确实可以。但真正花时间的地方不是「让它听懂」，而是**让它别乱动**。这篇就聊后面这段。

---

## 第一版：非常天真

最开始的实现，现在回头看简直是灾难：

```ts
// 第一版伪代码
const plan = await llm.parse(text)
if (plan.action === 'voucher.create') {
  return await voucherService.create(plan.args)   // 直接落库
}
```

问题一眼可见：**模型 hallucinate 一次，你的账就多一张凭证**。金额错一位、科目选错、日期跑到上个月——这些都不会报错，因为从数据库角度看它就是一张合法凭证。等你发现，可能已经结账了。

更隐蔽的是：如果哪天有人往这个分支里加一句 `autoApprove: true`（比如为了「体验更顺滑」），AI 就真的能自己过账了。而这类改动在 code review 里非常不起眼——它看起来只是少了一次点击。

所以我给自己定了个规矩，后来变成了整个项目的架构原则：

> **开放的是接口和意图，收紧的是落点。**

模型随你换、话随你说、外部 AI 客户端也能连进来查账；但**所有写入只能落在草稿上**，人点了确认才算数，审核永远是人做的。

这个原则落地成三道锁。

---

## 锁一：草稿闸门 —— 让「AI 直接过账」写不出来

我把 AI 动作的终点抽象成一个字段：`landing`（落点）。它只有三个合法值：

```ts
export const AI_LANDINGS = ['draft', 'list', 'archive'] as const
```

注意这里**故意没有 `direct`**。不是「先不做」，是类型层面就不给这个选项。

![AI 动作的五步链路：人说一句 → 模型听懂 → 服务端只读预演 → 人点确认 → 只落草稿](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/open-flow.png)

*这条链路上没有分支：第 5 步的落点被写死在三个值里。*

然后是两道校验。

**注册期**：插件注册 AI 动作时，必须声明合法 landing，否则注册直接失败、进程起不来：

```ts
export function assertLanding(manifest: ActionManifest): AiLanding {
  const landing = manifest?.landing
  if (!landing || !AI_LANDINGS.includes(landing)) {
    throw new Error(
      `动作「${manifest?.id}」未声明合法 landing（只允许 ${AI_LANDINGS.join(' / ')}），注册已拒绝`
    )
  }
  return landing
}
```

**运行期**：适配器返回结果里如果出现「已生效」状态，直接抛错，不静默接受：

```ts
const FORBIDDEN_STATES = new Set([
  'approved', 'audited', 'paid', 'posted',
  'issued', 'settled', 'confirmed', 'completed',
])

export function assertDraftOnly(result: unknown, actionId = '') {
  const hit = scan(result, 0)
  if (hit) {
    throw new DraftGateViolation(
      `动作「${actionId}」返回了 ${hit.key}=${hit.value}，AI 路径不允许产生已生效数据`
    )
  }
}
```

`scan` 递归遍历结果（深度上限 5 层，只查 `status` / `state` / `newStatus` 这类约定键名），发现 `approved`、`posted`、`paid` 就地拦截。

这套东西的价值不在于「拦截了一个坏结果」，而在于**把「顺手写个直通分支」变成启动即失败**。有人真想绕过，得同时改白名单、改禁用状态表、再改校验——那已经不是「顺手」了，是明目张胆。

---

## 锁二：一次性令牌 —— 让「替别人确认」失效

AI 出卡片的时候，服务端会签一个令牌。这个令牌绑了三样东西：

1. **当前用户**（`userId`）
2. **当前账套**（`companyId`）
3. **载荷哈希**（`previewHash`，卡片上所有字段算出来的）

有效期 15 分钟，`commit` 一次即作废；重复提交不重复入账，直接返回上次结果（幂等）。

```ts
require(token, companyId, userId): TokenPayload {
  const found = this.entries.get(token)
  if (!found) throw new BadRequestException('指令已失效，请重新说一遍')
  if (found.expiresAt < Date.now()) throw new BadRequestException('已超过 15 分钟')
  if (found.companyId !== companyId) throw new BadRequestException('...')
  if (found.userId !== userId) throw new BadRequestException('...')
  // ...
}
```

设计意图很直白：**卡片是「你」的，不是「这一条请求」的**。别人拿到 token 也没用——换个人提交直接被拒。

顺便说个坑：这套校验里我埋过一个真漏洞，属于「安全校验依赖一个约定存在的字段，而那个字段当时是 `undefined`」，导致 `undefined === undefined` 恒成立，任何人都能替别人确认指令。细节我单独写了一篇复盘（链接在文末），这里只说教训：**参与安全判断的字段，必须 fail-closed**。

---

## 锁三：只读 MCP —— 让外部 AI 能查不能改

MCP（Model Context Protocol）是现在 AI 客户端接外部工具的通用协议。Claude Desktop、Cursor、各种 Agent 框架都支持。

财务场景里，这东西的诱惑很大：让你的 AI 助手直接查「这个月收支怎么样」「谁还欠我钱」，体验非常好。但风险同样直白：**如果 AI 客户端能写，那它就等于拿到了一把能改账的钥匙**。

我的做法是把 MCP 服务端做成**物理只读**：

```ts
register(tool: McpTool) {
  if (tool.readOnly !== true) {
    throw new Error(`MCP 工具「${tool.name}」必须声明 readOnly: true`)
  }
  // ...
}
```

注册表在入口就拒绝任何非只读工具。现在一共 8 个工具，全是查询：凭证查询、凭证详情、科目查询、科目余额、试算平衡表、明细账、借款单查询、报销单查询。

试试写操作会怎样：

```bash
$ curl -s -X POST http://127.0.0.1:3000/api/mcp \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":4,"method":"tools/call",
         "params":{"name":"voucher.approve","arguments":{"id":"v-0005"}}}'

{"jsonrpc":"2.0","id":4,"error":{"code":-32603,"message":"工具不存在：voucher.approve"}}
```

不是「权限不足」，是**工具不存在**。这条链路上根本没有「让外部 AI 改账」的能力——它不是一个配置开关，是代码里没写。

![真实 JSON-RPC 会话：8 个工具全带 readOnly: true，试算平衡查得出来，voucher.approve 返回「工具不存在」](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/mcp-notfound.png)

*这是外部 AI 客户端连进来的一次真实会话，不是示意图。*

另外每个工具还带自己的 permission，调用时按当前用户再校验一次，和网页端的 RBAC 是同一套。

---

## 代价

说点不好听的。

**第一，AI 不能全自动。** 用户点两下：确认卡片、审核凭证。我知道有人想要「全自动记账」，但那是另一个产品，不是财务软件。

**第二，模型能力受限于本地硬件。** 全离线的代价是没有 GPT-4 级别的理解力。我的实测是 30B MoE 在纯 CPU 上 13.67 tok/s、内存 18.5GB——写代码、读长文够用，但语感不如云端大模型。所以产品里把模型做成可切换的：想接 DeepSeek / 通义 / Kimi 随时切，接口全兼容 OpenAI 协议，换模型不改业务代码。

**第三，只读 MCP 的能力边界很窄。** 只能查，不能改。有人问我为什么不放几个写工具、加个「二次确认」——因为「二次确认」在客户端，客户端是别人写的，我控制不了。

---

## 现在做到哪了

- 一句话记账 / 发工资 / 加员工档案 / 改凭证 / 审凭证 / 申请借款 / 申请报销，7 类动作已交付；架构上扩到 40 类单据不用动内核（插件在启动期注册单据类型就行）
- 8 个只读 MCP 工具，Claude Desktop / Cursor 可直接连
- 本地 OCR（约 25MB）+ 本地流式语音识别（约 160MB）+ 可选本地大模型，断网全流程可用
- SQLCipher 整库加密，库文件拷走打不开（密钥 `vault.key` 不和库放一起）
- 内核 AGPL-3.0，官方插件 Apache-2.0

![BOKI 首屏：模型你选，账本不出门](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/site-hero.png)

项目开源：GitHub `edrin09/boki`，Gitee `edrin/boki`。官网有 70 秒真机录屏，包含「本地模型测试连接 156ms」和「AI 出草稿 → 人工审核」的完整流程。

---

## 你可以自己验三条

不用信我，装完自己敲：

```bash
# 1) 库里有没有「AI 直通过账」的落点？
$ grep -rn "landing.*direct" backend/src/    # 无输出

# 2) 写工具进不进得来 MCP 注册表？
$ grep -n "readOnly !== true" backend/src/modules/mcp/mcp-tool.registry.ts

# 3) 试着让外部 AI 审一张凭证
$ curl -s -X POST .../api/mcp -d '{"method":"tools/call",
    "params":{"name":"voucher.approve"}}'
# → {"error":{"message":"工具不存在：voucher.approve"}}
```

第 3 条最直接：不是拒绝你，是根本没有这个工具。

---

写完发现这篇更像「设计权衡记录」而不是产品介绍，就这样吧。评论区想听两件事：

1. 你觉得「AI 记账」到底该不该有全自动模式？如果该，边界在哪？
2. 只读 MCP 这个方向值不值得继续扩（比如加「导出」类工具）？

> 补充说明：文中数字都来自项目内的证据表（端到端复测 41/41、48/48、51/51；召回 8/8；30B MoE CPU 13.67 tok/s）。竞品我只做能力对比，不点名。
