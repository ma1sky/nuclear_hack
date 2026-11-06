import { requireOptionalNativeModule } from 'expo-modules-core';
import { EngineCapabilities, ProcessingProgress, TranscriptExport } from '../../src/types/transcript';

export type { EngineCapabilities };
export type SpeakerInterval = { startMs: number; endMs: number; speakerId: string };
export type DiarizationResult = { durationMs: number; elapsedMs: number; intervals: SpeakerInterval[] };
export interface NativeAudioEngineModule {
  getCapabilities(): EngineCapabilities;
  prepareModels(): Promise<Record<string, string>>;
  diarize(fileUri: string): Promise<DiarizationResult>;
  transcribe(fileUri: string): Promise<TranscriptExport>;
  cancel(): boolean;
  addListener(name: 'onProgress', listener: (event: ProcessingProgress) => void): { remove(): void };
}
const NativeModule = requireOptionalNativeModule<NativeAudioEngineModule>('AudioEngine');
let inFlight = false;
export class AudioEngineService {
  static isNativeAvailable() { return NativeModule !== null; }
  static async getCapabilities(): Promise<EngineCapabilities> {
    return NativeModule ? { ...NativeModule.getCapabilities(), nativeLoaded: true } : { asr: false, diarization: false, llm: false, nativeLoaded: false };
  }
  static async prepareModels(): Promise<Record<string, string>> {
    if (!NativeModule) throw new Error('Нужна Android-сборка с нативным модулем.');
    return NativeModule.prepareModels();
  }
  static async diarize(fileUri: string): Promise<DiarizationResult> {
    if (!NativeModule) throw new Error('Нативная диаризация недоступна.');
    return NativeModule.diarize(fileUri);
  }
  static async cancel(): Promise<boolean> { return NativeModule?.cancel() ?? false; }
  static async transcribe(fileUri: string, onProgress?: (progress: ProcessingProgress) => void): Promise<TranscriptExport> {
    if (!NativeModule) throw new Error('Нативное распознавание недоступно.');
    if (inFlight) throw new Error('Обработка уже выполняется.');
    inFlight = true;
    let subscription: { remove(): void } | undefined;
    try {
      subscription = onProgress ? NativeModule.addListener('onProgress', onProgress) : undefined;
      return await NativeModule.transcribe(fileUri);
    }
    finally { subscription?.remove(); inFlight = false; }
  }
}
export default NativeModule;
