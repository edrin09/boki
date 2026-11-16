# 为什么我们不让 AI 直接改账：草稿闸门的设计

给财务软件接 AI，最先想到的是"让它帮我记账"。做了三个版本之后我的结论是：**让 AI 记账不难，难的是让它记完账不能自己签字。**

这篇文章讲我们怎么用代码把一个架构约束钉死——不是写在文档里的"建议"，是写进注册流程和执行路径的"做不到"。

![AI 动作的五步链路：人说一句 → 模型听懂 → 服务端只读预演 → 人点确认 → 只落草稿](https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki/articles/open-flow.png)

*全文要解释的就是这张图里「第 3 步只读」和「第 5 步只落草稿」为什么必须由代码保证。*

---

## 一、先把问题建模

AI 写操作，按"落点"可以分成四类：

| 落点 | 含义 | 例子 |
|---|---|---|
| `direct` | 直接生成已生效数据 | AI 直接创建一张**已审核**的凭证 |
| `draft` | 生成草稿，等人处理 | AI 创建凭证草稿，状态 `draft` |
| `archive` | 只建档案，不影响账簿 | AI 新增员工档案 |
| `list` | 只跳转到列表 | 只做查询引导 |

财务系统的特殊性在于：**凭证一旦"已审核"就计入账簿和报表**。所以 `direct` 这一类，在我们这个产品里是不能存在的——不是"默认关闭"，是**不存在**。

于是有了第一行代码：

```ts
/** landing 白名单：注册期校验用，故意不提供 direct */
export const AI_LANDINGS = ['draft', 'list', 'archive'] as const
```

`AiLanding` 类型从它推导，声明动作时只能填这三个之一。TypeScript 层面先挡一层。

但类型只是编译期约束，插件是运行时加载的（我们支持第三方插件注册 AI 动作），所以还需要运行期的两道闸。

---

## 二、注册期闸：起不来的进程

插件注册 AI 动作时走 `AiActionRegistry.register()`，第一件事就是校验落点：

```ts
// ai-action.registry.ts
register(manifest: ActionManifest) {
  assertLanding({ ...manifest, id })      // 不合法直接 throw
  // ... 写入注册表
}
```

`assertLanding` 的实现很简单，但错误信息写得很啰嗦，是故意的：

```ts
export function assertLanding(manifest: ActionManifest): AiLanding {
  const landing = manifest?.landing
  if (!landing || !AI_LANDINGS.includes(landing)) {
    throw new Error(
      `动作「${manifest?.id ?? '(未命名)'}」未声明合法 landing` +
      `（只允许 ${AI_LANDINGS.join(' / ')}），注册已拒绝`
    )
  }
  return landing
}
```

**为什么要在启动期抛错，而不是运行时返回一个 400？**

因为返回 400 意味着"这个动作只是这次失败了"，进程还活着，其他人还能继续用。而我们的目标是：**如果有人写了 `landing: 'direct'`，整个应用起不来**。开发者必须立刻看到这个问题，而不是等线上某次调用才发现。

这是一个常见的取舍：启动严格、运行宽松，还是反过来。安全相关的配置项，我们一律选前者。

顺带一提，这个校验对内核动作和插件动作一视同仁。目前已注册的 7 类动作用的是 `draft` / `list` / `archive` 的组合，没有一个能直通。

---

## 三、执行期闸：不信适配器

注册期只能保证"声明的落点合法"，保证不了"实际干了什么"。

比如一个动作声明了 `landing: 'draft'`，但适配器内部可能调用了 `voucherService.approve()`——它甚至不用改声明。这在动态插件模型里防不住，因为适配器是插件自己的代码。

所以还需要第三层：**执行完扫一遍结果**。

```ts
const STATE_KEYS = new Set([
  'status', 'state', 'newStatus',
  'voucherStatus', 'payrollStatus', 'docStatus', 'approveStatus',
])

const FORBIDDEN_STATES = new Set([
  'approved', 'audited', 'paid', 'posted',
  'issued', 'settled', 'confirmed', 'completed',
])

export function assertDraftOnly(result: unknown, actionId = ''): void {
  const hit = scan(result, 0)
  if (hit) {
    throw new DraftGateViolation(
      `动作「${actionId || '未知'}」返回了 ${hit.key}=${hit.value}，AI 路径不允许产生已生效数据`
    )
  }
}
```

