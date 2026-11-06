import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface RenameSpeakerModalProps {
  visible: boolean;
  speakerId: string | null;
  currentName: string;
  onSave: (speakerId: string, newName: string) => void;
  onClose: () => void;
}

export const RenameSpeakerModal: React.FC<RenameSpeakerModalProps> = ({
  visible,
  speakerId,
  currentName,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(currentName);

  React.useEffect(() => {
    setName(currentName);
  }, [currentName]);

  if (!speakerId) return null;

  const handleSave = () => {
    onSave(speakerId, name.trim() || speakerId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Переименовать участника</Text>
          <Text style={styles.subtitle}>
            Идентификатор в системе: <Text style={styles.idText}>{speakerId}</Text>
          </Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Например: Кот Матроскин / Председатель"
            placeholderTextColor="#94A3B8"
            autoFocus
          />

          <Text style={styles.noticeText}>
            💡 В сдаваемом экспертам JSON сохранится строгий ID <Text style={{ fontWeight: '700' }}>{speakerId}</Text>,
            а понятное имя отобразится в интерфейсе и TXT-протоколе.
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.btnCancelText}>Отмена</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.btnSaveText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  idText: {
    fontWeight: '700',
    color: '#2563EB',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#F1F5F9',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  btnSave: {
    backgroundColor: '#2563EB',
  },
  btnSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
