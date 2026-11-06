import { requireOptionalNativeModule } from 'expo-modules-core';

export type EngineCapabilities = {
  asr: boolean;
  diarization: boolean;
  llm: boolean;
};

type AudioEngineModule = {
  getCapabilities(): EngineCapabilities;
};

// Optional loading allows UI development before the native app is compiled.
export default requireOptionalNativeModule<AudioEngineModule>('AudioEngine');
