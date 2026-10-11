/**
 * Microphone → 16 kHz mono 16-bit WAV, in the browser. WAV is what the local transcription engine reads
 * directly, and at 16 kHz an hour is about 115 MB. Samples are down-converted as they arrive, so a long
 * session does not hold the full-rate audio in memory.
 *
 * Browsers allow the microphone only on a secure page: the server PC (localhost) or HTTPS.
 */
export const canRecord = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));

export async function startRecording({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / 16000;
  const chunks = [];
  let carry = 0, paused = false, samples = 0;
  node.onaudioprocess = (e) => {
    if (paused) return;
    const input = e.inputBuffer.getChannelData(0);
    const out = new Int16Array(Math.floor((input.length - carry) / ratio) + 1);
    let n = 0, peak = 0;
    for (let pos = carry; pos < input.length; pos += ratio) {
      // average the source samples that fall into this 16 kHz sample (a simple anti-alias filter)
      const from = Math.floor(pos), to = Math.min(input.length, Math.floor(pos + ratio));
      let sum = 0; for (let i = from; i < Math.max(to, from + 1); i++) sum += input[i];
      const v = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
      peak = Math.max(peak, Math.abs(v));
      out[n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      carry = pos + ratio - input.length;
    }
    chunks.push(out.subarray(0, n)); samples += n;
    onLevel?.(peak);
  };
  source.connect(node); node.connect(ctx.destination);
  return {
    pause() { paused = true; }, resume() { paused = false; },
    get seconds() { return samples / 16000; },
    async stop() {
      node.disconnect(); source.disconnect(); stream.getTracks().forEach((t) => t.stop()); await ctx.close().catch(() => {});
      return wav(chunks, samples);
    },
    cancel() { node.disconnect(); source.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); },
  };
}

function wav(chunks, samples) {
  const buf = new ArrayBuffer(44 + samples * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples * 2, true);
  let o = 44;
  for (const c of chunks) { new Int16Array(buf, o, c.length).set(c); o += c.length * 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
