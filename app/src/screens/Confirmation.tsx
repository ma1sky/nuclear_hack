import { useState } from "react";
import { Modal, View } from "react-native";
import { Action, Copy, s, Surface } from "./ProductUI";
import { colors } from "../theme/tokens";
type Request = {
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};
export function useConfirmation() {
  const [request, setRequest] = useState<Request>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (!busy) setRequest(undefined);
  };
  async function accept() {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.onConfirm();
      setRequest(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    confirm: (value: Request) => {
      setError("");
      setRequest(value);
    },
    modal: request ? (
      <Modal visible transparent animationType="fade" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            backgroundColor: "#00000047",
            padding: 16,
          }}
        >
          <Surface accessibilityViewIsModal>
            <Copy kind="title">{request.title}</Copy>
            <Copy>{request.description}</Copy>
            {!!error && (
              <Copy style={{ color: colors.destructive }}>{error}</Copy>
            )}
            <View style={s.row}>
              <Action
                label={request.cancelLabel || "Отмена"}
                variant="outline"
                disabled={busy}
                style={{ flex: 1 }}
                onPress={close}
              />
              <Action
                label={request.confirmLabel || "Удалить"}
                variant={
                  request.destructive === false ? "default" : "destructive"
                }
                disabled={busy}
                style={{ flex: 1 }}
                onPress={() => void accept()}
              />
            </View>
          </Surface>
        </View>
      </Modal>
    ) : null,
  };
}
