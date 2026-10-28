// probe-bk.mjs —— 692F4 ⇄ A35 云端透传：设备身份端口批量连通性扫描
// （bk = bulk check / 批量连通）
//
// 用途：按「端口即身份」规则（port = base + (id-1) % span）扫描一组设备端口，
//   输出一张「设备 id → 云端端口 → 可达性 / RTT」表。
//   特别适合你频繁在「两台 692F4 设备」之间切换调试时，一键核对当前哪些身份端口在线。
//
// 依赖：仅 Node 内置 net / util。
//
// 用法：
//   node backend/probe-bk.mjs --count 8
//   node backend/probe-bk.mjs --base 20000 --span 16 --count 16 --host relay.example.com
//   # RELAY_COUNT 控制扫描的设备 id 数量（默认 8）

import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.RELAY_HOST || '127.0.0.1' },
    base: { type: 'string', default: process.env.RELAY_BASE || '20000' },
    span: { type: 'string', default: process.env.RELAY_SPAN || '16' },
    count: { type: 'string', default: process.env.RELAY_COUNT || '8' },
    timeout: { type: 'string', default: process.env.RELAY_TIMEOUT || '2000' },
    payload: { type: 'string', default: process.env.RELAY_PAYLOAD || 'PING' },
  },
});

const base = parseInt(values.base, 10);
const span = parseInt(values.span, 10);
const count = parseInt(values.count, 10);
const timeout = parseInt(values.timeout, 10);

function scanOne(id) {
  const port = base + ((id - 1) % span);
  return new Promise((resolve) => {
    const sock = net.connect({ host: values.host, port });
    const t0 = Date.now();
    let done = false;
    sock.setTimeout(timeout);
    sock.on('connect', () => sock.write(values.payload));
    sock.on('data', () => {
      if (done) return;
      done = true;
      const ms = Date.now() - t0;
      try { sock.destroy(); } catch { /* */ }
      resolve({ id, port, ok: true, ms });
    });
    sock.on('timeout', () => { if (!done) { done = true; try { sock.destroy(); } catch { /* */ } resolve({ id, port, ok: false, reason: 'timeout' }); } });
    sock.on('error', (e) => { if (!done) { done = true; resolve({ id, port, ok: false, reason: e.code || e.message }); } });
    sock.on('close', () => { if (!done) { done = true; resolve({ id, port, ok: false, reason: 'closed' }); } });
  });
}

const rows = await Promise.all(
  Array.from({ length: count }, (_, i) => scanOne(i + 1))
);

console.log(`\n批量扫描 ${values.host}  base=${base} span=${span}  count=${count}`);
console.log('─'.repeat(46));
console.log(' device id | cloud port | status        | RTT');
console.log('─'.repeat(46));
let up = 0;
for (const r of rows) {
  if (r.ok) up++;
  console.log(
    ` ${String(r.id).padStart(9)} | ${String(r.port).padStart(10)} | ` +
    `${r.ok ? 'UP' : 'DOWN(' + (r.reason || '?') + ')'}`.padEnd(14) +
    ` | ${r.ok ? r.ms + 'ms' : '-'}`
  );
}
console.log('─'.repeat(46));
console.log(`可达 ${up}/${count}`);
process.exit(0);
