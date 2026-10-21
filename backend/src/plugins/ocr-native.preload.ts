/**
 * 原生 OCR 运行时预加载（过渡期）。
 *
 * 语音模块的 `sherpa-onnx-node` 会先加载同名 ONNX Runtime DLL，
 * 之后插件再加载 `onnxruntime-node` 会因 Windows DLL 冲突失败。
 * 这里在 AppModule（含语音模块）之前先加载 `onnxruntime-node`，
 * 顺序与迁移前内核 `OcrModule` 一致。
 *
 * 批次 9 语音插件迁移后可移除本文件。
 */
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('onnxruntime-node')
} catch {
  // OCR 模型/运行时缺失时不影响主体启动；插件加载时会给出明确错误
}
