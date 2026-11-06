import { requireOptionalNativeModule } from 'expo-modules-core';

export type EngineCapabilities = {
  asr: boolean;
  diarization: boolean;
  llm: boolean;
};

export type SpeakerInterval = {
  startMs: number;
  endMs: number;
  speakerId: string;
};

export type DiarizationResult = {
  durationMs: number;
  elapsedMs: number;
  intervals: SpeakerInterval[];
};

type AudioEngineModule = {
  getCapabilities(): EngineCapabilities;
  prepareModels(): Promise<Record<string, string>>;
  diarize(fileUri: string): Promise<DiarizationResult>;
};

// Optional loading allows UI development before the native app is compiled.
export default requireOptionalNativeModule<AudioEngineModule>('AudioEngine');
