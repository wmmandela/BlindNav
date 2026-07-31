import {Vibration} from 'react-native';
import Tts from 'react-native-tts';

export type SpeechPriority = 'CRITICAL' | 'NORMAL' | 'LOW';

export class SpatialAudioController {
  private lastSpokenMessage = '';
  private lastSpokenTime = 0;
  private minIntervalMs = 2200; // Minimum time between non-critical announcements

  constructor() {
    try {
      (Tts as any).setDefaultRate(0.50, true);
    } catch (e) {
      console.warn('[SpatialAudio] TTS rate configuration skipped:', e);
    }
  }

  public speakGuidance(message: string, priority: SpeechPriority = 'NORMAL') {
    if (!message || message.trim() === '') {
      return;
    }

    const now = Date.now();
    const isSameMessage = message.trim().toLowerCase() === this.lastSpokenMessage.trim().toLowerCase();

    // Critical safety alert (e.g. obstacle ahead, immediate collision risk)
    if (priority === 'CRITICAL') {
      Vibration.vibrate([0, 150, 80, 150]);
      try {
        (Tts as any).stop(false);
      } catch (e) {}
      Tts.speak(message);
      this.lastSpokenMessage = message;
      this.lastSpokenTime = now;
      return;
    }

    // Deduplicate and rate limit normal announcements to prevent audio clutter
    if (isSameMessage && now - this.lastSpokenTime < 5000) {
      return;
    }

    if (!isSameMessage && now - this.lastSpokenTime < this.minIntervalMs) {
      return;
    }

    try {
      (Tts as any).stop(false);
    } catch (e) {}
    Tts.speak(message);
    this.lastSpokenMessage = message;
    this.lastSpokenTime = now;
  }

  public stop() {
    try {
      (Tts as any).stop(false);
    } catch (e) {}
  }
}
