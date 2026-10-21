"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TEXT_PAGES = exports.MAX_RENDER_PAGES = void 0;
exports.parsePdf = parsePdf;
const canvas_1 = require("@napi-rs/canvas");
/** 渲染模式页数上限（防超大 PDF 打满内存） */
exports.MAX_RENDER_PAGES = 10;
/** 文本层模式页数上限 */
exports.MAX_TEXT_PAGES = 20;
const Y_TOLERANCE = 3;
let pdfLibPromise = null;
/** 懒加载 pdfjs（legacy ESM build，Node 下自动使用 fake worker） */
function loadPdfLib() {
    if (!pdfLibPromise) {
        pdfLibPromise = Promise.resolve().then(() => __importStar(require('pdfjs-dist/legacy/build/pdf.mjs')));
    }
    return pdfLibPromise;
}
function mergeLine(items) {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    let text = '';
    let prev = null;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const it of sorted) {
        // 单词片段间有明显间隙时补空格，避免粘连
        if (prev && it.x - (prev.x + prev.width) > Math.max(prev.width * 0.3, 1)) {
            text += ' ';
        }
        text += it.str;
        x1 = Math.min(x1, it.x);
        y1 = Math.min(y1, it.y);
        x2 = Math.max(x2, it.x + it.width);
        y2 = Math.max(y2, it.y + (it.height || 12));
        prev = it;
    }
    return { text, score: 1, points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] };
}
function itemsToLines(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    let cur = [];
    let curY = -1;
    for (const it of sorted) {
        if (cur.length && Math.abs(it.y - curY) > Y_TOLERANCE) {
            lines.push(mergeLine(cur));
            cur = [];
        }
        curY = it.y;
        cur.push(it);
    }
    if (cur.length)
        lines.push(mergeLine(cur));
    return lines;
}
/**
 * 解析 PDF：逐页决策——有文本层的页抽文本，无文本层的页渲染成 PNG 供 OCR。
 *
 * 混合型 PDF（部分页有文本层、部分页是扫描图）按页合并，
 * 不会再因为存在任一扫描页就丢弃已抽到的文本页。
 */
async function parsePdf(buffer, options = {}) {
    const pdfjs = await loadPdfLib();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    const pageCount = Math.min(doc.numPages, exports.MAX_TEXT_PAGES);
    const pages = [];
    const images = [];
    let hasTextLayer = false;
    try {
        for (let i = 1; i <= pageCount; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();
            const rawItems = [];
            for (const item of content.items) {
                const s = item.str;
                if (!s || !s.trim())
                    continue;
                const t = item;
                const transform = t.transform;
                const [vx, vy] = viewport.convertToViewportPoint(transform[4], transform[5]);
                rawItems.push({
                    str: s,
                    x: vx,
                    y: vy,
                    width: t.width ?? 0,
                    height: t.height ?? 12,
                });
            }
            const lines = itemsToLines(rawItems);
            if (lines.length > 0) {
                hasTextLayer = true;
                pages.push({
                    width: viewport.width,
                    height: viewport.height,
                    lines,
                    rawText: lines.map((l) => l.text).join('\n'),
                });
            }
            else {
                // 本页无文本层：渲染为图（超过渲染上限则截断该页，不影响已抽到的文本页）
                const png = images.length < exports.MAX_RENDER_PAGES
                    ? await renderPageToPng(page, viewport, options.renderScale ?? 2)
                    : undefined;
                if (png)
                    images.push(png);
                pages.push({
                    width: viewport.width,
                    height: viewport.height,
                    lines: [],
                    rawText: '',
                    image: png,
                });
            }
            page.cleanup();
        }
    }
    finally {
        await loadingTask.destroy();
    }
    const fullText = pages.map((p) => p.rawText).filter(Boolean).join('\n\n');
    return {
        hasTextLayer,
        renderPageCount: images.length,
        pageCount,
        pages,
        images,
        fullText,
    };
}
/** 将 PDF 页渲染为 PNG（@napi-rs/canvas，无本机编译依赖） */
async function renderPageToPng(page, viewport, scale) {
    const width = Math.max(1, Math.ceil(viewport.width * scale));
    const height = Math.max(1, Math.ceil(viewport.height * scale));
    const renderViewport = page.getViewport({ scale });
    const canvasFactory = {
        create(w, h) {
            const canvas = (0, canvas_1.createCanvas)(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
            return { canvas, context: canvas.getContext('2d') };
        },
        reset(c, w, h) {
            c.canvas.width = Math.max(1, Math.ceil(w));
            c.canvas.height = Math.max(1, Math.ceil(h));
        },
        destroy(c) {
            c.canvas.width = 0;
            c.canvas.height = 0;
            c.canvas = null;
            c.context = null;
        },
    };
    const { canvas, context } = canvasFactory.create(width, height);
    await page.render({
        canvasContext: context,
        viewport: renderViewport,
        canvasFactory,
    }).promise;
    return canvas.toBuffer('image/png');
}
