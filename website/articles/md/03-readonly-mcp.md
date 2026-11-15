# 只读 MCP：让 Claude 查你的账本，但改不了它

MCP（Model Context Protocol）现在已经是 AI 客户端接外部工具的通用接口。Claude Desktop、Cursor、各种 Agent 框架都支持。

对财务软件来说，这个协议的诱惑非常直接：让用户对着 AI 说"这个月收支怎么样""谁还欠我钱"，AI 自己去查库、算好、组织成人话回你。体验比点菜单好太多。

但危险同样直接：**能查的接口，稍不留神就变成能写的接口**。

这篇文章讲我们怎么把 MCP 服务端做成"物理只读"——不是靠权限配置，是代码里没写写操作。

---

## 一、先想清楚：财务场景的读写不对称

一般的 MCP 服务端会提供一组混合能力：查天气、发邮件、建工单。读写比例看业务。

财务不一样，因为**写操作是不可逆的，而且会传播**：

- 一张凭证被审核 → 计入账簿 → 影响报表 → 影响税
- 一个金额填错 → 资产负债表、利润表、科目余额表全错
- 而且这些错误不会立刻报错，它们看起来都是"合法数据"

所以我们的结论是：**MCP 这一层只读，写操作不开放给外部 AI 客户端**。

不是"暂时不开放"，是架构上不提供。理由有三：

1. 外部客户端的确认交互我们控制不了。它可能一句"好的我来办"就调了，用户根本没看清；
2. 审计链会断。AI 客户端调了什么、以什么理由调，我们只能看到一次 HTTP 请求；
3. 一旦开放，边界会不断被推。"就加一个改凭证吧""就加一个审核吧"——这种滑坡在真实项目里一定会发生。

网页端里 AI 只能出草稿、人点确认，这条链路上的读写分离是清楚的。MCP 保持同样的姿态就行：**看可以，改不行。**

---

## 二、协议面：只实现四个方法

MCP 的 HTTP 传输有几种形态（stdio、SSE、streamable HTTP）。我们只做了 streamable HTTP 里最核心的一条：**JSON-RPC 2.0 over POST**。

实现的方法只有四个：

| 方法 | 作用 |
|---|---|
| `initialize` | 握手，声明能力 |
| `tools/list` | 列出可用工具 |
| `tools/call` | 调用工具 |
| `ping` | 保活 |

`resources` / `prompts` / `sampling` 一概不实现。有客户端会先发 `resources/list` 探测，我们会明确告诉它没有：

```bash
$ curl -s -X POST .../api/mcp -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":10,"method":"resources/list"}'

{"jsonrpc":"2.0","id":10,"error":{"code":-32603,"message":"不支持的方法：resources/list"}}
```

还有客户端会先 `GET` 一下看看有没有 SSE 通道，我们也明确拒绝：

```bash
$ curl -s -i .../api/mcp -H "Authorization: Bearer $TOKEN"

HTTP/1.1 405 Method Not Allowed
{"jsonrpc":"2.0","error":{"code":-32600,
  "message":"本服务只支持 POST JSON-RPC（只读工具，无 SSE 通道）"}}
```

**为什么不做 SSE？**

SSE 是为了服务端主动推送（长任务进度、异步事件）。我们所有工具都是同步查询，几百毫秒返回，没有推送需求。为一个用不上的能力去维护长连接、心跳、重连、并发上限，是纯负担。

而且长连接在财务这种"内网单机"场景里还有个现实问题：**防火墙和反向代理经常把它掐掉**。少一个形态，少一类线上问题。

`initialize` 的返回里我把 `instructions` 也写了进去，客户端会把这段给模型看：

```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": { "listChanged": false } },
  "serverInfo": { "name": "boki", "version": "1.0.0" },
  "instructions": "本服务只提供只读查询（凭证、科目、余额、账簿）。所有工具都不会修改数据；如需记账请用网页端或 AI 指令面板。"
}
```

一句大白话告诉模型边界，比藏在文档里有用。

---

## 三、注册表：非只读工具进不来

真正的护栏在注册表入口：

```ts
register(tool: McpTool) {
  if (tool.readOnly !== true) {
    throw new Error(`MCP 工具「${tool?.name ?? '?'}」必须声明 readOnly: true`)
  }
  // ... 写入注册表
}
```

`readOnly: true` 是必填的显式声明，不是默认值。**想注册写工具，得先改这行代码** —— 那已经不是配置错误，是有人主动拆护栏，会在 review 里被看到。

`tools/list` 返回时还会带标准注解：

```ts
annotations: { readOnlyHint: true, title: tool.title }
```

这样客户端 UI 里也会显示"只读"徽标。

---

## 四、8 个工具，全是查询

当前注册了 8 个：

| 工具名 | 说明 |
|---|---|
| `voucher.search` | 按期间/状态/关键字分页查凭证 |
| `voucher.get` | 按 ID 查一张凭证的完整分录 |
| `account.search` | 按关键字/类别查会计科目 |
| `account.balance` | 查指定期间科目余额表 |
| `books.trial_balance` | 试算平衡表 |
| `books.ledger` | 某科目明细账 |
| `hr.loan.search` | 员工借款单查询 |
| `hr.expense_claim.search` | 费用报销单查询 |

