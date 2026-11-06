import { View } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Text } from './ui/text';
import { ActionButton } from './ui/action-button';
import { formatFileSize } from '../utils/formatters';

interface AudioPickerCardProps { selectedFile: DocumentPickerAsset | null; busy: boolean; onPickFile: () => void; onStartProcess: () => void }

export function AudioPickerCard({ selectedFile, busy, onPickFile, onStartProcess }: AudioPickerCardProps) {
  return (
    <Card className="mx-4 mt-4 gap-4 py-4 shadow-none">
      <CardHeader className="gap-2 px-4">
        <CardTitle className="text-xl leading-7">Запись разговора</CardTitle>
        <CardDescription className="text-sm leading-5">Выберите запись встречи или звонка из памяти телефона.</CardDescription>
      </CardHeader>
      <CardContent className="gap-4 px-4">
        {selectedFile ? (
          <View className="bg-muted gap-1 rounded-md p-3">
            <Text className="text-base font-medium leading-6" selectable>{selectedFile.name}</Text>
            <Text className="text-muted-foreground text-sm leading-5">{formatFileSize(selectedFile.size)} · {selectedFile.name.split('.').pop()?.toUpperCase()}</Text>
          </View>
        ) : <Text className="text-muted-foreground text-sm leading-5">WAV PCM16, M4A или AAC. Обработка выполняется без отправки записи в сеть.</Text>}
        <View className="gap-2">
          <ActionButton label={selectedFile ? 'Выбрать другую запись' : 'Выбрать запись'} variant={selectedFile ? 'outline' : 'default'} disabled={busy} onPress={onPickFile} />
          {selectedFile && <ActionButton label="Расшифровать" disabled={busy} onPress={onStartProcess} />}
        </View>
      </CardContent>
    </Card>
  );
}
