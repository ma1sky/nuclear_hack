import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SavedTranscript, TranscriptExport } from '../types/transcript';
import { formatDate, formatTimeMs } from '../utils/formatters';

/**
 * Validates and strictly sanitizes transcript export according to Page 15 of the brief.
 * Ensures NO extraneous fields are included in the JSON evaluation payload.
 */
export function sanitizeTranscriptExport(data: TranscriptExport): TranscriptExport {
  if (!data || !Array.isArray(data.transcript)) {
    return { transcript: [] };
  }

  const sanitized = data.transcript.map((item) => {
    return {
      speaker_id: String(item.speaker_id || 'speaker_1'),
      start_ms: Math.round(Number(item.start_ms) || 0),
      end_ms: Math.round(Number(item.end_ms) || 0),
      text: String(item.text || '').trim(),
    };
  });

  return { transcript: sanitized };
}

/**
 * Exports strict JSON file and triggers native sharing dialogue
 */
export async function exportToJson(data: TranscriptExport, baseFileName: string = 'transcript'): Promise<string> {
  const sanitized = sanitizeTranscriptExport(data);
  const jsonContent = JSON.stringify(sanitized, null, 2);

  const cleanName = baseFileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_');
  const fileName = `${cleanName}_export.json`;
  const filePath = `${FileSystem.cacheDirectory || ''}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, jsonContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Экспорт расшифровки (JSON)',
      UTI: 'public.json',
    });
  }

  return filePath;
}

/**
 * Exports human-readable TXT meeting protocol with LLM summary and custom names
 */
export async function exportToTxt(saved: SavedTranscript): Promise<string> {
  const lines: string[] = [];

  lines.push('====================================================');
  lines.push('          ПРОТОКОЛ СОВЕЩАНИЯ / НЕЙРО-СТЕНОГРАФИСТ    ');
  lines.push('====================================================');
  lines.push(`Запись:     ${saved.fileName}`);
  lines.push(`Дата:       ${formatDate(saved.createdAt)}`);
  if (saved.durationMs) {
    lines.push(`Длительность: ${formatTimeMs(saved.durationMs)}`);
  }
  lines.push('');

  if (saved.summary) {
    lines.push('----------------------------------------------------');
    lines.push('РЕЗЮМЕ ВСТРЕЧИ (Локальная LLM Qwen):');
    lines.push('----------------------------------------------------');
    lines.push(saved.summary.trim());
    lines.push('');
  }

  lines.push('----------------------------------------------------');
  lines.push('СТЕНОГРАММА ДИАЛОГА:');
  lines.push('----------------------------------------------------');

  const speakerNames = saved.speakerNames || {};
  saved.exportData.transcript.forEach((item, index) => {
    const timeStr = `[${formatTimeMs(item.start_ms)} - ${formatTimeMs(item.end_ms)}]`;
    const displayName = speakerNames[item.speaker_id] || item.speaker_id;
    lines.push(`${index + 1}. ${timeStr} ${displayName}:`);
    lines.push(`   ${item.text}`);
    lines.push('');
  });

  lines.push('====================================================');
  lines.push('Создано в приложении Нейро-стенографист (HEX.TEAM)');

  const txtContent = lines.join('\n');
  const cleanName = saved.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_');
  const fileName = `${cleanName}_protocol.txt`;
  const filePath = `${FileSystem.cacheDirectory || ''}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, txtContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'text/plain',
      dialogTitle: 'Экспорт протокола встречи (TXT)',
      UTI: 'public.plain-text',
    });
  }

  return filePath;
}
