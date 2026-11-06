import { View } from 'react-native';
import { ActionButton } from './ui/action-button';

interface ExportBarProps { onExportJson: () => void; onExportTxt: () => void; onPreviewJson: () => void }
export function ExportBar({ onExportJson, onExportTxt, onPreviewJson }: ExportBarProps) {
  return (
    <View className="bg-card border-border gap-2 border-t px-4 py-3">
      <ActionButton label="Экспортировать JSON" onPress={onExportJson} />
      <View className="flex-row gap-2">
        <ActionButton className="flex-1" variant="outline" label="Экспорт TXT" onPress={onExportTxt} />
        <ActionButton className="flex-1" variant="ghost" label="Посмотреть JSON" onPress={onPreviewJson} />
      </View>
    </View>
  );
}
