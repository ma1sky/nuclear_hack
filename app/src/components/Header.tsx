import { View } from 'react-native';
import { Badge } from './ui/badge';
import { Text } from './ui/text';
import { ActionButton } from './ui/action-button';

interface HeaderProps { isNative: boolean; historyCount: number; onOpenHistory: () => void }

export function Header({ isNative, historyCount, onOpenHistory }: HeaderProps) {
  return (
    <View className="border-border bg-card gap-3 border-b px-4 py-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-muted-foreground text-xs font-semibold tracking-widest">HEX.TEAM</Text>
        <ActionButton label={historyCount ? `История (${historyCount})` : 'История'} variant="ghost" onPress={onOpenHistory} accessibilityLabel="Открыть историю расшифровок" />
      </View>
      <Text role="heading" className="text-2xl font-semibold leading-8 tracking-tight">Нейро-стенографист</Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge variant="outline"><Text>На устройстве</Text></Badge>
        <Text className="text-muted-foreground shrink text-sm leading-5">
          {isNative ? 'Модели подготовлены' : 'Модели ещё не готовы'}
        </Text>
      </View>
    </View>
  );
}
