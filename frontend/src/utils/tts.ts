/**
 * 语音播报：Electron Chromium 的 speechSynthesis 走 Windows SAPI，
 * 中文语音缺失/失败时静默降级为仅展示文字（不弹错误）。
 */

let cached: SpeechSynthesisVoice | null | undefined

function findZhVoice(): SpeechSynthesisVoice | null {
  if (cached !== undefined) return cached
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  cached =
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && !/Chinese\(Traditional\)|Taiwan|HK/i.test(v.lang)) ??
    voices.find((v) => /zh/i.test(v.lang)) ??
    null
  return cached
}

/** 部分环境 voices 异步就绪，先触发一次加载 */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => {
      cached = undefined
      findZhVoice()
    }
  } catch {
    /* 忽略 */
  }
}

/** 播报一段中文文本；返回是否实际发起了播报 */
export function speak(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  try {
    const synth = window.speechSynthesis
    const content = (text ?? '').trim()
    if (!content) return false
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = 'zh-CN'
    const voice = findZhVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 1.05
    synth.speak(utterance)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* 忽略 */
    }
  }
}
