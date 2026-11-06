// Development-only gallery. Never imported by the production index.ts entry point.
import './global.css';
import { useState } from 'react';
import { registerRootComponent } from 'expo';
import { ScrollView, View } from 'react-native';
import { Uniwind } from 'uniwind';
import { Header } from './src/components/Header';
import { AudioPickerCard } from './src/components/AudioPickerCard';
import { ProgressCard } from './src/components/ProgressCard';
import { TranscriptItem } from './src/components/TranscriptItem';
import { SummaryCard } from './src/components/SummaryCard';
import { ExportBar } from './src/components/ExportBar';
import { HistoryModal } from './src/components/HistoryModal';
import { RenameSpeakerModal } from './src/components/RenameSpeakerModal';
import { JsonModal } from './src/components/JsonModal';
import { Text } from './src/components/ui/text';
import { ActionButton } from './src/components/ui/action-button';
import type { SavedTranscript } from './src/types/transcript';

Uniwind.setTheme('light');
const sample: SavedTranscript = {
  id: 'gallery', title: 'Обсуждение запуска приложения — запись встречи', fileName: 'meeting.wav', createdAt: '2026-11-07T08:00:00Z',
  exportData: { transcript: [{ speaker_id: 'speaker_1', start_ms: 1200, end_ms: 8900, text: 'Давайте проверим расшифровку и экспорт на телефоне. Запись должна обрабатываться без интернета.' }] },
  summary: '• Проверить обработку записи на телефоне.\n• Сохранить и экспортировать расшифровку.',
};
function Gallery() {
  const [dialog, setDialog] = useState('');
  const [name, setName] = useState('Артём Гуцаленко — разработчик Android-приложения');
  const [history, setHistory] = useState([sample]);
  const noop = () => {};
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-8">
      <Header isNative historyCount={history.length} onOpenHistory={() => setDialog('history')} />
      <AudioPickerCard selectedFile={null} busy={false} onPickFile={noop} onStartProcess={noop} />
      <AudioPickerCard selectedFile={{ name: 'Совещание_по_подготовке_защиты_нейро_стенографиста_07_ноября_2026.m4a', uri: 'gallery://fixture', lastModified: 0, size: 5242880 }} busy={false} onPickFile={noop} onStartProcess={noop} />
      <ProgressCard progress={{ stage: 'diarizing' }} onCancel={noop} />
      <ProgressCard progress={{ stage: 'transcribing', completed: 3, total: 8 }} onCancel={noop} />
      <SummaryCard summary={sample.summary ?? ''} isGenerating={false} onRegenerate={noop} />
      <View className="gap-3 px-4 py-4">
        <Text className="text-lg font-semibold">Расшифровка</Text>
        <TranscriptItem item={sample.exportData.transcript[0]} displayName={name} onPressSpeaker={() => setDialog('rename')} />
        <TranscriptItem item={{ speaker_id: 'speaker_2', start_ms: 9000, end_ms: 10500, text: 'Да, я проверю JSON.' }} displayName="Участник 2" onPressSpeaker={() => setDialog('rename')} />
        <View className="bg-error-surface rounded-lg p-4"><Text role="alert" className="text-destructive text-sm leading-5">Не удалось открыть запись. Выберите другой файл и повторите попытку.</Text></View>
        <ActionButton disabled label="Расшифровать" />
        <ActionButton loading label="Создание резюме" />
      </View>
      <ExportBar onExportJson={noop} onExportTxt={noop} onPreviewJson={() => setDialog('json')} />
      <HistoryModal visible={dialog === 'history'} transcripts={history} onClose={() => setDialog('')} onSelect={() => setDialog('json')} onDelete={id => setHistory(items => items.filter(item => item.id !== id))} />
      <RenameSpeakerModal visible={dialog === 'rename'} speakerId="speaker_1" currentName={name} onSave={(_, value) => setName(value)} onClose={() => setDialog('')} />
      <JsonModal visible={dialog === 'json'} data={sample.exportData} onClose={() => setDialog('')} onExport={noop} />
    </ScrollView>
  );
}
registerRootComponent(Gallery);
