import type { ProcessingProgress } from '../types/transcript';

/** Segment completion is measured; it is not an estimate of total processing time. */
export function measuredSegmentProgress(progress: ProcessingProgress): number | undefined {
  const { stage, completed, total } = progress;
  if (stage !== 'transcribing' || !Number.isInteger(total) || !Number.isInteger(completed) || total! <= 0 || completed! < 0) return undefined;
  return Math.min(100, Math.round(completed! / total! * 100));
}
