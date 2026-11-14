const TONE_FREQUENCY_HZ = 880;
const TONE_GAIN = 0.03;
const TONE_SECONDS = 0.12;
const TONE_RELEASE_GAIN = 0.001;

/** 桌面通知的短提示音。音量压低，失败时不影响通知本身。 */
export function playNotificationSound() {
  const Context = window.AudioContext;
  if (!Context) return;
  try {
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = TONE_FREQUENCY_HZ;
    gain.gain.setValueAtTime(TONE_GAIN, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(TONE_RELEASE_GAIN, context.currentTime + TONE_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + TONE_SECONDS);
    oscillator.onended = () => void context.close();
  } catch { /* 音频设备不可用时只保留通知。 */ }
}
