/**
 * AudioPlayer — plays PCM16 audio chunks received from the WebSocket.
 *
 * Audio path: base64 PCM16 at 24kHz → Int16Array → Float32Array → AudioBuffer → scheduled playback
 *
 * Uses a scheduling queue to ensure seamless playback even when chunks arrive
 * at irregular intervals.
 */

export class AudioPlayer {
  constructor() {
    this._audioContext = null;
    this._nextPlayTime = 0;
    this._sampleRate = 24000;
    this._isPlaying = false;
  }

  _ensureContext() {
    if (!this._audioContext || this._audioContext.state === 'closed') {
      this._audioContext = new AudioContext({ sampleRate: this._sampleRate });
      this._nextPlayTime = 0;
    }
    if (this._audioContext.state === 'suspended') {
      this._audioContext.resume();
    }
  }

  /**
   * Play a chunk of PCM16 audio.
   * @param {string} base64Data - base64-encoded PCM16 bytes
   */
  playChunk(base64Data) {
    this._ensureContext();

    // Decode base64 → ArrayBuffer
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Int16 PCM → Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    if (float32.length === 0) return;

    const buffer = this._audioContext.createBuffer(1, float32.length, this._sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this._audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this._audioContext.destination);

    const now = this._audioContext.currentTime;
    // Schedule with minimal gap; catch up if we've fallen behind
    const startTime = Math.max(now + 0.02, this._nextPlayTime);
    source.start(startTime);
    this._nextPlayTime = startTime + buffer.duration;
    this._isPlaying = true;

    source.onended = () => {
      if (this._nextPlayTime <= this._audioContext.currentTime + 0.05) {
        this._isPlaying = false;
      }
    };
  }

  interrupt() {
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
    this._nextPlayTime = 0;
    this._isPlaying = false;
  }

  get isPlaying() {
    return this._isPlaying;
  }
}
