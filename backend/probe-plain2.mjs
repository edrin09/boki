// probe-plain2.mjs —— 692F4 ⇄ A35 云端透传：闲置断连复现探针
//
// 用途：复现并定位「连上后一段时间无数据就被踢」的现象。
//   连上 → 收发一次握手 → 然后刻意静默 idle 毫秒（不发任何心跳）→
//   观察连接是否被云端中继 / 692F4 在闲置窗口内回收。
//
// 为什么需要它：tunnel_probe.php 只是纯端口探针（不建真正的接收端），
//   历史上"闲置断连"诊断被「缺接收端」这个混杂因素干扰。本脚本真正建连并保持，
//   专门隔离"静默时长 vs 断连"的因果关系。
//
// 依赖：仅 Node 内置 net / util。
//
// 用法：
//   node backend/probe-plain2.mjs --id 1 --idle 60000
//   # RELAY_IDLE 控制静默时长（默认 60s），RELAY_KEEPALIVE 设为 1 可对比"有心跳"的情况

import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.RELAY_HOST || '127.0.0.1' },
    base: { type: 'string', default: process.env.RELAY_BASE || '20000' },
    span: { type: 'string', default: process.env.RELAY_SPAN || '16' },
    id: { type: 'string', default: process.env.RELAY_ID || '1' },
    idle: { type: 'string', default: process.env.RELAY_IDLE || '60000' },
    keepalive: { type: 'string', default: process.env.RELAY_KEEPALIVE || '0' },
    payload: { type: 'string', default: process.env.RELAY_PAYLOAD || 'PING' },
  },
});

const base = parseInt(values.base, 10);
const span = parseInt(values.span, 10);
const id = parseInt(values.id, 10);
const port = base + ((id - 1) % span);
const idle = parseInt(values.idle, 10);
const keepalive = values.keepalive === '1';

const sock = net.connect({ host: values.host, port });
let disconnectedAt = null;
let handshakeOk = false;

sock.on('connect', () => {
  console.log(`[connect] ${values.host}:${port} (id=${id}) 已连，发握手帧 ${JSON.stringify(values.payload)}`);
  sock.write(values.payload);
});
sock.on('data', (d) => {
  console.log(`[data] +${d.length}B -> ${JSON.stringify(d.toString('utf8').slice(0, 80))}`);
  if (!handshakeOk) {
    handshakeOk = true;
    console.log(`[ok] 握手回显收到。进入静默观察 ${idle}ms（keepalive=${keepalive}）...`);
    if (keepalive) {
      const ka = setInterval(() => {
        if (disconnectedAt) { clearInterval(ka); return; }
        sock.write('K'); // 心跳字节，用于对比"有心跳时不掉线"
      }, 5000);
      setTimeout(() => clearInterval(ka), idle);
    }
    setTimeout(() => {
      if (disconnectedAt) return;
      console.log(`[probe] 静默 ${idle}ms 结束，发存活探测...`);
      sock.write('PING');
    }, idle);
  }
});
sock.on('error', (e) => {
  if (!disconnectedAt) disconnectedAt = Date.now();
  console.log(`[error] ${e.code || e.message}`);
});
sock.on('close', () => {
  if (!disconnectedAt) disconnectedAt = Date.now();
  console.log(`\n结果: ${handshakeOk ? '握手成功但' : '未握手即'} 连接被关闭` +
    (disconnectedAt ? `（关闭发生在握手后静默期）` : ''));
  process.exit(0);
});

// 兜底：即便没收到 close 事件，也到时给出结论
setTimeout(() => {
  if (!disconnectedAt) {
    console.log(`\n结果: OK —— 静默 ${idle}ms 后连接仍存活（未在闲置窗口内被回收）`);
    sock.destroy();
    process.exit(0);
  }
}, idle + 8000);
