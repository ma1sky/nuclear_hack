import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useWorkspace } from "../state/WorkspaceProvider";
import {
  Action,
  Copy,
  Empty,
  FileRow,
  Icon,
  IconButton,
  Privacy,
  Screen,
  seconds,
  s,
  Surface,
} from "./ProductUI";
import { SegmentedTabs, StageTimeline } from "./DesignControls";
import { Player } from "./Player";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { JsonModal } from "../components/JsonModal";
import { DesignDialog } from "./DesignDialog";
import { SpeakerSheet } from "./SpeakerSheet";
import { useConfirmation } from "./Confirmation";
import { colors } from "../theme/tokens";
import { getSpeakerColor } from "../utils/formatters";
import { measuredSegmentProgress } from "../theme/progress";
import {
  listAudio,
  removeAudio,
  saveAudio,
  type AudioRecording,
} from "../services/libraryService";
import type { SavedTranscript } from "../types/transcript";

function usePick() {
  const w = useWorkspace();
  return async () => {
    if (await w.chooseAudioFile()) router.push("/selected");
  };
}
function ErrorNote() {
  const w = useWorkspace();
  return w.error ? (
    <Surface style={{ borderColor: colors.destructive }}>
      <Copy style={{ color: colors.destructive }}>{w.error}</Copy>
      <Action
        label="Закрыть сообщение об ошибке"
        variant="ghost"
        onPress={() => w.setError(null)}
      />
    </Surface>
  ) : null;
}
function SelectedFile() {
  const w = useWorkspace();
  const file = w.selectedFile;
  const detail = [
    file?.name.split(".").pop()?.toUpperCase(),
    file?.size ? `${(file.size / 1048576).toFixed(1)} МБ` : null,
    w.durationMs ? seconds(w.durationMs / 1000) : null,
  ]
    .filter(Boolean)
    .join(" / ");
  return <FileRow name={file?.name || "Запись"} detail={detail} />;
}
async function navigatePick(w: ReturnType<typeof useWorkspace>) {
  await w.chooseAudioFile();
}

