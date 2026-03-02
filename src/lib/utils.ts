import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resample any audio Blob to 16 kHz mono WAV using the Web Audio API.
 * Falls back to the original blob if decoding or resampling fails.
 */
export async function resampleAudioTo16k(audio: Blob): Promise<Blob> {
  const TARGET_SR = 16000;
  try {
    const arrayBuffer = await audio.arrayBuffer();
    // Decode at the original sample rate
    const tmpCtx = new AudioContext();
    let decoded: AudioBuffer;
    try {
      decoded = await tmpCtx.decodeAudioData(arrayBuffer);
    } finally {
      tmpCtx.close();
    }

    if (decoded.sampleRate === TARGET_SR && decoded.numberOfChannels === 1) {
      return audio; // Already correct — skip re-encoding
    }

    // Render to mono 16 kHz via OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * TARGET_SR),
      TARGET_SR
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);
    const resampled = await offlineCtx.startRendering();

    return floatArrayToWav(resampled.getChannelData(0), TARGET_SR);
  } catch (err) {
    console.warn("[resampleAudioTo16k] Resampling failed, using original audio:", err);
    return audio;
  }
}

export const floatArrayToWav = (
  audioData: Float32Array,
  sampleRate: number = 16000,
  format: "wav" | "mp3" | "ogg" = "wav"
): Blob => {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  const dataSize =
    format === "wav" ? 36 + audioData.length * 2 : 44 + audioData.length * 2;
  view.setUint32(4, dataSize, true);
  writeString(8, format === "wav" ? "WAVE" : "FORM");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, audioData.length * 2, true);

  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: `audio/${format}` });
};
