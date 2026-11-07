import { ScrollView } from "react-native";
import type { TranscriptExport } from "../types/transcript";
import { sanitizeTranscriptExport } from "../services/exportService";
import { Action, Copy } from "../screens/ProductUI";
import { DesignDialog } from "../screens/DesignDialog";

interface JsonModalProps {
  visible: boolean; data: TranscriptExport | null; onClose: () => void; onExport: () => void;
}
export function JsonModal({ visible, data, onClose }: JsonModalProps) {
  if (!data) return null;
  return <DesignDialog visible={visible} title="Данные расшифровки" onClose={onClose}>
    <Copy kind="caption">Структура JSON для экспорта</Copy>
    <ScrollView style={{ height: 180, flexShrink: 1 }}>
      <Copy selectable style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20 }}>
        {JSON.stringify(sanitizeTranscriptExport(data), null, 2)}
      </Copy>
    </ScrollView>
    <Action label="Назад к экспорту" variant="outline" onPress={onClose} />
  </DesignDialog>;
}