function participants(count: number) {
  const tail = count % 100;
  const word = tail >= 11 && tail <= 14 ? "участников" : count % 10 === 1 ? "участник" : count % 10 >= 2 && count % 10 <= 4 ? "участника" : "участников";
  return `${count} ${word}`;
}
function transcriptDetail(record: SavedTranscript) {
  const format = record.fileName.split(".").pop()?.toUpperCase() || "АУДИО";
  const count = new Set(record.exportData.transcript.map(turn => turn.speaker_id)).size;
  return [format, record.durationMs ? seconds(record.durationMs / 1000) : undefined, participants(count)].filter(Boolean).join(" / ");
}
function AudioRenameDialog({ record, visible, name, onNameChange, onClose }: {
  record: AudioRecording; visible: boolean; name: string; onNameChange: (name: string) => void; onClose: () => void;
}) {
  const w = useWorkspace();
  return <DesignDialog visible={visible} title="Переименовать запись" onClose={onClose}>
    <Copy kind="label">Название записи</Copy><Input value={name} onChangeText={onNameChange} accessibilityLabel="Название записи" />
    <View style={s.row}>
      <Action label="Отмена" variant="outline" style={{ flex: 1 }} onPress={onClose} />
      <Action label="Сохранить" style={{ flex: 1 }} disabled={!name.trim()} onPress={() => {
        void saveAudio({ ...record, title: name.trim() }).then(async () => { w.setRecordings(await listAudio()); onClose(); })
          .catch(error => Alert.alert("Ошибка сохранения", String(error)));
      }} />
    </View><Copy kind="caption">Аудио и длительность записи сохранятся.</Copy>
  </DesignDialog>;
}
function Recent({ record }: { record: SavedTranscript }) {
  const w = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const open = () => { w.handleSelectHistory(record); router.push("/result"); };
  return <>
    <Surface><View style={s.row}>
      <Button variant="ghost" size="icon" accessibilityLabel={`Открыть расшифровку: ${record.title}`} onPress={open}
        style={{ flex: 1, padding: 0 }} contentStyle={{ flex: 1, justifyContent: "flex-start" }}>
        <FileRow name={record.title} detail={transcriptDetail(record)} />
      </Button>
      <IconButton name="more" label={`Действия с расшифровкой: ${record.title}`} onPress={() => setMenu(true)} />
    </View></Surface>
    <DesignDialog visible={menu} title="Действия с расшифровкой" onClose={() => setMenu(false)}>
      <Copy kind="label">{record.title}</Copy>
      <Action label="Открыть расшифровку" icon="document" onPress={() => { setMenu(false); open(); }} />
      <Action label="Экспорт" icon="export" variant="outline" onPress={() => {
        w.handleSelectHistory(record); setMenu(false); setExportOpen(true);
      }} />
      <Action label="Удалить расшифровку" icon="trash" danger variant="ghost" onPress={() => {
        setMenu(false); Alert.alert("Удалить расшифровку?", "Исходное аудио останется на устройстве.", [
          { text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => void w.handleDeleteHistory(record.id) },
        ]);
      }} />
      <Action label="Закрыть" variant="outline" onPress={() => setMenu(false)} />
    </DesignDialog>
    <ExportDialog visible={exportOpen} onClose={() => setExportOpen(false)} />
  </>;
}
function RecordingCard({ record }: { record: AudioRecording }) {
  const w = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(record.title);
  const { confirm, modal } = useConfirmation();
  const open = (play = false) => router.push({ pathname: "/audio", params: { id: record.id, ...(play ? { play: "1" } : {}) } });
  const transcribe = () => {
    setMenu(false); w.selectAudio({ uri: record.uri, name: record.title + "." + (record.uri.split(".").pop() || "m4a"), size: record.size,
      durationMs: record.durationMs, waveform: record.waveform }); router.push("/selected");
  };
  const detail = `${record.uri.split(".").pop()?.toUpperCase() || "M4A"} / ${seconds(record.durationMs / 1000)} / ${new Date(record.createdAt).toLocaleDateString("ru-RU")}`;
  return <>
    <Surface><View style={s.row}>
      <IconButton name="playWhite" label={`Воспроизвести аудио: ${record.title}`} onPress={() => open(true)} />
      <Button variant="ghost" size="icon" accessibilityLabel={`Открыть аудио: ${record.title}`} onPress={() => open()}
        style={{ flex: 1, padding: 0 }} contentStyle={{ flex: 1, alignItems: "flex-start", justifyContent: "center", flexDirection: "column", gap: 4 }}>
        <Copy kind="label" numberOfLines={1}>{record.title}</Copy><Copy kind="caption" numberOfLines={1}>{detail}</Copy>
      </Button>
      <IconButton name="more" label={`Действия с записью: ${record.title}`} onPress={() => setMenu(true)} />
    </View></Surface>
    <DesignDialog visible={menu} title="Действия с записью" onClose={() => setMenu(false)}>
      <Copy kind="label">{record.title}</Copy>
      <Action label="Прослушать" variant="outline" icon="playWhite" onPress={() => { setMenu(false); open(true); }} />
      <Action label="Расшифровать" icon="sparkles" disabled={w.busy} onPress={transcribe} />
      <Action label="Переименовать" icon="pencil" variant="ghost" onPress={() => { setMenu(false); setName(record.title); setRename(true); }} />
      <Action label="Удалить запись" icon="trash" variant="ghost" onPress={() => {
        setMenu(false); confirm({ title: "Удалить аудиозапись?", description: "Файл будет удалён с устройства. Восстановить запись не получится.",
          onConfirm: async () => { await removeAudio(record); w.setRecordings(await listAudio()); } });
      }} />
      <Action label="Закрыть" icon="close" variant="outline" onPress={() => setMenu(false)} />
    </DesignDialog>
    <AudioRenameDialog record={record} visible={rename} name={name} onNameChange={setName} onClose={() => setRename(false)} />{modal}
  </>;
}
function QuickAdd({ first = false }: { first?: boolean }) {
  const w = useWorkspace(); const pick = usePick();
  return <Surface>
    {first && <View style={{ width: 56, height: 56, padding: 16, backgroundColor: colors.muted, borderRadius: 8 }}><Icon name="headphones" /></View>}
    <Copy kind={first ? "large" : "title"}>{first ? "Из аудио — в текст" : "Добавить аудио"}</Copy>
    {first && <Copy style={{ color: colors.mutedForeground }}>Расшифруйте подкаст или разговор с таймкодами и разделением участников.</Copy>}
    <View style={first ? { gap: 8 } : [s.row, { alignItems: "stretch" }]}>
      <Action label={first ? "Выбрать аудиозапись" : "Выбрать файл"} icon="upload" onPress={pick} disabled={w.busy} style={first ? undefined : { flex: 1 }} />
      <Action label={first ? "Записать аудио" : "Записать"} icon="microphone" variant="outline" onPress={() => router.push("/recorder")} disabled={w.busy} style={first ? undefined : { flex: 1 }} />
    </View>{first && <Copy kind="caption">WAV PCM16, M4A и AAC</Copy>}
  </Surface>;
}
export function LibraryScreen() {
  const w = useWorkspace(); const first = !w.history.length && !w.recordings.length;
  return <Screen title="Нейро-стенографист" subtitle="Подкасты, интервью и встречи" home headerAction={first ? undefined : null}>
    <ErrorNote /><QuickAdd first={first} /><Privacy />
    {!w.modelsReady && <Copy kind="caption">Подготовка встроенных моделей…</Copy>}
    {!!w.recordings.length && <View style={{ gap: 12 }}>
      <View style={[s.row, { justifyContent: "space-between", minHeight: 48 }]}><Copy kind="title">Записи</Copy>
        <Action variant="ghost" label="Все" accessibilityLabel="Все записи" onPress={() => router.push("/recordings")} /></View>
      {w.recordings.slice(0, 3).map((record) => <React.Fragment key={record.id}><RecordingCard record={record} /></React.Fragment>)}
    </View>}
    <View style={{ gap: 12 }}>
      {!first && <View style={[s.row, { justifyContent: "space-between", minHeight: 48 }]}><Copy kind="title">Расшифровки</Copy>
        <Action variant="ghost" label="Все" accessibilityLabel="Все расшифровки" onPress={() => router.push("/history")} /></View>}
      {w.history.slice(0, 2).map((record) => <React.Fragment key={record.id}><Recent record={record} /></React.Fragment>)}
      {!w.history.length && <View style={{ gap: 12 }}><Copy kind="title">Пока нет расшифровок</Copy>
        <Copy style={{ color: colors.mutedForeground }}>Выберите первую запись — результат сохранится в истории на этом устройстве.</Copy></View>}
    </View>
  </Screen>;
}
export function AllRecordingsScreen() {
  const w = useWorkspace();
  return <Screen title="Все записи"><QuickAdd /><Copy kind="label">Сохранённое аудио на устройстве</Copy>
    <View style={{ gap: 12 }}>{w.recordings.map(record => <RecordingCard key={record.id} record={record} />)}</View>
    {!w.recordings.length && <Empty title="Пока нет записей" detail="Запишите разговор с помощью диктофона." />}
  </Screen>;
}
export function SelectedScreen() {
  const w = useWorkspace();
  return (
    <Screen title="Новая расшифровка">
      <ErrorNote />
      <View style={{ gap: 12 }}>
        <Copy kind="large">Запись выбрана</Copy>
        <Surface>
          <SelectedFile />
          <View style={[s.row, { flexWrap: "wrap" }]}>
            <Action
              label="Расшифровать"
              icon="sparkles"
              disabled={!w.selectedFile || w.busy || !w.modelsReady}
              style={{ flexGrow: 1 }}
              onPress={() => {
                router.push("/processing");
                void w.startTranscription();
              }}
            />
            <Action
              label="Заменить"
              variant="outline"
              icon="replace"
              onPress={() => navigatePick(w)}
              disabled={w.busy}
            />
          </View>
          <Copy kind="caption">
            Длительность обработки зависит от записи и мощности телефона.
          </Copy>
        </Surface>
      </View>
      <View style={{ gap: 12 }}>
        <Copy kind="title">Что будет в результате</Copy>
        {[
          ["Расшифровка", "Реплики с именами участников и временем."],
          ["Краткое резюме", "Основные темы и выводы разговора."],
          ["Экспорт", "Сохраните текст в TXT или данные в JSON."],
        ].map(([title, detail], i) => (
          <View style={s.row} key={title}>
            <View
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: colors.muted,
              }}
            >
              <Copy kind="label">0{i + 1}</Copy>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Copy kind="label">{title}</Copy>
              <Copy kind="caption">{detail}</Copy>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
const stages = [
  "preparing",
  "diarizing",
  "transcribing",
  "summarizing",
  "saving",
];
const stageLabels = [
  "Подготовка записи",
  "Определение участников",
  "Распознавание речи",
  "Создание резюме",
  "Сохранение",
];
export function ProcessingScreen() {
  const w = useWorkspace();
  const percent = measuredSegmentProgress(w.progress);
  useEffect(() => {
    if (!w.busy && w.progress.stage === "done") router.replace("/result");
  }, [w.busy, w.progress.stage]);
  const index = stages.indexOf(w.progress.stage);
  return (
    <Screen
      title="Обработка записи"
      onBack={() => {
        if (w.busy)
          Alert.alert("Обработка продолжается", "Отменить текущую задачу?", [
            { text: "Продолжить" },
            {
              text: "Отменить обработку",
              onPress: () => void w.cancelProcessing(),
            },
          ]);
        else router.back();
      }}
    >
      <Surface>
        <SelectedFile />
        <Copy kind="large">
          {percent !== undefined
            ? `${w.progress.completed} из ${w.progress.total} реплик`
            : stageLabels[index] || w.progress.message}
        </Copy>
        <Copy kind="caption">
          {percent !== undefined
            ? `Распознано ${percent}% реплик на текущем этапе`
            : "Длительность этого этапа пока неизвестна"}
        </Copy>
        {percent !== undefined ? (
          <View
            style={{
              height: 8,
              backgroundColor: colors.muted,
              borderRadius: 4,
            }}
          >
            <View
              style={{
                height: 8,
                width: `${percent}%`,
                backgroundColor: colors.ring,
                borderRadius: 4,
              }}
            />
          </View>
        ) : (
          w.busy && <ActivityIndicator color={colors.primary} />
        )}
        <StageTimeline labels={stageLabels} current={index} busy={w.busy}
          completed={w.progress.stage === "done"} />
        {w.busy && (
          <Action
            variant="outline"
            label="Отменить обработку"
            icon="close"
            onPress={() => void w.cancelProcessing()}
          />
        )}
        {!w.busy && (
          <Action
            label={
              w.currentTranscript ? "Открыть расшифровку" : "Вернуться к записи"
            }
            onPress={() =>
              router.replace(w.currentTranscript ? "/result" : "/selected")
            }
          />
        )}
      </Surface>
      <ErrorNote />
      <Surface>
        <Copy kind="label">Запись остаётся у вас</Copy>
        <Copy style={{ color: colors.mutedForeground }}>
          Это может занять несколько минут. Отмена завершится после текущего
          блока.
        </Copy>
      </Surface>
    </Screen>
  );
}
function SpeakerChip({ id, index }: { id: string; index: number }) {
  const w = useWorkspace(); const tone = getSpeakerColor(id);
  return <Button variant="ghost" size="icon" disabled={w.busy} onPress={() => w.openRenameSpeaker(id)}
    accessibilityLabel={`Переименовать участника: ${w.speakerNames[id] || id}`}
    style={{ paddingHorizontal: 0, minHeight: 48, flexShrink: 1 }}>
    <View style={[s.row, { backgroundColor: tone.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexShrink: 1 }]}>
      <Copy kind="label" numberOfLines={1} style={{ color: tone.text, flexShrink: 1 }}>{w.speakerNames[id] || `Участник ${index + 1}`}</Copy>
      <Icon name={index % 2 ? "pencilGreen" : "pencilBlue"} color={tone.text} />
    </View>
  </Button>;
}
export function ResultScreen() {
  const w = useWorkspace();
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [position, setPosition] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [seek, setSeek] = useState<{ seconds: number; nonce: number }>();
  const entries = w.currentTranscript?.transcript || [];
  const ids = [...new Set(entries.map((x) => x.speaker_id))];
  return (
    <Screen
      title={w.selectedFile?.name || "Расшифровка"}
      subtitle={`${w.durationMs ? seconds(w.durationMs / 1000) + " / " : ""}${participants(ids.length)}`}
      scroll={false}
      footer={
        <Player
          uri={w.selectedFile?.uri || ""}
          waveform={w.waveform}
          seek={seek}
          onPosition={setPosition}
          onExport={() => setExportOpen(true)}
        />
      }
    >
      <SegmentedTabs value={tab} onChange={setTab} options={[
        { value: "transcript", label: "Расшифровка" },
        { value: "summary", label: "Резюме" },
      ]} />
      {tab === "transcript" ? (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 16,
            gap: 12,
          }}
          data={entries}
          keyExtractor={(_, i) => String(i)}
          ListHeaderComponent={
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Copy kind="title">Стенограмма</Copy>
              <Copy kind="caption">{entries.length} реплик</Copy>
            </View>
          }
          ListEmptyComponent={
            <Empty
              title="Речь не обнаружена"
              detail="В записи не найдены реплики."
            />
          }
          renderItem={({ item }) => {
            const tone = getSpeakerColor(item.speaker_id);
            const active = position >= item.start_ms && position < item.end_ms;
            return (
              <Surface
                style={
                  active
                    ? { backgroundColor: tone.bg, borderColor: colors.ring }
                    : undefined
                }
              >
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <SpeakerChip id={item.speaker_id} index={ids.indexOf(item.speaker_id)} />
                  <Button
                    variant="ghost"
                    onPress={() =>
                      setSeek({
                        seconds: item.start_ms / 1000,
                        nonce: Date.now(),
                      })
                    }
                    accessibilityLabel={`Перейти к ${seconds(item.start_ms / 1000)}`}
                  >
                    <Icon name="playSmall" color={colors.mutedForeground} />
                    <Copy kind="caption">{seconds(item.start_ms / 1000)}</Copy>
                  </Button>
                </View>
                <Copy selectable>{item.text}</Copy>
              </Surface>
            );
          }}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={[]}
          renderItem={() => null}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 24 }}
          ListHeaderComponent={
            <View style={{ gap: 24 }}>
              {w.busy && (
                <Surface>
                  <Copy>Формируется резюме…</Copy>
                  <Action
                    label="Отменить обработку"
                    variant="outline"
                    icon="close"
                    onPress={() => void w.cancelProcessing()}
                  />
                </Surface>
              )}
              <Surface>
                <Copy kind="title">Краткое резюме</Copy>
                {w.currentSummary ? (
                  <Copy selectable>{w.currentSummary}</Copy>
                ) : (
                  <>
                    <Copy kind="title">
                      {w.busy
                        ? "Создаём резюме"
                        : !entries.length
                          ? "Речь не обнаружена"
                          : "Не удалось создать резюме"}
                    </Copy>
                    <Copy>
                      Расшифровка сохранена. Попробуйте ещё раз или вернитесь к
                      репликам.
                    </Copy>
                  </>
                )}
                <Action
                  label={w.currentSummary ? "Создать заново" : "Повторить"}
                  icon="refresh"
                  variant="outline"
                  disabled={w.busy || !entries.length}
                  onPress={() => void w.regenerateSummary()}
                />
              </Surface>
              <Surface style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface, gap: 4 }}>
                <Copy kind="label" style={{ color: colors.warning }}>Проверьте важные детали</Copy>
                <Copy kind="caption" style={{ color: colors.warning }}>Резюме может содержать ошибки. Сверяйте его с расшифровкой.</Copy>
              </Surface>
              <View style={{ gap: 4 }}>
                <Copy kind="label" style={{ color: colors.mutedForeground }}>Участники</Copy>
                <View style={[s.row, { flexWrap: "wrap", gap: 12 }]}>
                  {ids.map((id, index) => <SpeakerChip key={id} id={id} index={index} />)}
                </View>
              </View>
              <ErrorNote />
            </View>
          }
        />
      )}
      <ExportDialog visible={exportOpen} onClose={() => setExportOpen(false)} />
      {w.renameModalVisible && w.targetSpeakerId && (
        <SpeakerSheet
          key={w.targetSpeakerId}
          initialName={
            w.speakerNames[w.targetSpeakerId] ||
            `Участник ${ids.indexOf(w.targetSpeakerId) + 1}`
          }
          participant={`Участник ${ids.indexOf(w.targetSpeakerId) + 1}`}
          onSave={(name) => w.handleSaveSpeakerName(w.targetSpeakerId!, name)}
          onClose={() => w.setRenameModalVisible(false)}
        />
      )}
    </Screen>
  );
}
export function HistoryScreen() {
  const w = useWorkspace();
  return <Screen title="Все расшифровки">
    <Action label="Новая расшифровка" icon="upload" onPress={() => router.replace("/")} disabled={w.busy} />
    <Copy kind="label">Готовые расшифровки</Copy>
    <View style={{ gap: 12 }}>{w.history.map(record => <Recent key={record.id} record={record} />)}</View>
    {!w.history.length && <Empty title="История пуста" detail="Готовые расшифровки появятся здесь." />}
  </Screen>;
}
function ExportDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const w = useWorkspace();
  return <>
    <DesignDialog visible={visible && !w.jsonModalVisible} title="Экспорт расшифровки" onClose={onClose}>
      <Copy kind="label">{w.selectedFile?.name || "Расшифровка"}</Copy>
      <Copy kind="caption">{[w.selectedFile?.name.split(".").pop()?.toUpperCase(), w.durationMs ? seconds(w.durationMs / 1000) : undefined].filter(Boolean).join(" / ")}</Copy>
      <Copy style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>Выберите формат файла. TXT содержит текст и таймкоды, JSON — данные реплик.</Copy>
      <Action label="Экспорт TXT" icon="exportWhite" disabled={!w.currentTranscript} onPress={() => void w.handleExportTxt()} />
      <Action label="Экспорт JSON" variant="outline" icon="export" disabled={!w.currentTranscript} onPress={() => void w.handleExportJson()} />
      <Action label="Посмотреть JSON" variant="ghost" icon="document" onPress={() => w.setJsonModalVisible(true)} />
      <Action label="Закрыть" variant="outline" icon="close" onPress={onClose} />
    </DesignDialog>
    <JsonModal visible={visible && w.jsonModalVisible} data={w.currentTranscript} onClose={() => w.setJsonModalVisible(false)} onExport={() => void w.handleExportJson()} />
  </>;
}
export function ExportScreen() {
  return <Screen title="Экспорт"><ExportDialog visible onClose={() => router.canGoBack() ? router.back() : router.replace("/")} /></Screen>;
}
export function AudioScreen() {
  const w = useWorkspace();
  const { confirm, modal } = useConfirmation();
  const { id, menu, play } = useLocalSearchParams<{ id: string; menu?: string; play?: string }>();
  const record = w.recordings.find((r) => r.id === id);
  const [actions, setActions] = useState(menu === "1");
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(record?.title || "");
  const transcribe = () => {
    if (!record) return;
    w.selectAudio({
      uri: record.uri,
      name: record.title + "." + (record.uri.split(".").pop() || "m4a"),
      size: record.size,
      durationMs: record.durationMs,
      waveform: record.waveform,
    });
    router.push("/selected");
  };
  const remove = () => {
    if (!record) return;
    confirm({
      title: "Удалить аудиозапись?",
      description:
        "Файл будет удалён с устройства. Восстановить запись не получится.",
      onConfirm: async () => {
        await removeAudio(record);
        w.setRecordings(await listAudio());
        router.replace("/");
      },
    });
  };
  return (
    <Screen title="Аудиозапись">
      {record ? (
        <>
          <View>
            <Copy kind="label">{record.title}</Copy>
            <Copy kind="caption">
              {seconds(record.durationMs / 1000)} /{" "}
              {new Date(record.createdAt).toLocaleString("ru-RU")}
            </Copy>
          </View>
          <Surface>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.muted }}><Copy kind="label" style={{ color: colors.mutedForeground }}>Запись завершена</Copy></View>
              <Copy kind="large">{seconds(record.durationMs / 1000)}</Copy>
            </View>
            <View
              style={{
                height: 72,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {(record.waveform || []).map((a, i) => (
                <View
                  key={i}
                  style={{
                    width: 2,
                    borderRadius: 1,
                    height: Math.max(4, a * 64),
                    backgroundColor: colors.foreground,
                  }}
                />
              ))}
            </View>
            <Player uri={record.uri} compact autoPlay={play === "1"} />
          </Surface>
          <Action
            label="Расшифровать"
            icon="sparkles"
            onPress={transcribe}
            disabled={w.busy}
          />
          <View style={s.row}>
            <Action
              label="Переименовать"
              variant="outline"
              icon="pencil"
              onPress={() => {
                setName(record.title);
                setRename(true);
              }}
              style={{ flex: 1 }}
            />
            <Action
              label="Удалить"
              danger
              variant="ghost"
              icon="trashRed"
              onPress={remove}
              style={{ flex: 1 }}
            />
          </View>
          <DesignDialog
            visible={actions}
            title="Действия с записью"
            onClose={() => setActions(false)}
          >
            <View style={{ gap: 8 }}>
              <Copy kind="label">{record.title}</Copy>
              <Action label="Расшифровать" onPress={transcribe} />
              <Action
                label="Переименовать"
                variant="outline"
                onPress={() => {
                  setActions(false);
                  setName(record.title);
                  setRename(true);
                }}
              />
              <Action label="Удалить запись" danger variant="ghost" onPress={remove} />
              <Action label="Закрыть" variant="outline" onPress={() => setActions(false)} />
            </View>
          </DesignDialog>
          <AudioRenameDialog record={record} visible={rename} name={name} onNameChange={setName} onClose={() => setRename(false)} />
        </>
      ) : (
        <Empty title="Запись недоступна" detail="Возможно, она была удалена." />
      )}
      {modal}
    </Screen>
  );
}
