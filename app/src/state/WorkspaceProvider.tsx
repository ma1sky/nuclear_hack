import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type {
  ProcessingProgress,
  SavedTranscript,
  TranscriptExport,
} from "../types/transcript";
import { AudioEngineService } from "../../modules/audio-engine";
import { generateMeetingSummary } from "../services/llmService";
import { exportToJson, exportToTxt } from "../services/exportService";
import {
  deleteTranscript,
  getTranscriptsList,
  saveTranscript,
} from "../services/storageService";
import {
  listAudio,
  retainAudio,
  type AudioRecording,
} from "../services/libraryService";
import { ensureDemoAssets } from "../services/demoAudio";

function useWorkspaceState() {
  const currentRecord = useRef<SavedTranscript | null>(null);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [durationMs, setDurationMs] = useState(0);
  const cancelled = useRef(false);
  const operation = useRef(false);
  const modelPaths = useRef<Record<string, string>>({});
  // Native capabilities state
  const [isNative, setIsNative] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);

  // File and transcription state
  const [selectedFile, setSelectedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [currentTranscript, setCurrentTranscript] =
    useState<TranscriptExport | null>(null);
  const [currentSummary, setCurrentSummary] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});

  // Processing state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    stage: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // History state
  const [history, setHistory] = useState<SavedTranscript[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);

  // Modals state
  const [jsonModalVisible, setJsonModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [targetSpeakerId, setTargetSpeakerId] = useState<string | null>(null);

  // Load initial history, prepare local models & check native capabilities on mount
  useEffect(() => {
    let active = true;
    async function init() {
      const caps = await AudioEngineService.getCapabilities();
      if (active) setIsNative(caps.nativeLoaded);

      try {
        modelPaths.current = await AudioEngineService.prepareModels();
        if (active) setModelsReady(true);
      } catch (err) {
        if (active)
          setError("Не удалось подготовить встроенные модели: " + String(err));
      }

      try {
        await ensureDemoAssets();
      } catch (err) {
        console.warn("[App] Error ensuring demo assets:", err);
      }
      await refreshHistory();
      setRecordings(await listAudio());
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  async function refreshHistory() {
    try {
      const items = await getTranscriptsList();
      setHistory(items);
    } catch (err) {
      console.warn("[App] Error refreshing history:", err);
    }
  }

  // 1. Audio selection
  async function chooseAudioFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const kept = await retainAudio(file.uri, file.name.split(".").pop());
        selectAudio({ ...file, uri: kept.uri });
        return true;
      }
    } catch {
      setError("Не удалось открыть аудиозапись. Попробуйте другой файл.");
    }
  }

  // 3. Main processing pipeline
  async function startTranscription() {
    if (!selectedFile) return;
    if (operation.current) return; // Prevent concurrent tasks as required by spec

    operation.current = true;
    cancelled.current = false;
    setCurrentTranscript(null);
    setCurrentSummary(null);
    setBusy(true);
    setError(null);
    setProgress({
      stage: "preparing",
      message: "Инициализация нативного модуля...",
      percentage: 5,
    });

    try {
      modelPaths.current = await AudioEngineService.prepareModels();
      if (cancelled.current) throw new Error("Обработка отменена");
      // Step A: AudioEngine transcription (Diarization + ASR)
      let audioMetadata: { waveform?: number[]; durationMs?: number } = {};
      const transcriptResult = await AudioEngineService.transcribe(
        selectedFile.uri,
        (p) => {
          if (p.waveform) {
            audioMetadata = { waveform: p.waveform, durationMs: p.durationMs };
            setWaveform(p.waveform);
            setDurationMs(p.durationMs || 0);
          }
          setProgress(p);
        },
      );

      if (cancelled.current) throw new Error("Обработка отменена");
      setCurrentTranscript(transcriptResult);

      const record: SavedTranscript = {
        ...audioMetadata,
        id: `rec_${Date.now()}`,
        title: selectedFile.name,
        fileName: selectedFile.name,
        fileUri: selectedFile.uri,
        fileSize: selectedFile.size,
        createdAt: new Date().toISOString(),
        exportData: transcriptResult,
        summary: "",
        speakerNames: {},
      };

      await saveTranscript(record);
      currentRecord.current = record;
      await refreshHistory();

      // Step B: Local LLM Summarization (runs after sherpa is released)
      setProgress({
        stage: "summarizing",
        message: "Локальная LLM (Qwen2.5): составление резюме встречи...",
        percentage: 85,
      });

      let summaryText = "";
      try {
        summaryText = await generateMeetingSummary(transcriptResult, {
          modelPath: modelPaths.current.llm,
          shouldCancel: () => cancelled.current,
        });
        if (!cancelled.current) setCurrentSummary(summaryText);
      } catch (llmErr) {
        setError(
          "Расшифровка готова, но резюме не сформировано: " + String(llmErr),
        );
        // Requirement: LLM failure must preserve transcript!
      }

      if (cancelled.current) throw new Error("Обработка отменена");
      // Update the independently saved record with the actual model summary.
      setProgress({ stage: "saving", message: "Сохранение результата" });
      currentRecord.current = { ...record, summary: summaryText };
      await saveTranscript(currentRecord.current);
      await refreshHistory();

      setProgress({ stage: "done", message: "Готово!", percentage: 100 });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Ошибка при обработке записи";
      setError(msg);
      setProgress({ stage: "error", message: msg });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  // 4. Cancel active task
  async function cancelProcessing() {
    cancelled.current = true;
    await AudioEngineService.cancel();
    setError(
      "Отмена запрошена. Ожидается завершение текущего блока обработки.",
    );
  }

  // 5. Regenerate summary with LLM
  async function regenerateSummary() {
    if (!currentTranscript || operation.current) return;
    operation.current = true;
    setBusy(true);
    cancelled.current = false;
    setIsGeneratingSummary(true);
    setError(null);
    setProgress({ stage: "summarizing" });
    try {
      const summaryText = await generateMeetingSummary(currentTranscript, {
        modelPath: modelPaths.current.llm,
        shouldCancel: () => cancelled.current,
      });
      if (cancelled.current) throw new Error("Формирование резюме отменено.");
      setCurrentSummary(summaryText);
      if (currentRecord.current) {
        currentRecord.current = {
          ...currentRecord.current,
          summary: summaryText,
        };
        await saveTranscript(currentRecord.current);
        await refreshHistory();
      }
    } catch (err) {
      Alert.alert("Ошибка LLM", "Не удалось обновить резюме: " + String(err));
    } finally {
      operation.current = false;
      setBusy(false);
      setIsGeneratingSummary(false);
      setProgress({ stage: "done" });
    }
  }

  // 6. Export handling
  async function handleExportJson() {
    if (!currentTranscript) return;
    try {
      await exportToJson(currentTranscript, selectedFile?.name || "transcript");
    } catch (err) {
      Alert.alert("Ошибка экспорта JSON", String(err));
    }
  }

  async function handleExportTxt() {
    if (!currentTranscript) return;
    try {
      const record: SavedTranscript = {
        id: "export_temp",
        title: selectedFile?.name || "Запись",
        fileName: selectedFile?.name || "recording.wav",
        createdAt: new Date().toISOString(),
        exportData: currentTranscript,
        summary: currentSummary || undefined,
        speakerNames,
      };
      await exportToTxt(record);
    } catch (err) {
      Alert.alert("Ошибка экспорта TXT", String(err));
    }
  }

  // 7. Speaker renaming
  function openRenameSpeaker(speakerId: string) {
    setTargetSpeakerId(speakerId);
    setRenameModalVisible(true);
  }

  async function handleSaveSpeakerName(speakerId: string, newName: string) {
    if (operation.current) return;
    const names = { ...speakerNames, [speakerId]: newName.trim() || speakerId };
    if (currentRecord.current) {
      const record = { ...currentRecord.current, speakerNames: names };
      await saveTranscript(record);
      currentRecord.current = record;
      await refreshHistory();
    }
    setSpeakerNames(names);
  }

  // 8. History selection
  function handleSelectHistory(item: SavedTranscript) {
    if (operation.current) return;
    setSelectedFile({
      name: item.fileName,
      size: item.fileSize,
      uri: item.fileUri || "",
      mimeType: "audio/*",
      lastModified: new Date(item.createdAt).getTime(),
    });
    currentRecord.current = item;
    setWaveform(item.waveform || []);
    setDurationMs(item.durationMs || 0);
    setSpeakerNames(item.speakerNames || {});
    setCurrentTranscript(item.exportData);
    setCurrentSummary(item.summary || null);
    if (item.speakerNames) {
      setSpeakerNames(item.speakerNames);
    }
    setError(null);
  }

  async function handleDeleteHistory(id: string) {
    await deleteTranscript(id);
    if (currentRecord.current?.id === id) currentRecord.current = null;
    await refreshHistory();
  }

  function selectAudio(
    file: Pick<DocumentPicker.DocumentPickerAsset, "uri" | "name" | "size"> & {
      durationMs?: number;
      waveform?: number[];
    },
  ) {
    if (operation.current) return;
    currentRecord.current = null;
    setWaveform(file.waveform || []);
    setDurationMs(file.durationMs || 0);
    setSelectedFile({ ...file, lastModified: Date.now() });
    setCurrentTranscript(null);
    setCurrentSummary(null);
    setSpeakerNames({});
    setError(null);
    setProgress({ stage: "idle" });
  }
  return {
    selectedFile,
    waveform,
    durationMs,
    currentTranscript,
    currentSummary,
    speakerNames,
    busy,
    progress,
    error,
    setError,
    isNative,
    modelsReady,
    history,
    recordings,
    setRecordings,
    isGeneratingSummary,
    chooseAudioFile,
    startTranscription,
    cancelProcessing,
    regenerateSummary,
    handleExportJson,
    handleExportTxt,
    handleSaveSpeakerName,
    handleSelectHistory,
    handleDeleteHistory,
    selectAudio,
    refreshHistory,
    openRenameSpeaker,
    renameModalVisible,
    setRenameModalVisible,
    targetSpeakerId,
    jsonModalVisible,
    setJsonModalVisible,
    historyVisible,
    setHistoryVisible,
  };
}
type WorkspaceState = ReturnType<typeof useWorkspaceState>;
const Context = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkspaceState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider required");
  return value;
}
