import VoiceAssistant from './components/VoiceAssistant.vue'
import { registerPlugin } from '@boki/plugin-client'

registerPlugin('voice', {
  components: {
    VoiceAssistant,
  },
  slots: {
    'layout.floating': VoiceAssistant,
  },
})