前 6 个来自内核，后 2 个由 HR 插件在启动时注册 —— **插件可以扩工具，但同样受"必须只读"约束**。

![真实会话：tools/list 返回 8 个 readOnly: true，tools/call 试算平衡拿到真实数据，voucher.approve 返回「工具不存在」](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/mcp-notfound.png)

*这是用自建调试台连 `POST /api/mcp` 的原始输出，不是示意图。*

实际调一次：

```bash
$ curl -s -X POST .../api/mcp -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
         "params":{"name":"books.trial_balance","arguments":{"period":202611}}}'
```

返回的是 MCP 标准的 `content` 数组，`text` 里放人可读的表格摘要 + JSON：

```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text",
  "text":"试算平衡 202611-202611\n{\"period\":{...},\"rows\":[\n    {\"code\":\"1001\",\"name\":\"库存现金\",\"closingBalance\":1240},\n    {\"code\":\"1002\",\"name\":\"银行存款\",\"closingBalance\":30340}, ...]}"}]}}
```

**为什么既给文字又给 JSON？** 因为不同模型对结构化数据的消化能力不一样。文字摘要让它"看懂"，JSON 让它"算准"。两个都给，成本很低。

---

## 五、身份与权限：跟网页端同一套

MCP 服务端不是独立账号体系，它走全局 JWT 守卫：

```ts
// 调用时按当前用户再校验一次工具权限
const user = getCurrentUser(req)
this.assertPermission(user, tool.permission)
```

也就是说：

- 用一个只有"查询凭证"权限的账号连 MCP，`account.balance` 会返回权限不足；
- 换账号、换账套，看到的数据跟着变；
- 所有调用都进审计日志。

这条设计我很坚持：**外部 AI 客户端不应该是一个特权通道**。它就是"另一个 UI"，权限和数据边界跟网页完全一致。

---

## 六、接进 Claude Desktop / Cursor

服务端是标准 MCP，客户端配一下就能用。以 HTTP 传输为例：

```json
{
  "mcpServers": {
    "boki": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "headers": { "Authorization": "Bearer <你的 JWT>" }
    }
  }
}
```

Token 从网页端登录后拿（`localStorage.financial_token`），或者用 `/api/auth/login` 换。

配完问它一句"这个月收支怎么样"，它会自己调 `books.trial_balance` 和 `voucher.search`。

**几个实际踩过的点：**

1. **Token 会过期**（默认 8 小时）。过期后调用返回 401，客户端一般表现为"工具调用失败"。建议专门建一个只读账号，用它登录换一个长效 token。
2. **部分客户端不支持自定义 header**。那种情况要么用支持 HTTP 传输的客户端，要么在前面挂个带鉴权的反向代理。
3. **不要去开 `resources`**。有些客户端看到 `resources` 能力会尝试读文件系统语义的东西，我们本来就不提供，省得歧义。

---

## 七、边界与残留风险

说清楚这套东西**不能**保证什么：

**1）token 泄露 = 查询权限泄露。** 只读也一样危险——科目余额、客户往来、员工借款，这些是商业信息。所以别把 token 提交到 Git，别在共享机器上开长有效期。

**2）只读不等于"无害"。** 高频查询会打满 CPU（尤其是试算平衡这种全表聚合）。我们没有做严格限流，单机场景觉得够用。如果要放到多人共用的服务器上，得加限流。

**3）不防"社工"。** 有人可以诱导模型把查询结果发到外部。这是模型侧的问题，服务端管不了——能做的是把 `instructions` 写清楚，以及让用户知道"连了 MCP 就等于把查询权给出去了"。

**4）"只读"靠一层校验。** 如果有人改 `readOnly !== true` 那行，护栏就没了。这是代码而非配置的必然——所以我把它放在最显眼的位置，并且写进了 README 的安全章节。

---

## 八、小结

三句话：

1. **MCP 对财务软件的价值是"查"**：让 AI 替你读账、算账、解释账，这个场景已经足够大；
2. **写操作不开放**：不是权限配置，是注册表入口就拒绝，工具不存在；
3. **权限与审计复用网页端那套**：外部客户端不是特权通道。

MCP 生态现在跑得很快，各种 server 在冒出来。我的判断是：**to B 场景里，"只读 + 明确的 instructions"会成为默认姿势**——不是能力不够，是责任边界必须清楚。

---

附一张四类方案的边界对照（只列事实，可自行验证）：

![云端 SaaS / 本地 ERP / 通用 AI 助手 / BOKI 四类方案对照](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/comparison.png)

项目开源：GitHub `edrin09/boki`（内核 AGPL-3.0），MCP 实现在 `backend/src/modules/mcp/`。官网有 20 秒录屏，就是把上面这几条 curl 真跑一遍，包括"调写工具返回工具不存在"。

想听的问题：你们在生产里接 MCP，是给只读还是给读写？中间加了几层确认？
