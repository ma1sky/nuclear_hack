import { KeyboardAvoidingView, Modal, Platform, View } from "react-native";
import type { ReactNode } from "react";
import { Action, Copy } from "./ProductUI";
import { colors } from "../theme/tokens";
export function DesignDialog({
  visible,
  title,
  onClose,
  children,
  bottom = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  bottom?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={bottom ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          justifyContent: bottom ? "flex-end" : "center",
          padding: bottom ? 0 : 16,
          backgroundColor: "#00000066",
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: bottom ? 0 : 12,
            borderTopLeftRadius: bottom ? 16 : 12,
            borderTopRightRadius: bottom ? 16 : 12,
            maxHeight: "85%",
            padding: 12,
            gap: 8,
          }}
          accessibilityViewIsModal
        >
          {bottom && (
            <View
              style={{
                height: 4,
                width: 40,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: "center",
              }}
            />
          )}
          <Copy kind="title">{title}</Copy>
          {children}
          {bottom && (
            <Action label="Закрыть" variant="ghost" onPress={onClose} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
