import { TranscriptExport } from '../types/transcript';

/**
 * Service for local LLM inference (Qwen2.5-0.5B-Instruct via llama.rn or native engine).
 * Generates an executive summary (до 3 пунктов) from dialogue transcript.
 */

export interface LLMSummaryOptions {
  modelPath?: string;
  maxTokens?: number;
  temperature?: number;
  onProgress?: (text: string) => void;
}

const SYSTEM_PROMPT =
  'Ты — беспристрастный локальный помощник-стенографист. Проанализируй представленный диалог совещания и выдели кратко главную суть и принятые решения в виде 2-3 коротких пунктов на русском языке. Опирайся исключительно на факты из текста.';

/**
 * Splits transcript into text blocks to fit within 2048 token budget
 */
function buildDialogueText(transcript: TranscriptExport['transcript'], maxChars: number = 3000): string {
  const lines: string[] = [];
  let currentLength = 0;

  for (const item of transcript) {
    const line = `${item.speaker_id}: ${item.text}`;
    if (currentLength + line.length > maxChars) {
      lines.push('... [диалог продолжается]');
      break;
    }
    lines.push(line);
    currentLength += line.length;
  }

  return lines.join('\n');
}

/**
 * Offline rule-based fallback summary when native LLM weights are not yet loaded or fail
 */
function generateFallbackSummary(transcript: TranscriptExport['transcript']): string {
  if (!transcript || transcript.length === 0) {
    return '• Запись не содержит распознанных реплик.';
  }

  const speakers = Array.from(new Set(transcript.map((t) => t.speaker_id)));
  const speakerCount = speakers.length;
  const firstUtterance = transcript[0]?.text || '';
  const lastUtterance = transcript[transcript.length - 1]?.text || '';

  const bullets = [
    `• В диалоге приняли участие ${speakerCount} ${speakerCount === 1 ? 'участник' : speakerCount < 5 ? 'участника' : 'участников'}, всего ${transcript.length} реплик.`,
    `• Обсуждение начато с темы: «${firstUtterance.slice(0, 80)}${firstUtterance.length > 80 ? '...' : ''}».`,
    `• Завершение беседы: «${lastUtterance.slice(0, 80)}${lastUtterance.length > 80 ? '...' : ''}».`,
  ];

  return bullets.join('\n');
}

/**
 * Generates summary using llama.rn if available, or fallback
 */
export async function generateMeetingSummary(
  exportData: TranscriptExport,
  options?: LLMSummaryOptions
): Promise<string> {
  if (!exportData.transcript || exportData.transcript.length === 0) {
    return '• Диалог пуст, резюме не сформировано.';
  }

  const dialogue = buildDialogueText(exportData.transcript);
  const prompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\nТекст диалога:\n${dialogue}\n\nСформируй краткое резюме:<|im_end|>\n<|im_start|>assistant\n`;

  try {
    // Attempt dynamic require for llama.rn if installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let llamaModule: any = null;
    try {
      // Dynamic import to avoid build errors when llama.rn is not yet added to node_modules
      llamaModule = require('llama.rn');
    } catch {
      llamaModule = null;
    }

    if (llamaModule && llamaModule.initLlama && options?.modelPath) {
      options?.onProgress?.('Инициализация Qwen2.5...');
      const context = await llamaModule.initLlama({
        model: options.modelPath,
        use_mlock: false,
        n_ctx: 2048,
        n_threads: 2,
        n_gpu_layers: 0,
      });

      options?.onProgress?.('Генерация резюме...');
      const result = await context.completion(
        {
          prompt,
          n_predict: options?.maxTokens || 160,
          temperature: options?.temperature ?? 0.0,
          stop: ['<|im_end|>', '<|endoftext|>'],
        },
        (data: { token?: string }) => {
          if (data?.token && options?.onProgress) {
            options.onProgress(data.token);
          }
        }
      );

      await context.release();
      const output = (result?.text || '').trim();
      if (output.length > 10) {
        return output;
      }
    }
  } catch (err) {
    console.warn('[LLMService] Native llama.rn failed or not initialized, using structured fallback:', err);
  }

  // Graceful fallback for UI testing and when models are not mounted yet
  return generateFallbackSummary(exportData.transcript);
}
