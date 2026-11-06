import * as FileSystem from 'expo-file-system/legacy';
import { SavedTranscript } from '../types/transcript';

function directory(): string {
  if (!FileSystem.documentDirectory) throw new Error('Постоянное хранилище недоступно.');
  return FileSystem.documentDirectory + 'transcripts/';
}
function recordPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Некорректный ID записи.');
  return directory() + id + '.json';
}
export async function saveTranscript(record: SavedTranscript): Promise<void> {
  const file = recordPath(record.id);
  await FileSystem.makeDirectoryAsync(directory(), { intermediates: true });
  const temporary = file + '.part';
  await FileSystem.writeAsStringAsync(temporary, JSON.stringify(record));
  await FileSystem.deleteAsync(file, { idempotent: true });
  await FileSystem.moveAsync({ from: temporary, to: file });
}
export async function getTranscriptsList(): Promise<SavedTranscript[]> {
  const info = await FileSystem.getInfoAsync(directory());
  if (!info.exists) return [];
  const files = await FileSystem.readDirectoryAsync(directory());
  const records: SavedTranscript[] = [];
  for (const name of files.filter(name => name.endsWith('.json') && name !== 'index.json')) {
    const value = JSON.parse(await FileSystem.readAsStringAsync(directory() + name)) as SavedTranscript;
    if (!value.id || !Array.isArray(value.exportData?.transcript)) throw new Error('Повреждена сохранённая расшифровка.');
    records.push(value);
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getTranscriptById(id: string): Promise<SavedTranscript | null> {
  const file = recordPath(id);
  if (!(await FileSystem.getInfoAsync(file)).exists) return null;
  return JSON.parse(await FileSystem.readAsStringAsync(file)) as SavedTranscript;
}
export async function deleteTranscript(id: string): Promise<void> {
  await FileSystem.deleteAsync(recordPath(id), { idempotent: true });
}
