import { measuredSegmentProgress } from '../theme/progress';
import { ActivityIndicator, View } from 'react-native';
import { Card, CardContent } from './ui/card';
import { Text } from './ui/text';
import { ActionButton } from './ui/action-button';
import type { ProcessingProgress } from '../types/transcript';
import { colors } from '../theme/tokens';

const stages = [
  { key: 'preparing', label: 'Подготовка записи' },
  { key: 'diarizing', label: 'Определение участников' },
  { key: 'transcribing', label: 'Распознавание речи' },
  { key: 'summarizing', label: 'Создание резюме' },
  { key: 'saving', label: 'Сохранение' },
] as const;

export function ProgressCard({ progress, onCancel }: { progress: ProcessingProgress; onCancel: () => void }) {
  const index = stages.findIndex(item => item.key === progress.stage);
  const current = stages[index];
  const percentage = measuredSegmentProgress(progress);
  const measured = percentage !== undefined;
  return (
    <Card className="mx-4 mt-4 gap-0 py-4 shadow-none">
      <CardContent className="gap-4 px-4" accessibilityLiveRegion="polite">
        <View className="flex-row items-start gap-3">
          <ActivityIndicator color={colors.foreground} accessibilityLabel="Выполняется обработка" />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-semibold leading-6">{current?.label ?? 'Обработка записи'}</Text>
            <Text className="text-muted-foreground text-sm leading-5">{measured ? `Распознано реплик: ${progress.completed} из ${progress.total}` : 'Это может занять несколько минут. Запись остаётся на устройстве.'}</Text>
          </View>
        </View>
        {percentage !== undefined && (
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percentage }} className="bg-muted h-2 overflow-hidden rounded-full">
            <View className="bg-primary h-full" style={{ width: `${percentage}%` }} />
          </View>
        )}
        <View className="gap-2">
          {stages.map((stage, position) => <Text key={stage.key} className={position === index ? 'text-foreground text-sm font-medium leading-5' : 'text-muted-foreground text-sm leading-5'}>{position < index ? '✓ ' : `${position + 1}. `}{stage.label}</Text>)}
        </View>
        <ActionButton variant="outline" label="Отменить обработку" onPress={onCancel} />
      </CardContent>
    </Card>
  );
}
