# BOKI · 品牌规范

> **BOKI**（读音 /ˈboʊki/）—— **纯英文单品牌，不设中文名**。名字与 bookkeeping 同源，仅作词源说明。
> 定位：开源财务软件 · 复式记账内核 · 插件化 · 离线私有化 · AI 会计员。

---

## 1. 名字

| 项 | 内容 |
|:--|:--|
| 品牌名 | **BOKI**（全大写） |
| 中文名 | **不设**（纯英文单品牌，对标 DBX） |
| 文字用法 | 正文写 `BOKI`；词标（logo）为小写 `boki` 样式 |
| 代码/仓库 | `boki`、`boki-core`、`plugin-*` |
| 命名空间 | `@boki/plugin-sdk`、`@boki/core` |
| 域名建议 | `boki.app`、`getboki.com`、`bokihq.com`、`boki.dev` |

> 发布前务必做 **商标检索**（建议第 9 / 35 / 42 类）与 **域名可用性检查**。
> `boki.com` 大概率已被占用，优先 `.app` / `.dev` / `getboki.com`。

---

## 2. 标志释义

标志是一本**翻开的账簿**：

| 元素 | 含义 |
|:--|:--|
| 左页 / 右页（镜像对称） | **借方 / 贷方**，完全对称 = 借贷必相等 |
| 页面上的横线 | 分录行（journal entry） |
| 金色平衡杠 + 两端圆点 | **试算平衡**（Trial Balance）与金额高亮 |
| 书脊线 | 账簿装订，传统会计符号 |
| 靛蓝 → 天蓝渐变 | 信任、专业 + 清晰、云端 |
| 金色 | 价值、金额、重点 |

---

## 3. 文件清单

| 文件 | 用途 |
|:--|:--|
| `boki-mark.svg` | 主 App 图标（渐变磁贴） |
| `boki-mark-dark.svg` | 深色环境专用磁贴 |
| `boki-glyph.svg` | 无背景图形，可放深色/照片/品牌色底 |
| `boki-mark-mono.svg` | 单色版（`currentColor`），印刷/水印/单色场景 |
| `boki-wordmark.svg` | 纯文字标 |
| `boki-lockup.svg` | 横向组合（浅色底） |
| `boki-lockup-dark.svg` | 横向组合（深色底） |
| `favicon.svg` | 简化图标，16 / 32px 可读 |
| `brand-sheet.html` | 品牌规范总览页（可直接浏览器打开） |

---

## 4. 色板

| 名称 | 色值 | 用途 |
|:--|:--|:--|
| Indigo 靛蓝 | `#4F46E5` | 主色（主按钮、链接、强调） |
| Sky 天蓝 | `#0EA5E9` | 渐变辅助、信息色 |
| Gold 金 | `#FBBF24` | 金额/价值/平衡强调（少量使用） |
| Ink 深墨 | `#0F172A` | 主文字、深色底 |
| Slate 灰 | `#64748B` | 次要文字 |
| Mist 浅靛 | `#E0E7FF` | 浅底、选中态 |

**明暗模式**：浅色底用 `boki-mark.svg`；深色底用 `boki-mark-dark.svg` 或 `boki-glyph.svg`。

---

## 5. 字体

- 英文/数字：**Inter**（字重 500 / 700 / 800）
- 中文：**PingFang SC / Microsoft YaHei / Noto Sans SC**
- 词标：`boki` 小写、字重 800、字距 `-2` ~ `-2.5`

> 正式出图前把词标**转成路径（outline）**，避免客户端缺字体导致变形。

---

## 6. 用法规范

**最小尺寸**
- App 图标：≥ 32px
- 横向组合：≥ 160px 宽
- 16px 只使用 `favicon.svg` 的简化版

**安全边距**
- 标志四周留白 ≥ 图形高度的 25%
- 不与其他元素贴边

**禁止**
- ❌ 拉伸变形、旋转、描边
- ❌ 改渐变方向 / 改主色
- ❌ 在花哨背景上直接放彩色磁贴（改用 glyph 或加留白底板）
- ❌ 用低对比色（如浅灰）绘制 mono 标志
- ❌ 把金色平衡杠去掉或改成其他颜色

---

## 7. 在项目中的接入点

| 位置 | 用法 |
|:--|:--|
| GitHub README | `boki-lockup.svg` 顶部 + 徽章 |
| 官网 | 导航左上 `boki-lockup.svg`，深色页用 dark 版 |
| 桌面端窗口/托盘/安装包 | `boki-mark.svg` → 转 `.ico` / `.icns` / `.png` |
| 浏览器 favicon | `favicon.svg` |
| 插件市场 | 页面头部 lockup；认证插件角标用金色 |
| 文档站 | 侧栏顶部 wordmark |
| 开源赞助页 | 赞助商墙与品牌色统一 |

---

## 8. 导出建议（生产用）

```bash
# 需要 ImageMagick 或 sharp-cli
# PNG（各尺寸）
magick -background none boki-mark.svg -resize 512x512 boki-mark-512.png
# Windows 图标
magick boki-mark.svg -define icon:auto-resize=256,128,64,48,32,16 boki.ico
# macOS 图标建议用 iconutil + 1024px PNG
```

> 磁贴圆角为 56/256 ≈ 21.9%，导出到桌面端时按平台规范可改用系统遮罩。
