import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ExportBarProps {
  onExportJson: () => void;
  onExportTxt: () => void;
  onPreviewJson: () => void;
}

export const ExportBar: React.FC<ExportBarProps> = ({ onExportJson, onExportTxt, onPreviewJson }) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.btn, styles.btnJson]} onPress={onExportJson} activeOpacity={0.8}>
        <Text style={styles.btnIcon}>📦</Text>
        <Text style={styles.btnText}>Экспорт JSON</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnTxt]} onPress={onExportTxt} activeOpacity={0.8}>
        <Text style={styles.btnIcon}>📄</Text>
        <Text style={styles.btnText}>Экспорт TXT</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnPreview]} onPress={onPreviewJson} activeOpacity={0.8}>
        <Text style={styles.btnIcon}>🔍</Text>
        <Text style={styles.btnText}>Код</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  btnJson: {
    backgroundColor: '#1E40AF',
    flex: 1.2,
  },
  btnTxt: {
    backgroundColor: '#0F766E',
    flex: 1.2,
  },
  btnPreview: {
    backgroundColor: '#334155',
    flex: 0.8,
  },
  btnIcon: {
    fontSize: 14,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
