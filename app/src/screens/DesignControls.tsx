import { ActivityIndicator, View } from "react-native";
import { Button } from "../components/ui/button";
import { Copy, Icon, s } from "./ProductUI";
import { colors } from "../theme/tokens";

export function SegmentedTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (value: T) => void; options: { value: T; label: string }[];
}) {
  return <View accessibilityRole="tablist" style={{
    marginHorizontal: 16, marginTop: 16, marginBottom: 24,
    padding: 4, borderRadius: 12, backgroundColor: colors.muted,
    flexDirection: "row", gap: 4,
  }}>{options.map(option => <Button key={option.value} variant="ghost" size="icon"
    accessibilityRole="tab" accessibilityState={{ selected: option.value === value }}
    onPress={() => onChange(option.value)} style={{
      flex: 1, minWidth: 0, minHeight: 40, height: 40, borderRadius: 8,
      borderWidth: 1, borderColor: option.value === value ? colors.border : "transparent",
      backgroundColor: option.value === value ? colors.background : "transparent",
    }}><Copy kind="label">{option.label}</Copy></Button>)}</View>;
}
export function StageTimeline({ labels, current, busy, completed }: {
  labels: string[]; current: number; busy: boolean; completed: boolean;
}) {
  return <View style={{ gap: 8 }}>{labels.map((label, index) =>
    <View key={label} style={[s.row, { minHeight: 20 }]}>
      <View style={{ width: 20, height: 20, justifyContent: "center", alignItems: "center" }}>
        {completed || index < current ? <Icon name="check" /> :
          index === current && busy ? <ActivityIndicator size="small" color={colors.foreground} /> :
          <Copy kind="label" style={{ color: colors.mutedForeground }}>{index + 1}</Copy>}
      </View>
      <Copy kind="label" style={{ color: index === current ? colors.foreground : colors.mutedForeground }}>{label}</Copy>
    </View>)}</View>;
}
