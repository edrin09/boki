/**
 * 把 docs/articles/*.md 渲染成官网上的静态文章页。
 *
 * 用法：node website/articles/build.mjs
 *
 * 设计约束：
 * - 不引第三方 markdown 依赖（仓库里没有，也不想为一个页面加）
 * - 只支持这批文章实际用到的语法：标题 / 段落 / 代码块 / 表格 / 引用 / 有序无序列表 / 图片 / 分隔线 / 行内代码粗体链接
 * - 产物：articles/<slug>.html、articles/md/<slug>.md（供「复制 Markdown」按钮取用，也方便贴到掘金）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const SRC_DIR = path.join(REPO, 'docs/articles')
const OUT_DIR = HERE
const MD_OUT = path.join(HERE, 'md')

const ARTICLES = [
  {
    slug: '01-three-locks',
    file: '01-三道锁-v2ex.md',
    cover: 'cover-main.png',
    channel: 'V2EX / 分享创造',
    tags: ['AI', '架构设计', '安全'],
    desc: '给财务软件接 AI，真正花时间的不是让它听懂，是让它别乱动。三道锁的实现与代价。',
  },
  {
    slug: '02-draft-gate',
    file: '02-草稿闸门-掘金.md',
    cover: 'cover-02-draft-gate.png',
    channel: '掘金',
    tags: ['TypeScript', 'AI', '工程约束'],
    desc: '落点没有 direct 这个选项：注册期校验、执行期扫描、幂等确认，以及这套设计的三个局限。',
  },
  {
    slug: '03-readonly-mcp',
    file: '03-只读MCP-掘金.md',
    cover: 'cover-03-readonly-mcp.png',
    channel: '掘金',
    tags: ['MCP', 'AI', '接口设计'],
    desc: '注册表拒绝写工具、写操作返回「工具不存在」——MCP 服务端怎么做到物理只读，以及这套边界的三个代价。',
  },
  {
    slug: '09-token-vuln',
    file: '09-越权确认漏洞复盘.md',
    cover: 'cover-09-token-vuln.png',
    channel: '掘金 / 安全社区',
    tags: ['安全', '漏洞复盘', 'CVSS'],
    desc: '一个「任何人都能替你确认指令」的漏洞：根因、影响版本范围、CVSS 3.1 自评 4.3 与修复。',
  },
]

const COS = 'https://boki-assets-1258912300.cos.ap-chengdu.myqcloud.com/boki'
const DATE = '2026-11-15'
const SITE = 'https://edrin09.github.io/boki'

/* ---------------- 行内处理 ---------------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(raw) {
  const codes = []
  let s = String(raw).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = esc(s)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const ext = /^https?:\/\//.test(href)
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`)
  return s
}

/* ---------------- 代码高亮 ---------------- */

const KEYWORDS =
  'const|let|var|export|import|from|function|return|if|else|for|of|in|new|throw|try|catch|await|async|class|extends|implements|interface|type|as|void|true|false|null|undefined|unknown|never|string|number|boolean|Promise|Set|Map|this|typeof|instanceof|delete'

function highlight(code, lang) {
  const isBash = /^(bash|sh|shell|console|zsh)$/i.test(lang)
  const commentAlt = isBash ? '#[^\\n]*' : '//[^\\n]*'
  const strAlt = "'[^'\\n]*'|\"[^\"\\n]*\"|`[^`]*`"
  const re = new RegExp(`(${commentAlt}|${strAlt}|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:${KEYWORDS})\\b)`, 'g')
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index))
    const tok = m[0]
    const cls = /^(#|\/\/)/.test(tok)
      ? 'tok-c'
      : /^['"`]/.test(tok)
        ? 'tok-s'
        : /^\d/.test(tok)
          ? 'tok-n'
          : 'tok-k'
    out += `<span class="${cls}">${esc(tok)}</span>`
    last = m.index + tok.length
  }
  out += esc(code.slice(last))
  return out
}

/* ---------------- 块级解析 ---------------- */

const CJK = /[\u3000-\u9fff\uff00-\uffef]/

function joinLines(lines) {
  return lines.reduce((acc, cur) => {
    if (!acc) return cur
    const needSpace = !CJK.test(acc.slice(-1)) && !CJK.test(cur.slice(0, 1))
    return acc + (needSpace ? ' ' : '') + cur
  }, '')
}

