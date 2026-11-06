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
  const palette = [
    { bg: '#EFF4FF', text: '#1E40AF', border: '#BFDBFE' }, // Blue
    { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' }, // Green
    { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' }, // Purple
    { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' }, // Orange
    { bg: '#FDF2F8', text: '#9D174D', border: '#FBCFE8' }, // Pink
    { bg: '#F0FDFA', text: '#115E59', border: '#99F6E4' }, // Teal
  ];

  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = (hash << 5) - hash + speakerId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}
