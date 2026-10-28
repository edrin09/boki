/**
 * 公开目录：只返回「激活索引里存在」的插件，保证展示内容与签名内容一致。
 * 分类与插件归属不单独开接口，随 /v1/index 一次下发（接入说明 5.1）。
 */
import { getActiveIndex } from './index.mjs'

export function getPluginDetail(ctx, pluginId) {
  const snapshot = getActiveIndex(ctx)
  if (!snapshot) return { status: 503, message: '市场索引尚未发布' }

  const entry = (snapshot.json?.plugins ?? []).find((item) => item.id === pluginId)
  if (!entry) return { status: 404, message: `插件不存在或未上架：${pluginId}` }

  return { status: 200, plugin: entry }
}
