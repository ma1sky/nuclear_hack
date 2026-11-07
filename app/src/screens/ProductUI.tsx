import React from "react";
import {
  Text,
  View,
  ScrollView,
  StyleSheet,
  type TextProps,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Button, type ButtonProps } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { colors } from "../theme/tokens";
import { icons, type IconName } from "./icons";

export function Copy({
  kind = "body",
  style,
  ...props
}: TextProps & { kind?: "body" | "caption" | "label" | "title" | "large" }) {
  return <Text {...props} style={[s[kind], style]} />;
}
export function Icon({ name, color }: { name: IconName; color?: string }) {
  const icon = icons[name];
  return (
    <Image
      source={icon.source}
      tintColor={color}
      style={{ width: icon.width, height: icon.height }}
      contentFit="contain"
      accessibilityElementsHidden
    />
  );
}
export function Action({
  label,
  icon,
  danger = false,
  ...props
}: ButtonProps & { label: string; icon?: IconName; danger?: boolean }) {
  const light =
    !props.variant ||
    props.variant === "default" ||
    props.variant === "destructive";
  return (
    <Button
      {...props}
      style={(state) => [
        {
          minHeight: 48,
          borderRadius: 8,
          padding: 12,
          gap: 8,
          boxShadow: "none",
          elevation: 0,
        },
        typeof props.style === "function" ? props.style(state) : props.style,
      ]}
    >
      {icon && <Icon name={icon} color={danger ? colors.destructive : light ? colors.primaryForeground : colors.foreground} />}
      <Copy
        kind="label"
        style={{
          color: danger ? colors.destructive : light ? colors.primaryForeground : colors.foreground,
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {label}
      </Copy>
    </Button>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      accessibilityLabel={label}
      disabled={disabled}
      variant={primary ? "default" : "ghost"}
      size="icon"
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 8,
        boxShadow: "none",
        elevation: 0,
      }}
    >
      <Icon name={name} color={primary ? colors.primaryForeground : colors.foreground} />
    </Button>
  );
}
export function Surface({ style, ...props }: ViewProps) {
  return (
    <Card
      {...props}
      className="gap-2 p-3 shadow-none"
      style={[{ borderRadius: 12 }, style]}
    />
  );
}
export function Screen({
  title,
  subtitle,
  home = false,
  children,
  footer,
  scroll = true,
  onBack,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  home?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  onBack?: () => void;
  headerAction?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={s.page}>
      <View style={s.header}>
        {!home && (
          <IconButton
            name="back"
            label="Назад"
            onPress={
              onBack ??
              (() => (router.canGoBack() ? router.back() : router.replace("/")))
            }
          />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Copy kind={home ? "large" : "title"} numberOfLines={2}>
            {title}
          </Copy>
          {subtitle && <Copy kind="caption">{subtitle}</Copy>}
        </View>
        {home && (headerAction !== undefined ? headerAction : (
          <IconButton
            name="history"
            label="История"
            onPress={() => router.push("/history")}
          />
        ))}
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {footer}
    </SafeAreaView>
  );
}
export function FileRow({ name, detail }: { name: string; detail?: string }) {
  return (
    <View style={s.row}>
      <View style={s.fileIcon}>
        <Icon name="file" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Copy kind="label" numberOfLines={2}>
          {name}
        </Copy>
        {detail && <Copy kind="caption">{detail}</Copy>}
      </View>
    </View>
  );
}
export function Privacy({
  message = "Обработка на устройстве, без отправки в сеть.",
}: {
  message?: string;
}) {
  return (
    <View style={s.row}>
      <Icon name="privacy" />
      <Copy kind="caption" style={{ flex: 1 }}>
        {message}
      </Copy>
    </View>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Surface>
      <Copy kind="title">{title}</Copy>
      <Copy style={{ color: colors.mutedForeground }}>{detail}</Copy>
    </Surface>
  );
}
export function seconds(value: number) {
  const v = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toString().padStart(2, "0")}`;
}
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 64,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  content: { padding: 16, gap: 24, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  fileIcon: {
    width: 48,
    height: 48,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.muted,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 26,
    color: colors.foreground,
  },
  caption: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 16,
    color: colors.mutedForeground,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 20,
    color: colors.foreground,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    lineHeight: 28,
    color: colors.foreground,
  },
  large: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    lineHeight: 32,
    color: colors.foreground,
  },
});
