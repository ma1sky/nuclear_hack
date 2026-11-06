import { ScrollView, View } from 'react-native';
import type { TranscriptExport } from '../types/transcript';
import { sanitizeTranscriptExport } from '../services/exportService';
import { Text } from './ui/text';
import { ActionButton } from './ui/action-button';
import { ModalShell } from './ui/modal-shell';

interface JsonModalProps { visible: boolean; data: TranscriptExport | null; onClose: () => void; onExport: () => void }
export function JsonModal({ visible, data, onClose, onExport }: JsonModalProps) {
  if (!data) return null;
  return (
    <ModalShell visible={visible} title="Просмотр JSON" onClose={onClose}>
      <ScrollView contentContainerClassName="bg-muted p-4" className="shrink">
        <Text selectable className="font-mono text-xs leading-5">{JSON.stringify(sanitizeTranscriptExport(data), null, 2)}</Text>
      </ScrollView>
      <View className="border-border border-t p-4"><ActionButton label="Экспортировать JSON" onPress={onExport} /></View>
    </ModalShell>
  );
}
