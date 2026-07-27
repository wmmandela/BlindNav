declare module 'react-native-tts' {
  const Tts: {
    setDefaultRate(rate: number): void;
    speak(text: string): void;
    stop(): void;
  };

  export default Tts;
}
