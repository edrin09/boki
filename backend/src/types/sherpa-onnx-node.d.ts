declare module 'sherpa-onnx-node' {
  export interface OnlineTransducerModelConfig {
    encoder: string
    decoder: string
    joiner: string
  }

  export interface OnlineModelConfig {
    transducer?: OnlineTransducerModelConfig
    tokens: string
    numThreads?: number
    provider?: string
    debug?: number
  }

  export interface OnlineRecognizerConfig {
    modelConfig: OnlineModelConfig
    decodingMethod?: string
    enableEndpointDetection?: boolean
    rule1MinTrailingSilence?: number
    rule2MinTrailingSilence?: number
    rule3MinUtteranceLength?: number
  }

  export interface OnlineRecognizerResult {
    text: string
    tokens?: string[]
    timestamps?: number[]
  }

  export class OnlineStream {
    acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void
    inputFinished(): void
    release?(): void
  }

  export class OnlineRecognizer {
    constructor(config: OnlineRecognizerConfig)
    createStream(): OnlineStream
    isReady(stream: OnlineStream): boolean
    decode(stream: OnlineStream): void
    isEndpoint(stream: OnlineStream): boolean
    reset(stream: OnlineStream): void
    getResult(stream: OnlineStream): OnlineRecognizerResult
  }
}