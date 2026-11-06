import { theme } from '../theme/tokens';

/**
 * Utility functions for formatting time, file size, and dates.
 */

export function formatTimeMs(ms: number): string {
  if (isNaN(ms) || ms < 0) return '00:00.00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const xx = hundredths.toString().padStart(2, '0');
  return `${mm}:${ss}.${xx}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns a stable, distinct color based on speaker ID
 */
export function getSpeakerColor(speakerId: string): { bg: string; text: string; border: string } {
  const palette = theme.speakers;

  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = (hash << 5) - hash + speakerId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}
