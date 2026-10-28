/**
 * WAV 解码与重采样工具（语音助手专用）。
 */

export const TARGET_SAMPLE_RATE = 16000

/**
 * 解析 WAV：支持 PCM16 与 Float32 编码。
 * 采样率不是 16k 时线性插值重采样（浏览器录音端一般已重采样，
 * 这里做保底，办公室话筒直插的 48k 输入也能识别）。
 */
export function parseWav(buffer: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('音频格式不支持，请上传 WAV 录音')
  }

  let offset = 12
  let sampleRate = 16000
  let bitsPerSample = 16
  let audioFormat = 1
  let dataOffset = -1
  let dataLength = -1
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const bodyAt = offset + 8
    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(bodyAt)
      /* channels = */ buffer.readUInt16LE(bodyAt + 2)
      sampleRate = buffer.readUInt32LE(bodyAt + 4)
      bitsPerSample = buffer.readUInt16LE(bodyAt + 14)
    } else if (chunkId === 'data') {
      dataOffset = bodyAt
      dataLength = Math.min(chunkSize, buffer.length - bodyAt)
      break
    }
    offset = bodyAt + chunkSize + (chunkSize % 2)
  }
  if (dataOffset < 0) throw new Error('WAV 缺少 data 块')

  let samples: Float32Array
  if (audioFormat === 3 && bitsPerSample === 32) {
    const n = dataLength >> 2
    samples = new Float32Array(n)
    for (let i = 0; i < n; i++) samples[i] = buffer.readFloatLE(dataOffset + i * 4)
  } else if (bitsPerSample === 16) {
    const n = Math.floor(dataLength / 2)
    samples = new Float32Array(n)
    for (let i = 0; i < n; i++) samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768
  } else {
    throw new Error(`不支持的 WAV 位深: ${bitsPerSample}`)
  }

  if (sampleRate !== TARGET_SAMPLE_RATE) {
    samples = resample(samples, sampleRate, TARGET_SAMPLE_RATE)
  }
  return { samples, sampleRate: TARGET_SAMPLE_RATE }
}

/** 线性插值重采样，指令级语音足够 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples
  const ratio = fromRate / toRate
  const outLen = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const frac = pos - left
    const a = samples[left] ?? 0
    const b = samples[left + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}
