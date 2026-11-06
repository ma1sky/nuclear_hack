import { View } from 'react-native';
import { Text } from './ui/text';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import type { TranscriptUtterance } from '../types/transcript';
import { formatTimeMs, getSpeakerColor } from '../utils/formatters';

interface TranscriptItemProps { item: TranscriptUtterance; displayName: string; onPressSpeaker: (speakerId: string) => void }
export function TranscriptItem({ item, displayName, onPressSpeaker }: TranscriptItemProps) {
  const color = getSpeakerColor(item.speaker_id);
  return (
    <Card className="mb-3 gap-0 py-4 shadow-none">
      <CardContent className="gap-3 px-4">
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Button variant="ghost" className="max-w-full px-3" style={{ backgroundColor: color.bg }}
            onPress={() => onPressSpeaker(item.speaker_id)} accessibilityLabel={`Переименовать участника: ${displayName}`}>
            <Text className="shrink text-sm font-semibold leading-5" style={{ color: color.text }}>{displayName}</Text>
          </Button>
          <Text className="text-muted-foreground text-xs leading-5" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`С ${formatTimeMs(item.start_ms)} до ${formatTimeMs(item.end_ms)}`}>
            {formatTimeMs(item.start_ms)} – {formatTimeMs(item.end_ms)}
          </Text>
        </View>
        <Text className="text-base leading-7" selectable>{item.text}</Text>
      </CardContent>
    </Card>
  );
}