function stripMetaComment(md) {
  return md.replace(/^\s*<!--[\s\S]*?-->\s*/, '')
}

function tocSlug(text, seen) {
  let base = text
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 'section'
  seen[base] = (seen[base] ?? 0) + 1
  return seen[base] > 1 ? `${base}-${seen[base]}` : base
}

function parse(md) {
  const lines = stripMetaComment(md).replace(/\r\n/g, '\n').split('\n')
  const html = []
  const toc = []
  const seen = {}
  let title = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const lang = fence[1] || ''
      const buf = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++])
      html.push(
        `<div class="code"><div class="code-lang">${esc(lang || 'text')}</div><pre><code>${highlight(
          buf.join('\n'),
          lang,
        )}</code></pre></div>`,
      )
      continue
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push('<hr>')
      continue
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = h[2].trim()
      if (level === 1 && !title) {
        title = text.replace(/[*`]/g, '')
        continue
      }
      const id = tocSlug(text, seen)
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`)
      if (level === 2) toc.push({ id, text: text.replace(/[*`]/g, '') })
      continue
    }

    // 表格
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
      const cells = (l) =>
        l
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      i--
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('')
      const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
      html.push(`<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`)
      continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      i--
      html.push(`<blockquote>${inline(joinLines(buf))}</blockquote>`)
      continue
    }

    // 列表（单层 + 一层缩进）
    const isUl = /^\s*[-*]\s+/.test(line)
    const isOl = /^\s*\d+\.\s+/.test(line)
    if (isUl || isOl) {
      const ordered = isOl
      const items = []
      while (i < lines.length) {
        const cur = lines[i]
        const m = cur.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
        if (!m) break
        if (m[1].length >= 2 && items.length) items[items.length - 1].sub.push(m[3])
        else items.push({ text: m[3], sub: [] })
        i++
      }
      i--
      const tag = ordered ? 'ol' : 'ul'
      const body = items
        .map((it) => {
          const sub = it.sub.length ? `<${tag}>${it.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</${tag}>` : ''
          return `<li>${inline(it.text)}${sub}</li>`
        })
        .join('')
      html.push(`<${tag}>${body}</${tag}>`)
      continue
    }

    // 空行
    if (!line.trim()) continue

    // 段落
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*\|)/.test(lines[i])) buf.push(lines[i++].trim())
    i--
    const text = joinLines(buf)

    // 独占一行的图片 → figure
    const imgOnly = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
    if (imgOnly) {
      html.push(
        `<figure><img src="${imgOnly[2]}" alt="${esc(imgOnly[1])}" loading="lazy"></figure>`,
      )
      continue
    }
    // 整段斜体 → 图注
    const emOnly = text.match(/^\*([^*].*[^*])\*$/)
    if (emOnly) {
      html.push(`<p class="caption">${inline(emOnly[1])}</p>`)
      continue
    }
    html.push(`<p>${inline(text)}</p>`)
  }

  return { title, html: html.join('\n'), toc }
}

/* ---------------- 模板 ---------------- */

const CSS = `
:root{--indigo:#4f46e5;--indigo-deep:#3730a3;--slate:#64748b;--border:#e5e7eb;--bg-soft:#f8fafc;--text:#0f172a;--green:#16a34a;--amber:#d97706}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--text);line-height:1.8;background:#fff;-webkit-font-smoothing:antialiased}
header.bar{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--border);padding:13px 20px;display:flex;align-items:center;gap:14px;z-index:20}
header.bar a{color:var(--indigo);text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;flex:none}
header.bar .logo{font-weight:800;color:var(--text);letter-spacing:.02em;white-space:nowrap;flex:none}
header.bar .crumb{color:var(--slate);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header.bar .spacer{flex:1}
header.bar .copy{border:1px solid var(--border);background:#fff;color:var(--slate);font-size:12.5px;line-height:1.2;padding:5px 12px;border-radius:999px;cursor:pointer;font-family:inherit;transition:.15s;white-space:nowrap;flex:none}
header.bar .copy:hover{border-color:var(--indigo);color:var(--indigo)}
main{max-width:760px;margin:0 auto;padding:44px 22px 72px}
.eyebrow{color:var(--indigo);font-weight:700;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
h1{font-size:32px;line-height:1.35;margin:10px 0 14px;letter-spacing:-.01em}
.meta{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;color:var(--slate);font-size:13px;padding-bottom:22px;border-bottom:1px solid var(--border);margin-bottom:8px}
.meta .dot{width:3px;height:3px;border-radius:50%;background:#cbd5e1}
.tag{background:var(--bg-soft);border:1px solid var(--border);color:var(--slate);border-radius:999px;padding:1px 9px;font-size:12px}
h2{font-size:22px;margin:44px 0 14px;padding-left:12px;border-left:3px solid var(--indigo);line-height:1.5;scroll-margin-top:70px}
h3{font-size:17px;margin:28px 0 10px;scroll-margin-top:70px}
p{margin:16px 0;color:#334155}
strong{color:var(--text);font-weight:700}
a{color:var(--indigo);text-decoration:none;border-bottom:1px solid rgba(79,70,229,.28)}
a:hover{border-bottom-color:var(--indigo)}
ul,ol{padding-left:24px;margin:16px 0;color:#334155}
li{margin:7px 0}
li>ul,li>ol{margin:6px 0}
hr{border:0;border-top:1px solid var(--border);margin:40px 0}
blockquote{margin:24px 0;padding:14px 18px;background:var(--bg-soft);border-left:3px solid var(--indigo);border-radius:0 8px 8px 0}
blockquote p{margin:0;color:#334155}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;font-size:.9em;background:#f1f5f9;color:#0f172a;padding:1.5px 5px;border-radius:4px;border:1px solid #e2e8f0}
.code{margin:22px 0;border-radius:10px;overflow:hidden;border:1px solid #1e293b;background:#0f172a}
.code-lang{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;padding:7px 14px;border-bottom:1px solid #1e293b;background:#111c2e}
.code pre{margin:0;padding:15px 16px;overflow-x:auto;line-height:1.65}
.code code{background:none;border:0;padding:0;color:#e2e8f0;font-size:13px}
.tok-c{color:#64748b;font-style:italic}
.tok-s{color:#fcd34d}
.tok-k{color:#c4b5fd}
.tok-n{color:#7dd3fc}
figure{margin:26px 0}
figure img,.article-img{width:100%;border-radius:10px;border:1px solid var(--border);display:block}
figcaption{color:var(--slate);font-size:12.5px;text-align:center;margin-top:10px;line-height:1.6}
p.caption{color:var(--slate);font-size:13px;text-align:center;margin-top:-8px}
.table-wrap{overflow-x:auto;margin:22px 0}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid var(--border);padding:9px 12px;text-align:left;vertical-align:top}
th{background:var(--bg-soft);color:var(--indigo-deep);font-weight:600;white-space:nowrap}
tbody tr:nth-child(even){background:#fcfdff}
.toc{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin:28px 0 8px}
.toc-t{font-size:12.5px;font-weight:700;color:var(--slate);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
.toc ol,.toc ul{margin:0;font-size:14px}
.toc ol.num{padding-left:20px}
.toc ul.plain{list-style:none;padding-left:2px}
.toc li{margin:4px 0}
.toc a{border:0;color:#334155}
.toc a:hover{color:var(--indigo)}
.end{margin-top:52px;padding-top:22px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.end .btn{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:8px 18px;font-size:14px;color:var(--text);background:#fff;cursor:pointer;font-family:inherit}
.end .btn:hover{border-color:var(--indigo);color:var(--indigo)}
.end .btn.primary{background:var(--indigo);border-color:var(--indigo);color:#fff}
.end .btn.primary:hover{background:var(--indigo-deep);color:#fff}
footer{text-align:center;color:var(--slate);font-size:13px;padding:28px 20px 40px;border-top:1px solid var(--border)}
footer a{color:var(--slate)}
@media(max-width:600px){h1{font-size:26px}h2{font-size:19px}main{padding:30px 18px 56px}.code code{font-size:12px}header.bar .crumb{display:none}header.bar{gap:10px;padding:11px 14px}header.bar .copy{font-size:11.5px;padding:5px 9px}}
`

function shell({ title, desc, body, crumb, slug }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} · BOKI</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}/articles/${slug}.html" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}/articles/${slug}.html" />
<style>${CSS}</style>
</head>
<body>
<header class="bar">
  <a href="../index.html">← 官网</a>
  <span class="logo">BOKI</span>
  <span class="crumb">${esc(crumb)}</span>
  <span class="spacer"></span>
  <button class="copy" id="copyMd" data-md="md/${slug}.md">复制 Markdown 原文</button>
</header>
${body}
<footer>BOKI · 开源财务软件 · 内核 AGPL-3.0 / 官方插件 Apache-2.0 · 文中数据均可自行验证</footer>
<script>
(function () {
  var btn = document.getElementById('copyMd')
  if (!btn) return
  btn.addEventListener('click', function () {
    var label = btn.textContent
    var done = function (ok, msg) {
      btn.textContent = msg || (ok ? '已复制' : '复制失败，请手动打开 md 文件')
      setTimeout(function () { btn.textContent = label }, 2000)
    }
    var legacyCopy = function (t) {
      var ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'
      ta.style.top = '-1000px'
      document.body.appendChild(ta)
      ta.select()
      var ok = false
      try { ok = document.execCommand('copy') } catch (e) { ok = false }
      document.body.removeChild(ta)
      return ok
    }
    fetch(btn.dataset.md).then(function (r) { return r.text() }).then(function (t) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { done(true) }, function () {
          if (legacyCopy(t)) return done(true)
          window.open(btn.dataset.md, '_blank')
          done(false, '已在新标签打开原文')
        })
      } else if (legacyCopy(t)) {
        done(true)
      } else {
        window.open(btn.dataset.md, '_blank')
        done(false, '已在新标签打开原文')
      }
    }).catch(function () { done(false) })
  })
})()
</script>
</body>
</html>
`
}

function renderArticle(a, md) {
  const { title, html, toc } = parse(md)
  const chars = md.replace(/\s/g, '').length
  const mins = Math.max(3, Math.round(chars / 420))
  const numbered = toc.length > 0 && !toc.some((t) => /^[一二三四五六七八九十]+、/.test(t.text))
  const tocTag = numbered ? 'ol' : 'ul'
  const tocHtml = toc.length
    ? `<nav class="toc"><div class="toc-t">本文目录</div><${tocTag} class="${numbered ? 'num' : 'plain'}">${toc
        .map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`)
        .join('')}</${tocTag}></nav>`
    : ''
  const body = `<main>
  <span class="eyebrow">${esc(a.channel)}</span>
  <h1>${esc(title)}</h1>
  <div class="meta">
    <span>${DATE}</span><span class="dot"></span>
    <span>约 ${mins} 分钟</span><span class="dot"></span>
    <span>${chars} 字</span>
    ${a.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
  </div>
  ${tocHtml}
  <article>
${html}
  </article>
  <div class="end">
    <a class="btn" href="./index.html">← 全部技术文章</a>
    <a class="btn primary" href="https://github.com/edrin09/boki" target="_blank" rel="noopener">在 GitHub 上看代码</a>
  </div>
</main>`
  return shell({ title, desc: a.desc, body, crumb: title, slug: a.slug })
}

function renderIndex(items) {
  const cards = items
    .map(
      (it) => `    <a class="card" href="./${it.slug}.html">
      <div class="card-cover"><img src="${COS}/covers/${it.cover}" alt="${esc(it.title)}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-meta"><span class="tag">${esc(it.tags[0])}</span><span>${it.mins} 分钟</span></div>
        <h2>${esc(it.title)}</h2>
        <p>${esc(it.desc)}</p>
      </div>
    </a>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>技术文章 · BOKI</title>
<meta name="description" content="BOKI 的技术写作：草稿闸门、只读 MCP、一次性确认令牌、一个真实漏洞的复盘。讲约束怎么被代码钉死，也讲代价。" />
<link rel="canonical" href="${SITE}/articles/" />
<style>
:root{--indigo:#4f46e5;--indigo-deep:#3730a3;--slate:#64748b;--border:#e5e7eb;--bg-soft:#f8fafc;--text:#0f172a}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--text);line-height:1.75;background:#fff}
header.bar{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--border);padding:13px 20px;display:flex;align-items:center;gap:14px;z-index:20}
header.bar a{color:var(--indigo);text-decoration:none;font-weight:600;font-size:14px}
header.bar .logo{font-weight:800;color:var(--text)}
header.bar .crumb{color:var(--slate);font-size:13px}
main{max-width:920px;margin:0 auto;padding:48px 22px 80px}
.eyebrow{color:var(--indigo);font-weight:700;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
h1{font-size:34px;margin:10px 0 12px;letter-spacing:-.01em}
.lede{color:#334155;font-size:16px;margin:0 0 10px;max-width:640px}
.lede strong{color:var(--text)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:36px}
.card{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;background:#fff;transition:.18s}
.card:hover{border-color:#c7d2fe;box-shadow:0 10px 28px rgba(79,70,229,.1);transform:translateY(-2px)}
.card-cover{aspect-ratio:1200/630;background:var(--bg-soft);overflow:hidden}
.card-cover img{width:100%;height:100%;object-fit:cover;display:block}
.card-body{padding:16px 18px 20px;display:flex;flex-direction:column;gap:6px}
.card-meta{display:flex;align-items:center;gap:10px;color:var(--slate);font-size:12.5px}
.card h2{font-size:18px;margin:2px 0 0;line-height:1.45}
.card p{margin:0;color:var(--slate);font-size:13.5px;line-height:1.65}
.tag{background:var(--bg-soft);border:1px solid var(--border);color:var(--slate);border-radius:999px;padding:1px 9px;font-size:12px}
.note{margin-top:40px;padding:18px 20px;background:var(--bg-soft);border:1px solid var(--border);border-radius:12px;font-size:14px;color:#334155}
.note a{color:var(--indigo);text-decoration:none}
footer{text-align:center;color:var(--slate);font-size:13px;padding:28px 20px 40px;border-top:1px solid var(--border)}
footer a{color:var(--slate)}
@media(max-width:720px){.grid{grid-template-columns:1fr}h1{font-size:27px}main{padding:32px 18px 60px}}
</style>
</head>
<body>
<header class="bar">
  <a href="../index.html">← 官网</a>
  <span class="logo">BOKI</span>
  <span class="crumb">技术文章</span>
</header>
<main>
  <span class="eyebrow">Writing</span>
  <h1>技术文章</h1>
  <p class="lede">我们把「AI 只能写草稿」这件事拆成了四篇：<strong>约束怎么被代码钉死</strong>，以及这么做的<strong>代价</strong>。代码全在 <a href="https://github.com/edrin09/boki" target="_blank" rel="noopener">GitHub</a> 上，文中每个结论都可以自己验一遍。</p>
  <div class="grid">
${cards}
  </div>
  <div class="note">
    转载与引用均可，请保留出处链接。文中性能数字来自本机实测（单机 CPU，非服务器环境），漏洞评分是自评 CVSS 3.1，不是 CNA 评估。
    想先看效果？<a href="../index.html#showcase">官网有 72 秒真机录屏</a>。
  </div>
</main>
<footer>BOKI · 开源财务软件 · 内核 AGPL-3.0 / 官方插件 Apache-2.0</footer>
</body>
</html>
`
}

/* ---------------- 执行 ---------------- */

fs.mkdirSync(MD_OUT, { recursive: true })
const built = []

for (const a of ARTICLES) {
  const src = path.join(SRC_DIR, a.file)
  if (!fs.existsSync(src)) {
    console.error(`缺源文件：${src}`)
    process.exitCode = 1
    continue
  }
  const md = fs.readFileSync(src, 'utf8')
  const page = renderArticle(a, md)
  fs.writeFileSync(path.join(OUT_DIR, `${a.slug}.html`), page, 'utf8')
  fs.writeFileSync(path.join(MD_OUT, `${a.slug}.md`), stripMetaComment(md).trimStart(), 'utf8')
  const { title } = parse(md)
  const chars = md.replace(/\s/g, '').length
  built.push({ ...a, title, mins: Math.max(3, Math.round(chars / 420)), chars })
  console.log(`✓ ${a.slug}.html  ${title}  ${chars} 字`)
}

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndex(built), 'utf8')
console.log(`✓ index.html  ${built.length} 篇`)
