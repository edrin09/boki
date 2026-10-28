// probe-plain.mjs —— 692F4 ⇄ A35 云端透传：基础连通性探针
//
// 用途：验证「端口即身份」链路是否打通。
//   连到云端透传端口 → 发一条测试帧 → 等待 A35 经 692F4 回显 → 打印往返时延(RTT)。
//   无握手、无注册包（dtumode=1 裸 TCP 透传），所以发什么、回什么完全由对端决定。
//
// 依赖：仅 Node 内置 net / util。无第三方包。
//
// 用法：
//   node backend/probe-plain.mjs --id 1
//   node backend/probe-plain.mjs --host relay.example.com --base 20000 --span 16 --id 1
//   # 或走环境变量：RELAY_HOST / RELAY_BASE / RELAY_SPAN / RELAY_ID / RELAY_PAYLOAD
//
// 端口算法（必须与云端中继一致）：port = base + (id - 1) % span
//
// 注：这是按项目记忆中 692F4/A35 隧道架构重建的调试脚本（原文件在 stash/gc 事故中丢失），
//     端口/主机等按你的实际部署改下面默认值或传参即可。

import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.RELAY_HOST || '127.0.0.1' },
    base: { type: 'string', default: process.env.RELAY_BASE || '20000' },
    span: { type: 'string', default: process.env.RELAY_SPAN || '16' },
    id: { type: 'string', default: process.env.RELAY_ID || '1' },
    payload: { type: 'string', default: process.env.RELAY_PAYLOAD || 'PING' },
    timeout: { type: 'string', default: process.env.RELAY_TIMEOUT || '5000' },
  },
});

const base = parseInt(values.base, 10);
const span = parseInt(values.span, 10);
const id = parseInt(values.id, 10);
const port = base + ((id - 1) % span);
const timeout = parseInt(values.timeout, 10);

function probe() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: values.host, port });
    const t0 = Date.now();
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (ok, info = {}) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* noop */ }
      resolve({ ok, ms: Date.now() - t0, ...info });
    };

    sock.setTimeout(timeout);
    sock.on('connect', () => {
      console.log(`[connect] ${values.host}:${port} (device id=${id}) 已连，发帧 ${JSON.stringify(values.payload)}`);
      sock.write(values.payload);
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      console.log(`[data] +${d.length}B -> ${JSON.stringify(d.toString('utf8').slice(0, 80))}`);
      if (buf.length >= Buffer.byteLength(values.payload)) finish(true, { echo: buf.toString('utf8') });
    });
    sock.on('timeout', () => finish(false, { reason: 'timeout' }));
    sock.on('error', (e) => finish(false, { reason: e.code || e.message }));
    sock.on('close', () => { if (!done) finish(false, { reason: 'close-before-echo' }); });
  });
}

const r = await probe();
console.log(`\n结果: ${r.ok ? 'OK' : 'FAIL'}  RTT=${r.ms}ms` +
  (r.reason ? `  reason=${r.reason}` : '') +
  (r.echo ? `  echo=${JSON.stringify(r.echo)}` : ''));
process.exit(r.ok ? 0 : 1);
