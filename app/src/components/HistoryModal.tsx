import { FlatList, View } from 'react-native';
import type { SavedTranscript } from '../types/transcript';
import { formatDate } from '../utils/formatters';
import { Text } from './ui/text';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { ModalShell } from './ui/modal-shell';

interface HistoryModalProps {
  visible: boolean; transcripts: SavedTranscript[]; onSelect: (item: SavedTranscript) => void;
  onDelete: (id: string) => void; onClose: () => void;
}
export function HistoryModal({ visible, transcripts, onSelect, onDelete, onClose }: HistoryModalProps) {
  return (
    <ModalShell visible={visible} title={`История (${transcripts.length})`} onClose={onClose}>
      <FlatList className="shrink" data={transcripts} keyExtractor={item => item.id} contentContainerClassName="gap-3 p-4"
        ListEmptyComponent={<Text className="text-muted-foreground text-base leading-6">Здесь появятся обработанные записи. Они сохраняются на телефоне автоматически.</Text>}
        renderItem={({ item }) => (
          <View className="border-border gap-2 rounded-lg border p-3">
            <Button variant="ghost" className="h-auto items-start justify-start p-0" onPress={() => { onSelect(item); onClose(); }} accessibilityLabel={`Открыть ${item.title || item.fileName}`}>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-base font-semibold leading-6">{item.title || item.fileName}</Text>
                <Text className="text-muted-foreground text-xs leading-5">{formatDate(item.createdAt)} · {item.exportData.transcript.length} реплик</Text>
                {!!item.summary && <Text className="text-muted-foreground text-sm leading-5" numberOfLines={2}>{item.summary}</Text>}
              </View>
            </Button>
            <ActionButton variant="ghost" className="self-end" label="Удалить" onPress={() => onDelete(item.id)} accessibilityLabel={`Удалить ${item.title || item.fileName}`} />
          </View>
        )} />
    </ModalShell>
  );
}
