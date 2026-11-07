import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Input } from "../components/ui/input";
import { Action, Copy, s } from "./ProductUI";
import { colors } from "../theme/tokens";

export function SpeakerSheet({
  initialName,
  participant,
  onClose,
  onSave,
}: {
  initialName: string;
  participant: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#00000033",
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            gap: 12,
            maxHeight: "85%",
          }}
          accessibilityViewIsModal
        >
          <View
            style={{
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.border,
              alignSelf: "center",
            }}
          />
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Copy kind="title">Имя спикера</Copy>
            <Action
              label="Отмена"
              variant="ghost"
              disabled={saving}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
          >
            <Copy kind="caption">{participant}</Copy>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <Input
                style={{ flexGrow: 1, flexBasis: 180 }}
                value={name}
                onChangeText={setName}
                accessibilityLabel="Имя участника"
                autoFocus
                editable={!saving}
                onSubmitEditing={() => void save()}
                returnKeyType="done"
              />
              <Action
                label="Сохранить"
                icon="saveWhite"
                disabled={saving || !name.trim()}
                onPress={() => void save()}
              />
            </View>
            <Copy kind="label">
              Имя изменится во всех репликах этого спикера.
            </Copy>
            {!!error && (
              <Copy style={{ color: colors.destructive }}>{error}</Copy>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
