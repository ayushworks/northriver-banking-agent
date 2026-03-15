/**
 * AudioCapture — captures microphone audio and streams PCM16 to a WebSocket.
 *
 * Audio path: getUserMedia → AudioContext → AudioWorklet → PCM16 binary frames
 *
 * The worklet converts Float32 samples to 16-bit signed integers at 16kHz
 * and posts them back to the main thread, which sends them as binary WebSocket frames.
 */

const WORKLET_CODE = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetSampleRate = 16000;
    this._sourceRate = null;
    this._ratio = null;
    this._accumulated = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];

    if (!this._sourceRate) {
      this._sourceRate = sampleRate; // AudioWorkletGlobalScope.sampleRate
      this._ratio = this._sourceRate / this._targetSampleRate;
    }

    // Simple downsampling: pick every ratio-th sample
    for (let i = 0; i < samples.length; i++) {
      this._accumulated += 1;
      if (this._accumulated >= this._ratio) {
        this._accumulated -= this._ratio;
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const s = Math.max(-1, Math.min(1, samples[i]));
        this._buffer.push(s < 0 ? s * 32768 : s * 32767);

        if (this._buffer.length >= 1024) {
          const pcm16 = new Int16Array(this._buffer);
          this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
          this._buffer = [];
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm16-processor', PCM16Processor);
`;

export class AudioCapture {
  constructor(onChunk) {
    this._onChunk = onChunk; // callback(ArrayBuffer)
    this._audioContext = null;
    this._stream = null;
    this._sourceNode = null;
    this._workletNode = null;
    this._running = false;
  }

  async start() {
    if (this._running) return;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this._audioContext = new AudioContext({ sampleRate: 48000 });

    // Create worklet from inline code blob
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this._audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this._workletNode = new AudioWorkletNode(this._audioContext, 'pcm16-processor');
    this._workletNode.port.onmessage = (e) => {
      if (this._running) this._onChunk(e.data);
    };

    this._sourceNode = this._audioContext.createMediaStreamSource(this._stream);
    this._sourceNode.connect(this._workletNode);
    this._workletNode.connect(this._audioContext.destination);

    this._running = true;
  }

  stop() {
    this._running = false;
    this._sourceNode?.disconnect();
    this._workletNode?.disconnect();
    this._stream?.getTracks().forEach((t) => t.stop());
    this._audioContext?.close();
    this._audioContext = null;
    this._stream = null;
    this._sourceNode = null;
    this._workletNode = null;
  }
}
