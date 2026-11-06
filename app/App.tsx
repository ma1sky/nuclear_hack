import './global.css';
import { Uniwind } from 'uniwind';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/theme/tokens';
import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';

// Types
import { ProcessingProgress, SavedTranscript, TranscriptExport } from './src/types/transcript';

// Services
import { AudioEngineService } from './modules/audio-engine';
import { generateMeetingSummary } from './src/services/llmService';
import { exportToJson, exportToTxt } from './src/services/exportService';
import { deleteTranscript, getTranscriptsList, saveTranscript } from './src/services/storageService';


// Components
import { Header } from './src/components/Header';
import { AudioPickerCard } from './src/components/AudioPickerCard';
import { ProgressCard } from './src/components/ProgressCard';
import { SummaryCard } from './src/components/SummaryCard';
import { TranscriptItem } from './src/components/TranscriptItem';
import { ExportBar } from './src/components/ExportBar';
import { RenameSpeakerModal } from './src/components/RenameSpeakerModal';
import { JsonModal } from './src/components/JsonModal';
import { HistoryModal } from './src/components/HistoryModal';

Uniwind.setTheme('light');

export default function App() {
  const cancelled = useRef(false);
  const operation = useRef(false);
  const modelPaths = useRef<Record<string, string>>({});
  // Native capabilities state
  const [isNative, setIsNative] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);

  // File and transcription state
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState<TranscriptExport | null>(null);
  const [currentSummary, setCurrentSummary] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});

  // Processing state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({ stage: 'idle' });
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
        if (active) setError('Не удалось подготовить встроенные модели: ' + String(err));
      }

      await refreshHistory();
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
      console.warn('[App] Error refreshing history:', err);
    }
  }

  // 1. Audio selection
  async function chooseAudioFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch {
      setError('Не удалось открыть аудиозапись. Попробуйте другой файл.');
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
    setProgress({ stage: 'preparing', message: 'Инициализация нативного модуля...', percentage: 5 });

    try {
      modelPaths.current = await AudioEngineService.prepareModels();
      if (cancelled.current) throw new Error("Обработка отменена");
      // Step A: AudioEngine transcription (Diarization + ASR)
      const transcriptResult = await AudioEngineService.transcribe(selectedFile.uri, (p) => {
        setProgress(p);
      });

      if (cancelled.current) throw new Error("Обработка отменена");
      setCurrentTranscript(transcriptResult);

      const record: SavedTranscript = {
        id: `rec_${Date.now()}`,
        title: selectedFile.name,
        fileName: selectedFile.name,
        fileUri: selectedFile.uri,
        fileSize: selectedFile.size,
        createdAt: new Date().toISOString(),
        exportData: transcriptResult,
        summary: '',
        speakerNames,
      };

      await saveTranscript(record);

      // Step B: Local LLM Summarization (runs after sherpa is released)
      setProgress({
        stage: 'summarizing',
        message: 'Локальная LLM (Qwen2.5): составление резюме встречи...',
        percentage: 85,
      });

      let summaryText = '';
      try {
        summaryText = await generateMeetingSummary(transcriptResult, { modelPath: modelPaths.current.llm, shouldCancel: () => cancelled.current });
        if (!cancelled.current) setCurrentSummary(summaryText);
      } catch (llmErr) {
        setError('Расшифровка готова, но резюме не сформировано: ' + String(llmErr));
        // Requirement: LLM failure must preserve transcript!
      }

      if (cancelled.current) throw new Error("Обработка отменена");
      // Update the independently saved record with the actual model summary.
      await saveTranscript({ ...record, summary: summaryText });
      await refreshHistory();

      setProgress({ stage: 'done', message: 'Готово!', percentage: 100 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при обработке записи';
      setError(msg);
      setProgress({ stage: 'error', message: msg });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  // 4. Cancel active task
  async function cancelProcessing() {
    cancelled.current = true;
    await AudioEngineService.cancel();
    setError('Отмена запрошена. Ожидается завершение текущего блока обработки.');
  }

  // 5. Regenerate summary with LLM
  async function regenerateSummary() {
    if (!currentTranscript || operation.current) return;
    operation.current = true;
    setBusy(true);
    cancelled.current = false;
    setIsGeneratingSummary(true);
    try {
      const summaryText = await generateMeetingSummary(currentTranscript, { modelPath: modelPaths.current.llm, shouldCancel: () => cancelled.current });
      setCurrentSummary(summaryText);
    } catch (err) {
      Alert.alert('Ошибка LLM', 'Не удалось обновить резюме: ' + String(err));
    } finally {
      operation.current = false;
      setBusy(false);
      setIsGeneratingSummary(false);
    }
  }

  // 6. Export handling
  async function handleExportJson() {
    if (!currentTranscript) return;
    try {
      await exportToJson(currentTranscript, selectedFile?.name || 'transcript');
    } catch (err) {
      Alert.alert('Ошибка экспорта JSON', String(err));
    }
  }

  async function handleExportTxt() {
    if (!currentTranscript) return;
    try {
      const record: SavedTranscript = {
        id: 'export_temp',
        title: selectedFile?.name || 'Запись',
        fileName: selectedFile?.name || 'recording.wav',
        createdAt: new Date().toISOString(),
        exportData: currentTranscript,
        summary: currentSummary || undefined,
        speakerNames,
      };
      await exportToTxt(record);
    } catch (err) {
      Alert.alert('Ошибка экспорта TXT', String(err));
    }
  }

  // 7. Speaker renaming
  function openRenameSpeaker(speakerId: string) {
    setTargetSpeakerId(speakerId);
    setRenameModalVisible(true);
  }

  function handleSaveSpeakerName(speakerId: string, newName: string) {
    setSpeakerNames((prev) => ({
      ...prev,
      [speakerId]: newName,
    }));
  }

  // 8. History selection
  function handleSelectHistory(item: SavedTranscript) {
    if (operation.current) return;
    setSelectedFile({
      name: item.fileName,
      size: item.fileSize,
      uri: item.fileUri || '',
      mimeType: 'audio/*',
      lastModified: new Date(item.createdAt).getTime(),
    });
    setCurrentTranscript(item.exportData);
    setCurrentSummary(item.summary || null);
    if (item.speakerNames) {
      setSpeakerNames(item.speakerNames);
    }
    setError(null);
  }

  async function handleDeleteHistory(id: string) {
    await deleteTranscript(id);
    await refreshHistory();
  }

  return (
    <SafeAreaProvider><SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Header */}
        <Header
          isNative={isNative && modelsReady}
          historyCount={history.length}
          onOpenHistory={() => setHistoryVisible(true)}
        />

        {/* Error notification */}
        {error && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Закрыть сообщение об ошибке" onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.errorClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scrollable list content */}
        <FlatList
          data={currentTranscript?.transcript || []}
          keyExtractor={(_, index) => `utt_${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          ListHeaderComponent={
            <View>
              {/* File selector card */}
              <AudioPickerCard
                selectedFile={selectedFile}
                busy={busy}
                onPickFile={chooseAudioFile}
                onStartProcess={startTranscription}
              />

              {/* In-progress banner */}
              {busy && <ProgressCard progress={progress} onCancel={cancelProcessing} />}

              {/* LLM Summary card */}
              {currentSummary && (
                <SummaryCard
                  summary={currentSummary}
                  isGenerating={isGeneratingSummary}
                  onRegenerate={regenerateSummary}
                />
              )}

              {/* Utterance list header */}
              {currentTranscript && (
                <View style={styles.listHeaderRow}>
                  <Text style={styles.listHeaderTitle}>
                    Стенограмма диалога ({currentTranscript.transcript.length} реплик)
                  </Text>
                  <Text style={styles.listHeaderSub}>Нажмите на имя участника, чтобы изменить его</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.utteranceItemWrapper}>
              <TranscriptItem
                item={item}
                displayName={speakerNames[item.speaker_id] || item.speaker_id}
                onPressSpeaker={openRenameSpeaker}
              />
            </View>
          )}
          ListEmptyComponent={
            !busy ? (
              <View style={styles.emptyView}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyTitle}>{currentTranscript ? 'Речь не обнаружена' : 'Здесь появится расшифровка'}</Text>
                <Text style={styles.emptyText}>
                  Выберите локальную запись WAV PCM16 или M4A/AAC для обработки на устройстве.
                </Text>
              </View>
            ) : undefined
          }
        />

        {/* Bottom export bar */}
        {currentTranscript && currentTranscript.transcript.length > 0 && (
          <ExportBar
            onExportJson={handleExportJson}
            onExportTxt={handleExportTxt}
            onPreviewJson={() => setJsonModalVisible(true)}
          />
        )}

        {/* Modals */}
        <RenameSpeakerModal
          key={`${targetSpeakerId}-${renameModalVisible}`}
          visible={renameModalVisible}
          speakerId={targetSpeakerId}
          currentName={targetSpeakerId ? speakerNames[targetSpeakerId] || targetSpeakerId : ''}
          onSave={handleSaveSpeakerName}
          onClose={() => setRenameModalVisible(false)}
        />

        <JsonModal
          visible={jsonModalVisible}
          data={currentTranscript}
          onClose={() => setJsonModalVisible(false)}
          onExport={handleExportJson}
        />

        <HistoryModal
          visible={historyVisible}
          transcripts={history}
          onSelect={handleSelectHistory}
          onDelete={handleDeleteHistory}
          onClose={() => setHistoryVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  utteranceItemWrapper: {
    paddingHorizontal: 16,
  },
  listHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  listHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.foreground,
  },
  listHeaderSub: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorSurface,
    borderLeftWidth: 4,
    borderLeftColor: colors.destructive,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.destructive,
    fontWeight: '500',
  },
  errorClose: {
    fontSize: 14,
    color: colors.destructive,
    fontWeight: '700',
    padding: 12,
    minHeight: 48,
    minWidth: 48,
  },
  emptyView: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
});
