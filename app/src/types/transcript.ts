/** External export contract from page 15 of the official brief. */
export type TranscriptExport = {
  transcript: {
    speaker_id: string;
    start_ms: number;
    end_ms: number;
    text: string;
  }[];
};

export type ProcessingStage = 'preparing' | 'diarizing' | 'transcribing' | 'postprocessing' | 'saving';
