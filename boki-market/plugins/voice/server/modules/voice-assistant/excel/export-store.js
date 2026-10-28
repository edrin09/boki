"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveExport = saveExport;
exports.getExport = getExport;
const node_crypto_1 = require("node:crypto");
const TTL_MS = 10 * 60 * 1000;
const store = new Map();
/** 顺手 GC：写入与读取时清理过期项即可，量小无需定时器 */
function sweep() {
    const now = Date.now();
    for (const [id, entry] of store) {
        if (now - entry.createdAt > TTL_MS)
            store.delete(id);
    }
}
function saveExport(buffer, filename) {
    sweep();
    const id = (0, node_crypto_1.randomUUID)();
    store.set(id, { id, filename, buffer, createdAt: Date.now() });
    return { exportId: id, filename };
}
function getExport(id) {
    sweep();
    const entry = store.get(id);
    if (!entry)
        return null;
    return { buffer: entry.buffer, filename: entry.filename };
}
