import * as FileSystem from 'expo-file-system';
import { SavedTranscript } from '../types/transcript';

const STORAGE_DIR = `${FileSystem.documentDirectory || ''}transcripts/`;
const INDEX_FILE = `${STORAGE_DIR}index.json`;

// In-memory fallback if file system is inaccessible
const memoryFallback = new Map<string, SavedTranscript>();

async function ensureDirectory(): Promise<boolean> {
  if (!FileSystem.documentDirectory) return false;
  try {
    const info = await FileSystem.getInfoAsync(STORAGE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(STORAGE_DIR, { intermediates: true });
    }
    return true;
  } catch (err) {
    console.warn('[StorageService] Error ensuring directory:', err);
    return false;
  }
}

export async function saveTranscript(record: SavedTranscript): Promise<void> {
  const hasFs = await ensureDirectory();
  if (!hasFs) {
    memoryFallback.set(record.id, record);
    return;
  }

  try {
    const filePath = `${STORAGE_DIR}${record.id}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(record, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Update index
    const list = await getTranscriptsList();
    const updated = [record, ...list.filter((item) => item.id !== record.id)];
    await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(updated, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[StorageService] Failed to save transcript file, saving in memory:', err);
    memoryFallback.set(record.id, record);
  }
}

export async function getTranscriptsList(): Promise<SavedTranscript[]> {
  const hasFs = await ensureDirectory();
  if (!hasFs) {
    return Array.from(memoryFallback.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  try {
    const info = await FileSystem.getInfoAsync(INDEX_FILE);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(INDEX_FILE, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(content) as SavedTranscript[];
  } catch (err) {
    console.warn('[StorageService] Failed to read index:', err);
    return Array.from(memoryFallback.values());
  }
}

export async function getTranscriptById(id: string): Promise<SavedTranscript | null> {
  const list = await getTranscriptsList();
  const found = list.find((item) => item.id === id);
  if (found) return found;

  const hasFs = await ensureDirectory();
  if (!hasFs) return memoryFallback.get(id) || null;

  try {
    const filePath = `${STORAGE_DIR}${id}.json`;
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return JSON.parse(content) as SavedTranscript;
    }
  } catch {
    // ignore
  }
  return memoryFallback.get(id) || null;
}

export async function deleteTranscript(id: string): Promise<void> {
  memoryFallback.delete(id);
  const hasFs = await ensureDirectory();
  if (!hasFs) return;

  try {
    const filePath = `${STORAGE_DIR}${id}.json`;
    await FileSystem.deleteAsync(filePath, { idempotent: true });

    const list = await getTranscriptsList();
    const filtered = list.filter((item) => item.id !== id);
    await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(filtered, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[StorageService] Failed to delete transcript:', err);
  }
}
