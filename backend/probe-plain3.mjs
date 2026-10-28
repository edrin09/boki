// probe-plain3.mjs —— 692F4 ⇄ A35 云端透传：自动重连探针（韧性测试）
//
// 用途：模拟 A35 重启 / 4G 抖动导致的断线，验证链路恢复能力。
//   首次建连成功后，人为断开，按指数退避重连 N 次，
//   统计：重连成功率、每次重连耗时、平均恢复时间。
//
// 依赖：仅 Node 内置 net / util。
//
// 用法：
//   node backend/probe-plain3.mjs --id 1 --attempts 5 --drop-after 3000
//   # --drop-after：连上后多少毫秒主动断开以触发重连（默认 3000ms）
//   # --max-wait：每次重连最大等待（默认 10000ms），退避 = min(2^n * 500, max-wait)

import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.RELAY_HOST || '127.0.0.1' },
    base: { type: 'string', default: process.env.RELAY_BASE || '20000' },
    span: { type: 'string', default: process.env.RELAY_SPAN || '16' },
    id: { type: 'string', default: process.env.RELAY_ID || '1' },
    attempts: { type: 'string', default: process.env.RELAY_ATTEMPTS || '5' },
    dropAfter: { type: 'string', default: process.env.RELAY_DROP_AFTER || '3000' },
    maxWait: { type: 'string', default: process.env.RELAY_MAX_WAIT || '10000' },
    payload: { type: 'string', default: process.env.RELAY_PAYLOAD || 'PING' },
  },
});

const base = parseInt(values.base, 10);
const span = parseInt(values.span, 10);
const id = parseInt(values.id, 10);
const port = base + ((id - 1) % span);
const attempts = parseInt(values.attempts, 10);
const dropAfter = parseInt(values.dropAfter, 10);
const maxWait = parseInt(values.maxWait, 10);

let attempt = 0;
const reconnectMs = [];

function connectOnce() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: values.host, port });
    const t0 = Date.now();
    let got = false;
    sock.setTimeout(5000);
    sock.on('connect', () => sock.write(values.payload));
    sock.on('data', (d) => {
      if (!got) {
        got = true;
        console.log(`  [attempt ${attempt}] 连上+回显(+${d.length}B) 耗时 ${Date.now() - t0}ms`);
        resolve({ sock, ok: true, ms: Date.now() - t0 });
      }
    });
    sock.on('timeout', () => { try { sock.destroy(); } catch { /* */ } resolve({ ok: false, reason: 'timeout' }); });
    sock.on('error', (e) => resolve({ ok: false, reason: e.code || e.message }));
    sock.on('close', () => { if (!got) resolve({ ok: false, reason: 'close' }); });
  });
}

async function run() {
  for (attempt = 1; attempt <= attempts; attempt++) {
    const r = await connectOnce();
    if (!r.ok) {
      console.log(`  [attempt ${attempt}] 失败: ${r.reason}`);
      if (attempt < attempts) {
        const backoff = Math.min(2 ** (attempt - 1) * 500, maxWait);
        console.log(`  退避 ${backoff}ms 后重试...`);
        await new Promise((res) => setTimeout(res, backoff));
      }
      continue;
    }
    reconnectMs.push(r.ms);
    console.log(`  [attempt ${attempt}] 成功，将在 ${dropAfter}ms 后主动断开以触发重连...`);
    await new Promise((res) => setTimeout(res, dropAfter));
    try { r.sock.destroy(); } catch { /* */ }
    if (attempt < attempts) {
      const backoff = Math.min(2 ** (attempt - 1) * 500, maxWait);
      await new Promise((res) => setTimeout(res, backoff));
    }
  }

  const ok = reconnectMs.length;
  const avg = ok ? Math.round(reconnectMs.reduce((a, b) => a + b, 0) / ok) : 0;
  console.log(`\n结果: 重连成功 ${ok}/${attempts}，平均恢复耗时 ${avg}ms`);
  console.log(`每轮耗时: ${reconnectMs.join(', ')}ms`);
  process.exit(ok === attempts ? 0 : 1);
}

run();
