import {
  applyCapture,
  applyMessage,
  createState,
  hitChannel,
  renderBlock,
  type Capture,
  type SynthState,
  type WorkletMsg,
} from './synth';

declare const sampleRate: number;
declare const currentTime: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: { processorOptions?: Capture }) => AudioWorkletProcessor,
): void;

class ChiptuneProcessor extends AudioWorkletProcessor {
  state: SynthState;

  constructor(options?: { processorOptions?: Capture }) {
    super();
    this.state = createState();
    if (options?.processorOptions) applyCapture(this.state, options.processorOptions);
    this.port.onmessage = (event: MessageEvent) => {
      const message = event.data as WorkletMsg;
      if (message && message.kind === 'hit') {
        hitChannel(this.state, message.channel, message.drum, message.volume, sampleRate);
        return;
      }
      applyMessage(this.state, message);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels || !channels[0]) return true;
    const left = channels[0];
    const right = channels[1] ?? left;
    renderBlock(this.state, left, right, currentTime, sampleRate);
    return true;
  }
}

registerProcessor('chiptune', ChiptuneProcessor);
