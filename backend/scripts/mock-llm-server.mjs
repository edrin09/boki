/**
 * 模拟 OpenAI 兼容大模型服务（仅本地验证用，127.0.0.1:9393）。
 * POST /v1/chat/completions → 根据消息内容回固定话术。
 * 用法：node scripts/mock-llm-server.mjs
 */
import http from 'node:http'

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404).end()
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let content
    try {
      const payload = JSON.parse(body)
      const text = payload.messages?.map((m) => m.content).join('\n') ?? ''
      if (text.includes('意图路由器')) {
        // 自由说法 → 员工借款余额
        content = text.includes('还') && text.includes('借') ? '{"intentId":"loan.balance"}' : '{"intentId":""}'
      } else {
        // 话术润色：原样返回并加个前缀，证明走的是模型
        content = `【AI润色】${text.split('文案：')[1]?.trim() ?? '润色失败'}`
      }
    } catch {
      content = '{"intentId":""}'
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
})

server.listen(9393, '127.0.0.1', () => console.log('mock LLM on http://127.0.0.1:9393/v1'))
