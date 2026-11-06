import type { TranscriptExport } from '../types/transcript';

/** Reject corrupt model output rather than inventing speakers, text, or timestamps. */
export function sanitizeTranscriptExport(data: TranscriptExport): TranscriptExport {
  if (!data || !Array.isArray(data.transcript)) throw new Error('Некорректная расшифровка.');
  return { transcript: data.transcript.map(item => {
    if (typeof item.speaker_id !== 'string' || !item.speaker_id.trim() || typeof item.text !== 'string' ||
      !Number.isSafeInteger(item.start_ms) || !Number.isSafeInteger(item.end_ms) ||
      item.start_ms < 0 || item.end_ms <= item.start_ms) throw new Error('Некорректная реплика или временные метки.');
    return { speaker_id: item.speaker_id, start_ms: item.start_ms, end_ms: item.end_ms, text: item.text };
  }) };
}
