/**
 * 多公司 / 账套相关的公共默认值。
 *
 * 内核只保留公司上下文与首家公司创建（建账套）所需的最小常量；
 * 公司档案管理的完整默认值随 multi-company 插件走。
 */

/** 小规模纳税人默认征收率 3%（减按政策由用户在「公司信息」调整） */
export const DEFAULT_SMALL_SCALE_VAT_RATE = 3

/**
 * 自动生成凭证草稿的置信度阈值默认值。
 * 低于该值一律留给人工确认：错账要靠冲销才能修，宁可多问一句。
 */
export const DEFAULT_AUTO_POST_THRESHOLD = 0.8
