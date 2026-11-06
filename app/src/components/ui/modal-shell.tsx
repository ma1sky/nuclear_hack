import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, View } from 'react-native';
import { Text } from './text';
import { ActionButton } from './action-button';

export function ModalShell({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-center bg-black/50 p-4">
        <View className="bg-card max-h-[85%] w-full max-w-lg self-center overflow-hidden rounded-xl border border-border" accessibilityViewIsModal>
          <View className="border-border gap-2 border-b p-4">
            <Text role="heading" className="text-xl font-semibold leading-7">{title}</Text>
            <ActionButton label="Закрыть" variant="ghost" onPress={onClose} className="self-end" accessibilityLabel={`Закрыть: ${title}`} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
