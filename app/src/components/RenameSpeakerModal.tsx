import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { ActionButton } from './ui/action-button';
import { ModalShell } from './ui/modal-shell';

interface RenameSpeakerModalProps {
  visible: boolean; speakerId: string | null; currentName: string;
  onSave: (speakerId: string, newName: string) => void; onClose: () => void;
}
export function RenameSpeakerModal({ visible, speakerId, currentName, onSave, onClose }: RenameSpeakerModalProps) {
  const [name, setName] = useState(currentName);
  const [previousName, setPreviousName] = useState(currentName);
  if (currentName !== previousName) { setName(currentName); setPreviousName(currentName); }
  if (!speakerId) return null;
  const save = () => { onSave(speakerId, name.trim() || speakerId); onClose(); };
  return (
    <ModalShell visible={visible} title="Имя участника" onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4">
        <Text className="text-sm text-muted-foreground">Участник: {speakerId}</Text>
        <Input accessibilityLabel="Имя участника" value={name} onChangeText={setName} placeholder="Например, Артём" autoFocus onSubmitEditing={save} returnKeyType="done" />
        <Text className="text-sm leading-5 text-muted-foreground">Имя используется в расшифровке и TXT. В JSON сохраняется исходный идентификатор участника.</Text>
        <View className="gap-2">
          <ActionButton label="Сохранить имя" onPress={save} />
          <ActionButton variant="outline" label="Отмена" onPress={onClose} />
        </View>
      </ScrollView>
    </ModalShell>
  );
}
