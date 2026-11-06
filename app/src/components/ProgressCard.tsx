import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ProcessingProgress, ProcessingStage } from '../types/transcript';

interface ProgressCardProps {
  progress: ProcessingProgress;
  onCancel: () => void;
}

const STAGES: { key: ProcessingStage; label: string }[] = [
  { key: 'preparing', label: '1. Аудио' },
  { key: 'diarizing', label: '2. Диаризация' },
  { key: 'transcribing', label: '3. ASR' },
  { key: 'summarizing', label: '4. Qwen LLM' },
];

export const ProgressCard: React.FC<ProgressCardProps> = ({ progress, onCancel }) => {
  const getStageStatus = (stageKey: ProcessingStage) => {
    const stageOrder: ProcessingStage[] = ['preparing', 'diarizing', 'transcribing', 'summarizing', 'saving', 'done'];
    const currentIndex = stageOrder.indexOf(progress.stage);
    const targetIndex = stageOrder.indexOf(stageKey);

    if (progress.stage === 'done') return 'completed';
    if (currentIndex > targetIndex) return 'completed';
    if (currentIndex === targetIndex) return 'active';
    return 'pending';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.title}>Локальная обработка на устройстве</Text>
        </View>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.statusMessage}>{progress.message || 'Выполняются вычисления...'}</Text>

      {/* Stage indicators */}
      <View style={styles.stagesRow}>
        {STAGES.map((s) => {
          const status = getStageStatus(s.key);
          return (
            <View key={s.key} style={styles.stageItem}>
              <View
                style={[
                  styles.stageDot,
                  status === 'completed' && styles.dotCompleted,
                  status === 'active' && styles.dotActive,
                ]}
              >
                {status === 'completed' ? (
                  <Text style={styles.checkText}>✓</Text>
                ) : (
                  <View style={status === 'active' ? styles.innerDotActive : undefined} />
                )}
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  status === 'completed' && styles.labelCompleted,
                  status === 'active' && styles.labelActive,
                ]}
              >
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${progress.percentage !== undefined ? progress.percentage : 60}%` },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  cancelBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  statusMessage: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  stagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stageItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCompleted: {
    backgroundColor: '#10B981',
  },
  dotActive: {
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  innerDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stageLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  labelCompleted: {
    color: '#059669',
  },
  labelActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
});
