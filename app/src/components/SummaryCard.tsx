import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SummaryCardProps {
  summary: string;
  isGenerating?: boolean;
  onRegenerate: () => void;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ summary, isGenerating, onRegenerate }) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>🤖</Text>
          <Text style={styles.title}>Резюме встречи (Локальная LLM)</Text>
        </View>
        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>Qwen2.5-0.5B</Text>
        </View>
      </View>

      <Text style={styles.summaryText}>{summary}</Text>

      <View style={styles.footer}>
        <Text style={styles.hintText}>
          🛡️ Хранится отдельно и не изменяет сдаваемый JSON
        </Text>
        <TouchableOpacity
          style={styles.regenBtn}
          onPress={onRegenerate}
          disabled={isGenerating}
          activeOpacity={0.7}
        >
          <Text style={[styles.regenText, isGenerating && styles.disabledText]}>
            {isGenerating ? 'Генерация...' : 'Обновить резюме'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  modelBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  modelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#334155',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  hintText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },
  regenBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  regenText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  disabledText: {
    color: '#94A3B8',
  },
});
