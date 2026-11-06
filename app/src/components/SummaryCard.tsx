import { View } from 'react-native';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Text } from './ui/text';
import { Separator } from './ui/separator';
import { ActionButton } from './ui/action-button';

interface SummaryCardProps { summary: string; isGenerating?: boolean; onRegenerate: () => void }
export function SummaryCard({ summary, isGenerating = false, onRegenerate }: SummaryCardProps) {
  return (
    <Card className="mx-4 mt-4 gap-4 py-4 shadow-none">
      <CardHeader className="px-4"><CardTitle className="text-xl leading-7">Краткое резюме</CardTitle></CardHeader>
      <CardContent className="gap-4 px-4">
        <Text className="text-base leading-6" selectable>{summary}</Text>
        <Separator />
        <View className="gap-3">
          <Text className="text-muted-foreground text-sm leading-5">Создано на устройстве. Проверьте важные факты по расшифровке. Исходные реплики не изменены.</Text>
          <ActionButton variant="outline" label={isGenerating ? 'Создаём резюме' : 'Обновить резюме'} loading={isGenerating} onPress={onRegenerate} />
        </View>
      </CardContent>
    </Card>
  );
}
