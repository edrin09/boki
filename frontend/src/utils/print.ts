/**
 * 浏览器端 PDF 打印工具。
 *
 * 原理：把 PDF Blob 挂到隐藏 iframe，加载完成后对 iframe 内容调起 print()，
 * 由 Chromium（WebView2 / Edge）内置 PDF 查看器弹出系统打印对话框。
 * 纸张尺寸由 PDF 页面自身决定（单据均为 A5 横向），
 * 打印时在对话框中选择 A5 纸张即可 1:1 输出，无需缩放。
 */

/** 打印中的清理兜底延时（打印对话框关闭时机无法可靠探测，用延时释放） */
const CLEANUP_DELAY_MS = 60_000

/** iframe 就绪后延迟调起打印的缓冲（等待 PDF 查看器插件完成初始化） */
const PRINT_DELAY_MS = 300

export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:none;pointer-events:none;'
  iframe.src = url

  const cleanup = () => {
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      iframe.remove()
    }, CLEANUP_DELAY_MS)
  }

  iframe.onload = () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        cleanup()
      }
    }, PRINT_DELAY_MS)
  }

  document.body.appendChild(iframe)
}
