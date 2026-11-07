import * as FS from "expo-file-system/legacy";

export type AudioRecording = {
  id: string;
  title: string;
  uri: string;
  durationMs: number;
  waveform?: number[];
  createdAt: string;
  size?: number;
};
function root() {
  if (!FS.documentDirectory) throw new Error("Хранилище аудио недоступно");
  return FS.documentDirectory + "audio-library/";
}
function path(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Некорректная запись");
  return root() + id;
}
export async function retainAudio(uri: string, extension = "m4a") {
  await FS.makeDirectoryAsync(root(), { intermediates: true });
  const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const destination =
    path(id) +
    "." +
    (/^(wav|m4a|aac|mp3)$/i.test(extension) ? extension : "audio");
  await FS.copyAsync({ from: uri, to: destination });
  const info = await FS.getInfoAsync(destination);
  return { id, uri: destination, size: info.exists ? info.size : undefined };
}
export async function saveAudio(record: AudioRecording) {
  await FS.makeDirectoryAsync(root(), { intermediates: true });
  await FS.writeAsStringAsync(
    path(record.id) + ".json",
    JSON.stringify(record),
  );
}
export async function listAudio(): Promise<AudioRecording[]> {
  if (!(await FS.getInfoAsync(root())).exists) return [];
  const records: AudioRecording[] = [];
  for (const name of await FS.readDirectoryAsync(root())) {
    if (!name.endsWith(".json")) continue;
    const record = JSON.parse(
      await FS.readAsStringAsync(root() + name),
    ) as AudioRecording;
    if (record.id && record.uri && (await FS.getInfoAsync(record.uri)).exists)
      records.push(record);
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function removeAudio(record: AudioRecording) {
  // Only delete app-owned files. A transcript may continue to reference this URI;
  // its text is kept, and the player reports that source audio is unavailable.
  if (!record.uri.startsWith(root()))
    throw new Error("Этот файл не принадлежит аудиотеке");
  await FS.deleteAsync(record.uri, { idempotent: true });
  await FS.deleteAsync(path(record.id) + ".json", { idempotent: true });
}
