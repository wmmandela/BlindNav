import Voice, {
  SpeechErrorEvent,
  SpeechResultsEvent,
} from '@react-native-voice/voice';
import Tts from 'react-native-tts';

export type VoiceCallbacks = {
  onCommand: (text: string) => void;
  onError?: (message: string) => void;
};

export class VoiceController {
  private callbacks: VoiceCallbacks;

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
    Voice.onSpeechResults = this.handleResults;
    Voice.onSpeechError = this.handleError;
    try {
      (Tts as any).setDefaultRate(0.48, true);
    } catch (e) {
      console.warn('[VoiceController] TTS rate setup skipped:', e);
    }
  }

  startListening(locale = 'en-US') {
    return Voice.start(locale);
  }

  stopListening() {
    return Voice.stop();
  }

  destroy() {
    Voice.destroy().then(Voice.removeAllListeners);
  }

  speak(text: string) {
    try {
      (Tts as any).stop(false);
    } catch (e) {}
    Tts.speak(text);
  }

  private handleResults = (event: SpeechResultsEvent) => {
    const command = event.value?.[0];
    if (command) {
      this.callbacks.onCommand(command);
    }
  };

  private handleError = (event: SpeechErrorEvent) => {
    const message = event.error?.message ?? 'Speech recognition failed.';
    this.callbacks.onError?.(message);
  };
}

export function speak(text: string) {
  try {
    (Tts as any).stop(false);
  } catch (e) {}
  Tts.speak(text);
}
