import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TranscriptExport } from '../types/transcript';
import { sanitizeTranscriptExport } from '../services/exportService';

interface JsonModalProps {
  visible: boolean;
  data: TranscriptExport | null;
  onClose: () => void;
  onExport: () => void;
}

export const JsonModal: React.FC<JsonModalProps> = ({ visible, data, onClose, onExport }) => {
  if (!data) return null;

  const sanitized = sanitizeTranscriptExport(data);
  const jsonString = JSON.stringify(sanitized, null, 2);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Формат JSON-вывода</Text>
              <Text style={styles.subtitle}>Спецификация страницы 15 официального ТЗ</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.codeContainer} showsVerticalScrollIndicator>
            <Text style={styles.codeText}>{jsonString}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.exportBtn} onPress={onExport} activeOpacity={0.7}>
              <Text style={styles.exportText}>Поделиться JSON файлом</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    maxHeight: '85%',
    display: 'flex',
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  codeContainer: {
    padding: 16,
    backgroundColor: '#090D16',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#38BDF8',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  exportBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
