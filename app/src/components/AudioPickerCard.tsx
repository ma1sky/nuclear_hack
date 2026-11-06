import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { formatFileSize } from '../utils/formatters';

interface AudioPickerCardProps {
  selectedFile: DocumentPicker.DocumentPickerAsset | null;
  busy: boolean;
  onPickFile: () => void;
  onLoadMock: () => void;
  onStartProcess: () => void;
}

export const AudioPickerCard: React.FC<AudioPickerCardProps> = ({
  selectedFile,
  busy,
  onPickFile,
  onLoadMock,
  onStartProcess,
}) => {
  const isSupportedAudio = (name?: string) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.endsWith('.wav') || lower.endsWith('.m4a') || lower.endsWith('.mp3') || lower.endsWith('.aac');
  };

  const isWavOrM4a = selectedFile ? isSupportedAudio(selectedFile.name) : false;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Входная аудиозапись</Text>
        <TouchableOpacity onPress={onLoadMock} disabled={busy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.testDataBtn, busy && styles.disabledText]}>+ Тестовая запись</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fileBox}>
        <View style={styles.fileIconBox}>
          <Text style={styles.fileEmoji}>🎙️</Text>
        </View>
        <View style={styles.fileMeta}>
          <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
            {selectedFile?.name ?? 'Файл не выбран'}
          </Text>
          <Text style={styles.fileSub}>
            {selectedFile
              ? `${formatFileSize(selectedFile.size)} • ${selectedFile.name.split('.').pop()?.toUpperCase() || 'AUDIO'}`
              : 'WAV (16 кГц mono) или M4A из памяти устройства'}
          </Text>
        </View>
      </View>

      {selectedFile && !isWavOrM4a && (
        <Text style={styles.warningText}>
          ⚠️ Рекомендуются форматы WAV (16 кГц PCM) или M4A/AAC для точной диаризации.
        </Text>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
          onPress={onPickFile}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSecondaryText}>{selectedFile ? 'Сменить файл' : 'Выбрать файл'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, (!selectedFile || busy) && styles.btnDisabled]}
          onPress={onStartProcess}
          disabled={!selectedFile || busy}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Распознать запись</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  testDataBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  disabledText: {
    color: '#94A3B8',
  },
  fileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileEmoji: {
    fontSize: 22,
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  fileSub: {
    fontSize: 12,
    color: '#64748B',
  },
  warningText: {
    fontSize: 12,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: '#F1F5F9',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  btnPrimary: {
    backgroundColor: '#2563EB',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
