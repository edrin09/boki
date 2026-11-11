import ReceiptListPage from './pages/list.vue'
import ReceiptWorkbenchPage from './pages/workbench.vue'
import ReceiptRulesPage from './pages/rules.vue'
import AiVoicePanel from './components/AiVoicePanel.vue'
import { registerPlugin } from '@boki/plugin-client'

/**
 * AI 智能记账：
 * - 三条菜单：上传记账 / 票据列表 / 归类规则（票据通道）
 * - 一个插槽：挂在 voice 语音弹窗里的「一句话办事」面板（语音通道）
 *
 * 语音面板不新增页面；没装 voice 插件时插槽无人渲染，
 * 本插件自动退化为纯票据记账。
 */
registerPlugin('receipts', {
  components: {
    ReceiptListPage,
    ReceiptWorkbenchPage,
    ReceiptRulesPage,
    AiVoicePanel,
  },
  slots: {
    'voice.assistant.panel': AiVoicePanel,
  },
})
