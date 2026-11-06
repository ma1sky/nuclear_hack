import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, Button, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AudioEngine, { type DiarizationResult } from './modules/audio-engine';

export default function App() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparingModels, setPreparingModels] = useState(Boolean(AudioEngine));
  const [error, setError] = useState<string | null>(null);
  const [diarization, setDiarization] = useState<DiarizationResult | null>(null);

  useEffect(() => {
    if (!AudioEngine) return;
    let active = true;
    AudioEngine.prepareModels()
      .catch(() => {
        if (active) setError('Не удалось подготовить модели. Проверьте свободное место и перезапустите приложение.');
      })
      .finally(() => {
        if (active) setPreparingModels(false);
      });
    return () => { active = false; };
  }, []);

  async function chooseRecording() {
    setBusy(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) {
        setFile(result.assets[0]);
        setDiarization(null);
      }
    } catch {
      setError('Не удалось открыть запись. Попробуйте другой файл.');
    } finally {
      setBusy(false);
    }
  }

  async function checkDiarization() {
    if (!file || !AudioEngine) return;
    setBusy(true);
    setError(null);
    setDiarization(null);
    try {
      setDiarization(await AudioEngine.diarize(file.uri));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось разделить говорящих.');
    } finally {
      setBusy(false);
    }
  }

  async function shareIntervals() {
    if (!diarization) return;
    try {
      await Share.share({ message: JSON.stringify(diarization, null, 2) });
    } catch {
      setError('Не удалось поделиться интервалами.');
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>HEX.TEAM</Text>
        <Text style={styles.title}>Нейро-стенографист</Text>
        <Text style={styles.description}>Расшифровка разговоров на вашем устройстве</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Аудиозапись</Text>
          <Text style={styles.description}>{file?.name ?? 'Выберите запись из памяти телефона.'}</Text>
          {file?.size !== undefined && <Text>{(file.size / 1024 / 1024).toFixed(1)} МБ</Text>}
          <Button title="Выбрать запись" onPress={chooseRecording} disabled={busy} />
          <Button title="Разделить говорящих" onPress={checkDiarization} disabled={busy || preparingModels || !file || !AudioEngine} />
          {preparingModels && <Text>Подготовка локальных моделей…</Text>}
          {busy && <ActivityIndicator accessibilityLabel="Обработка записи" />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>
        {diarization && (
          <View style={styles.card}>
            <Text style={styles.heading}>Говорящие</Text>
            <Text>Обработка заняла {(diarization.elapsedMs / 1000).toFixed(1)} с</Text>
            {diarization.intervals.length === 0 && <Text>Речь не обнаружена.</Text>}
            {diarization.intervals.map(({ speakerId, startMs, endMs }, index) => (
              <Text key={`${speakerId}-${startMs}-${index}`}>
                {speakerId} · {(startMs / 1000).toFixed(3)}–{(endMs / 1000).toFixed(3)} с
              </Text>
            ))}
            <Button title="Поделиться интервалами" onPress={shareIntervals} />
          </View>
        )}
        <Text style={styles.status}>
          {AudioEngine ? 'Для проверки выберите WAV PCM 16 бит, моно, 16 кГц.' : 'Для проверки нужен APK с нативным модулем Android.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6FA' },
  content: { flexGrow: 1, padding: 24, gap: 20, justifyContent: 'center' },
  brand: { fontSize: 13, letterSpacing: 2, fontWeight: '700', color: '#2454B8' },
  title: { fontSize: 30, fontWeight: '700', color: '#152238' },
  description: { fontSize: 16, lineHeight: 24, color: '#526078' },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 16, gap: 16 },
  heading: { fontSize: 20, fontWeight: '600', color: '#152238' },
  error: { color: '#B42318' },
  status: { fontSize: 12, color: '#526078' },
});
