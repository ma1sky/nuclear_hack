import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AudioEngine from './modules/audio-engine';

export default function App() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseRecording() {
    setBusy(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) setFile(result.assets[0]);
    } catch {
      setError('Не удалось открыть запись. Попробуйте другой файл.');
    } finally {
      setBusy(false);
    }
  }

  async function prepareModels() {
    if (!AudioEngine) return;
    setBusy(true);
    setError(null);
    try {
      await AudioEngine.prepareModels();
      setModelsReady(true);
    } catch {
      setModelsReady(false);
      setError('Не удалось подготовить встроенные модели. Проверьте свободное место и используйте APK с полным комплектом моделей.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.brand}>HEX.TEAM</Text>
        <Text style={styles.title}>Нейро-стенографист</Text>
        <Text style={styles.description}>Расшифровка разговоров на вашем устройстве</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Аудиозапись</Text>
          <Text style={styles.description}>{file?.name ?? 'Выберите запись из памяти телефона.'}</Text>
          {file?.size !== undefined && <Text>{(file.size / 1024 / 1024).toFixed(1)} МБ</Text>}
          {busy ? <ActivityIndicator /> : <Button title="Выбрать запись" onPress={chooseRecording} />}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>
        <Text style={styles.description}>
          Подготовлена основа приложения. Распознавание, разделение участников и локальная LLM пока не подключены.
        </Text>
        <Text style={styles.description}>
          {modelsReady ? 'Встроенные модели проверены и подготовлены.' : 'Подготовка встроенных моделей выполняется без интернета.'}
        </Text>
        <Button title="Подготовить модели" disabled={busy || !AudioEngine} onPress={prepareModels} />
        <Text style={styles.status}>
          {AudioEngine ? 'Нативный модуль подключён' : 'Для проверки нативного модуля нужна Android development build'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6FA' },
  content: { flex: 1, padding: 24, gap: 20, justifyContent: 'center' },
  brand: { fontSize: 13, letterSpacing: 2, fontWeight: '700', color: '#2454B8' },
  title: { fontSize: 30, fontWeight: '700', color: '#152238' },
  description: { fontSize: 16, lineHeight: 24, color: '#526078' },
  card: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 16, gap: 16 },
  heading: { fontSize: 20, fontWeight: '600', color: '#152238' },
  error: { color: '#B42318' },
  status: { fontSize: 12, color: '#526078' },
});
