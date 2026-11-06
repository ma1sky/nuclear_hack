import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TranscriptUtterance } from '../types/transcript';
import { formatTimeMs, getSpeakerColor } from '../utils/formatters';

interface TranscriptItemProps {
  item: TranscriptUtterance;
  displayName: string;
  onPressSpeaker: (speakerId: string) => void;
}

export const TranscriptItem: React.FC<TranscriptItemProps> = ({ item, displayName, onPressSpeaker }) => {
  const color = getSpeakerColor(item.speaker_id);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={[styles.speakerBadge, { backgroundColor: color.bg, borderColor: color.border }]}
          onPress={() => onPressSpeaker(item.speaker_id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.speakerText, { color: color.text }]}>{displayName}</Text>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>

        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>
            {formatTimeMs(item.start_ms)} – {formatTimeMs(item.end_ms)}
          </Text>
          <Text style={styles.rawMsText}>({item.start_ms} – {item.end_ms} мс)</Text>
        </View>
      </View>

      <Text style={styles.utteranceText}>{item.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speakerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  speakerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editIcon: {
    fontSize: 10,
    opacity: 0.6,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    fontVariant: ['tabular-nums'],
  },
  rawMsText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  utteranceText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#1E293B',
  },
});