`scan` 是个深度受限（5 层）的递归遍历，只在**约定的状态字段名**上判断，避免误伤普通业务字段（比如一个叫 `status` 的字符串恰好是 `'paid'` 的备注字段——这种会误报，但我们宁可误报）。

调用点在两个地方：

```ts
// 通用单据提交动作
assertDraftOnly(result, `doc.submit:${def.key}`)

// 语音/文字网关执行动作后
assertDraftOnly(result, actionLabel)
```

注意第二个调用点：**网关是唯一的执行出口**。所有 AI 发起的写操作都要经过它，所以在这里兜一次底，覆盖所有动作，包括未来插件新增的。

---

## 四、为什么不用"信任 + 代码审查"

有人会问：你都有 code review 了，为什么不靠规范？

因为规范会腐化，而且腐化的方式很隐蔽。举个具体的例子：

```ts
// 三个月后某人为了"体验更顺滑"加的一行
const voucher = await voucherService.create({ ...args, status: 'approved' })
```

这一行在 diff 里毫不起眼，reviewer 大概率会放过——它长得像一次普通的参数传递。而 `assertDraftOnly` 会让它**在第一次执行时就抛错**，连带把测试打断。

也就是说，闸门的作用不是"阻止恶意"，而是**给善意的手滑设定一个立即反馈**。

我认为这是所有"约束类架构"的共同点：你没法阻止人犯错，但可以让人犯错的代价从"线上数据污染"降到"一个红色堆栈"。

---

## 五、幂等：确认两次不等于记两笔

闸门管的是"能不能生效"，还有一个相邻问题：**同一条指令被确认两次会怎样？**

场景很真实：网络卡，用户点了两下"确认执行"；或者前端重试逻辑触发了两次请求。

`TokenStore` 的处理是：`commit` 成功后把结果写回令牌条目，重复提交直接返回同一份结果：

```ts
commit(token, companyId, userId, exec: () => Promise<T>) {
  const payload = this.require(token, companyId, userId)
  if (payload.committed) return payload.committed   // 幂等返回
  // ... 执行并写回
}
```

接口返回里带 `idempotent: true`，前端提示"已处理过"，用户不会以为失败又去点一次。

---

## 六、怎么证明"真的没有直通分支"

这是我比较在意的一点：**安全声明必须可验证**，否则只是文案。

三个层次的验证：

**1）静态可查**

```bash
$ grep -rn "landing.*direct" backend/src/
# 无输出
```

**2）行为可查**

```bash
# 让 AI 审一张凭证
$ curl -s -X POST .../api/mcp -d '{"method":"tools/call",
    "params":{"name":"voucher.approve"}}'
{"error":{"message":"工具不存在：voucher.approve"}}
```

**3）端到端复测**

我们把 AI 的五类动作（记账 / 发工资 / 加档案 / 改凭证 / 审凭证）做成场景脚本，三遍互不重叠的数据跑下来：41/41、48/48、51/51 全通过。每次改 AI 相关代码都跑一遍。

第三层最贵，但也最有说服力——它验证的是"行为"而不是"意图"。

---

## 七、这套设计的局限

诚实列三条：

**1）扫描是启发式的。** 它依赖"状态字段叫 `status` / `state` / `newStatus` 这类约定名"。如果有人写了个 `pgStatus: 'approved'`，扫不到。这是用约定换简单，接受。

**2）不防"绕过路径"。** 如果某个适配器直接调用了数据库连接而不返回结果，`assertDraftOnly` 看不到。真正的兜底是"执行出口唯一"这个架构约束——目前 AI 写操作只有网关一条路，但这需要持续维护。

**3）多了一步人工确认。** 这是产品代价，不是技术代价。有些人就想要全自动，我们没做。

---

## 八、小结

三句话总结这套设计：

1. **落点是类型**：`AI_LANDINGS` 里没有 `direct`，编译期就没有这个选项；
2. **声明在启动期校验**：写错 landing，进程起不来，而不是运行时 400；
3. **结果在执行期扫描**：适配器返回已生效状态就抛错，不静默接受。

再补一句我越来越确信的话：**AI 产品的安全边界，不该建在提示词上，该建在类型和启动流程上。** 提示词能被绕过，类型不能。

---

代码在 GitHub `edrin09/boki`（内核 AGPL-3.0，官方插件 Apache-2.0），闸门实现在 `backend/src/modules/ai-bridge/landing.ts`，欢迎来挑刺——尤其是第七节那三条局限，我很想知道还有哪些绕过方式没被想到。
