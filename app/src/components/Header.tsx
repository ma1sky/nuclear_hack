import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface HeaderProps {
  isNative: boolean;
  historyCount: number;
  onOpenHistory: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isNative, historyCount, onOpenHistory }) => {
  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>HEX.TEAM</Text>
          <View style={[styles.badge, isNative ? styles.badgeNative : styles.badgeDev]}>
            <Text style={[isNative ? styles.badgeNativeText : styles.badgeDevText]}>
              {isNative ? 'On-Device Native' : 'Модуль недоступен'}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>Нейро-стенографист</Text>
        <Text style={styles.subtitle}>Автономная транскрибация и диаризация на Android</Text>
      </View>

      <TouchableOpacity style={styles.historyBtn} onPress={onOpenHistory} activeOpacity={0.7}>
        <Text style={styles.historyIcon}>📋</Text>
        <Text style={styles.historyText}>История</Text>
        {historyCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{historyCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  brand: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#1D4ED8',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeNative: {
    backgroundColor: '#DCFCE7',
  },
  badgeDev: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeNativeText: {
    color: '#15803D',
  },
  badgeDevText: {
    color: '#B45309',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  historyIcon: {
    fontSize: 14,
  },
  historyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  countBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
