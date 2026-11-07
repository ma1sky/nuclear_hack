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

function Recent({ record }: { record: SavedTranscript }) {
  const w = useWorkspace();
  return (
    <Surface>
      <FileRow
        name={record.title}
        detail={`${new Date(record.createdAt).toLocaleDateString("ru-RU")}  /  ${record.exportData.transcript.length} реплик`}
      />
      <Action
        label="Открыть расшифровку"
        icon="document"
        variant="outline"
        onPress={() => {
          w.handleSelectHistory(record);
          router.push("/result");
        }}
      />
    </Surface>
  );
}
function RecordingCard({ record }: { record: AudioRecording }) {
  const w = useWorkspace();
  return (
    <Surface>
      <View style={s.row}>
        <IconButton
          name="playWhite"
          label={`Открыть аудио: ${record.title}`}
          primary
          onPress={() =>
            router.push({ pathname: "/audio", params: { id: record.id } })
          }
        />
        <View style={{ flex: 1 }}>
          <Copy kind="label">{record.title}</Copy>
          <Copy kind="caption">
            {seconds(record.durationMs / 1000)} /{" "}
            {new Date(record.createdAt).toLocaleDateString("ru-RU")}
          </Copy>
        </View>
        <IconButton
          name="more"
          label="Действия с записью"
          onPress={() =>
            router.push({
              pathname: "/audio",
              params: { id: record.id, menu: "1" },
            })
          }
        />
      </View>
      <Action
        label="Расшифровать"
        icon="sparkles"
        onPress={() => {
          w.selectAudio({
            uri: record.uri,
            name: record.title + ".m4a",
            size: record.size,
            durationMs: record.durationMs,
            waveform: record.waveform,
          });
          router.push("/selected");
        }}
      />
    </Surface>
  );
}
export function LibraryScreen() {
  const w = useWorkspace();
  const pick = usePick();
  return (
    <Screen
      title="Нейро-стенографист"
      subtitle="Подкасты, интервью и встречи"
      home
    >
      <ErrorNote />
      <Surface>
        {!w.history.length && !w.recordings.length && (
          <View
            style={{
              width: 56,
              padding: 16,
              borderRadius: 12,
              backgroundColor: colors.muted,
            }}
          >
            <Icon name="headphones" />
          </View>
        )}
        <Copy
          kind={w.history.length || w.recordings.length ? "title" : "large"}
        >
          {w.history.length || w.recordings.length
            ? "Добавить аудио"
            : "Из аудио — в текст"}
        </Copy>
        {!w.history.length && !w.recordings.length && (
          <Copy style={{ color: colors.mutedForeground }}>
            Расшифруйте подкаст или разговор с таймкодами и разделением
            участников.
          </Copy>
        )}
        <View
          style={[
            s.row,
            {
              flexWrap: "wrap",
              ...(!w.history.length && !w.recordings.length
                ? { flexDirection: "column", alignItems: "stretch" }
                : {}),
            },
          ]}
        >
          <Action
            label={
              w.history.length || w.recordings.length
                ? "Выбрать файл"
                : "Выбрать аудиозапись"
            }
            icon="upload"
            onPress={pick}
            disabled={w.busy}
            style={{ flexGrow: 1 }}
          />
          <Action
            label={
              w.history.length || w.recordings.length
                ? "Записать"
                : "Записать аудио"
            }
            icon="microphone"
            variant="outline"
            onPress={() => router.push("/recorder")}
            disabled={w.busy}
            style={{ flexGrow: 1 }}
          />
        </View>
      </Surface>
      <Privacy />
      {!w.modelsReady && (
        <Copy kind="caption">Подготовка встроенных моделей…</Copy>
      )}
      {!!w.recordings.length && (
        <View style={{ gap: 12 }}>
          <Copy kind="title">Записи диктофона</Copy>
          {w.recordings.slice(0, 3).map((record) => (
            <RecordingCard key={record.id} record={record} />
          ))}
        </View>
      )}
      <View style={{ gap: 12 }}>
        <Copy kind="title">Последние расшифровки</Copy>
        {w.history.slice(0, 3).map((record) => (
          <Recent key={record.id} record={record} />
        ))}
        {!w.history.length && (
          <Empty
            title="Пока нет расшифровок"
            detail="Выберите первую запись — результат сохранится в истории на этом устройстве."
          />
        )}
        <Action
          label="Вся история"
          icon="history"
          variant="ghost"
          onPress={() => router.push("/history")}
        />
      </View>
    </Screen>
  );
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
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.muted,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
          }}
        >
          <Copy kind="label">
            {stageLabels[index] || "Обработка завершена"}
          </Copy>
        </View>
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
                backgroundColor: colors.primary,
                borderRadius: 4,
              }}
            />
          </View>
        ) : (
          w.busy && <ActivityIndicator color={colors.primary} />
        )}
        <View style={{ gap: 8 }}>
          {stageLabels.map((label, i) => (
            <View style={s.row} key={label}>
              {i < index ? (
                <Icon name="check" />
              ) : i === index && w.busy ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Copy kind="label" style={{ width: 20, textAlign: "center" }}>
                  {i + 1}
                </Copy>
              )}
              <Copy
                kind="label"
                style={{
                  color:
                    i === index ? colors.foreground : colors.mutedForeground,
                }}
              >
                {label}
              </Copy>
            </View>
          ))}
        </View>
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
export function ResultScreen() {
  const w = useWorkspace();
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [position, setPosition] = useState(0);
  const [seek, setSeek] = useState<{ seconds: number; nonce: number }>();
  const entries = w.currentTranscript?.transcript || [];
  const ids = [...new Set(entries.map((x) => x.speaker_id))];
  return (
    <Screen
      title={w.selectedFile?.name || "Расшифровка"}
      subtitle={`${w.durationMs ? seconds(w.durationMs / 1000) + " / " : ""}Участников: ${ids.length}`}
      scroll={false}
      footer={
        <Player
          uri={w.selectedFile?.uri || ""}
          waveform={w.waveform}
          seek={seek}
          onPosition={setPosition}
          onExport={() => router.push("/export")}
        />
      }
    >
      <View
        style={{
          margin: 16,
          padding: 4,
          borderRadius: 12,
          backgroundColor: colors.muted,
          flexDirection: "row",
          gap: 4,
        }}
      >
        {(["transcript", "summary"] as const).map((t) => (
          <Action
            key={t}
            label={t === "transcript" ? "Расшифровка" : "Резюме"}
            variant={tab === t ? "outline" : "ghost"}
            style={{ flex: 1, minHeight: 40, padding: 8 }}
            onPress={() => setTab(t)}
          />
        ))}
      </View>
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
                  <Button
                    variant="ghost"
                    disabled={w.busy}
                    onPress={() => w.openRenameSpeaker(item.speaker_id)}
                    accessibilityLabel={`Переименовать участника: ${w.speakerNames[item.speaker_id] || item.speaker_id}`}
                    style={{ paddingHorizontal: 8, minHeight: 48 }}
                  >
                    <View
                      style={[
                        s.row,
                        {
                          backgroundColor: tone.bg,
                          padding: 4,
                          borderRadius: 6,
                        },
                      ]}
                    >
                      <Copy kind="label" style={{ color: tone.text }}>
                        {w.speakerNames[item.speaker_id] ||
                          `Участник ${ids.indexOf(item.speaker_id) + 1}`}
                      </Copy>
                      <Icon
                        name={
                          ids.indexOf(item.speaker_id) % 2
                            ? "pencilGreen"
                            : "pencilBlue"
                        }
                      />
                    </View>
                  </Button>
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
                    <Icon name="playSmall" />
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
          contentContainerStyle={{ padding: 16, gap: 24 }}
          ListHeaderComponent={
            <View style={{ gap: 24 }}>
              <Copy kind="title">Краткое резюме</Copy>
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
              <Surface style={{ backgroundColor: colors.warningSurface }}>
                <Copy>
                  Резюме создано локальной моделью. Проверьте важные факты по
                  расшифровке.
                </Copy>
              </Surface>
              <Copy kind="label">Участники</Copy>
              <View style={[s.row, { flexWrap: "wrap" }]}>
                {ids.map((id) => (
                  <Action
                    key={id}
                    label={
                      w.speakerNames[id] || `Участник ${ids.indexOf(id) + 1}`
                    }
                    variant="outline"
                    disabled={w.busy}
                    onPress={() => w.openRenameSpeaker(id)}
                  />
                ))}
              </View>
              <ErrorNote />
            </View>
          }
        />
      )}
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
  return (
    <Screen title="История записей">
      <Copy style={{ color: colors.mutedForeground }}>
        Аудиозаписи и расшифровки
      </Copy>
      <Action
        label="Новая расшифровка"
        variant="outline"
        icon="uploadDark"
        onPress={() => router.replace("/")}
        disabled={w.busy}
      />
      <Copy kind="title">Записи диктофона</Copy>
      {w.recordings.map((record) => (
        <RecordingCard key={record.id} record={record} />
      ))}
      <Copy kind="title">Расшифровки</Copy>
      {w.history.map((record) => (
        <Surface key={record.id}>
          <Recent record={record} />
          <Action
            label="Удалить расшифровку"
            variant="ghost"
            icon="trash"
            onPress={() =>
              Alert.alert(
                "Удалить расшифровку?",
                "Исходное аудио останется в аудиотеке.",
                [
                  { text: "Отмена" },
                  {
                    text: "Удалить",
                    style: "destructive",
                    onPress: () => {
                      void w.handleDeleteHistory(record.id);
                    },
                  },
                ],
              )
            }
          />
        </Surface>
      ))}
      {!w.history.length && (
        <Empty
          title="История пуста"
          detail="Готовые расшифровки появятся здесь."
        />
      )}
    </Screen>
  );
}
export function ExportScreen() {
  const w = useWorkspace();
  return (
    <Screen title="Экспорт записи">
      <Surface>
        <SelectedFile />
      </Surface>
      <Copy kind="title">Выберите формат</Copy>
      <Surface>
        <Copy kind="title">Текст / TXT</Copy>
        <Copy style={{ color: colors.mutedForeground }}>
          Расшифровка с именами, временем и резюме.
        </Copy>
        <Action
          label="Сохранить TXT"
          icon="exportWhite"
          disabled={!w.currentTranscript}
          onPress={() => void w.handleExportTxt()}
        />
      </Surface>
      <Surface>
        <Copy kind="title">Данные / JSON</Copy>
        <Copy style={{ color: colors.mutedForeground }}>
          Структурированные реплики и исходные ID участников.
        </Copy>
        <Action
          label="Сохранить JSON"
          variant="outline"
          icon="export"
          disabled={!w.currentTranscript}
          onPress={() => void w.handleExportJson()}
        />
      </Surface>
      <Action
        label="Посмотреть JSON"
        variant="ghost"
        icon="jsonPreview"
        onPress={() => w.setJsonModalVisible(true)}
      />
      <Privacy message="Вы сами выбираете, куда сохранить или отправить файл." />
      <JsonModal
        visible={w.jsonModalVisible}
        data={w.currentTranscript}
        onClose={() => w.setJsonModalVisible(false)}
        onExport={() => void w.handleExportJson()}
      />
    </Screen>
  );
}
export function AudioScreen() {
  const w = useWorkspace();
  const { confirm, modal } = useConfirmation();
  const { id, menu } = useLocalSearchParams<{ id: string; menu?: string }>();
  const record = w.recordings.find((r) => r.id === id);
  const [actions, setActions] = useState(menu === "1");
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(record?.title || "");
  const transcribe = () => {
    if (!record) return;
    w.selectAudio({
      uri: record.uri,
      name: record.title + ".m4a",
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
              <Copy kind="label">Запись завершена</Copy>
              <Copy kind="large">{seconds(record.durationMs / 1000)}</Copy>
            </View>
            <Copy style={{ color: colors.mutedForeground }}>
              Запись сохранена в аудиотеке. Можно прослушать её или
              расшифровать.
            </Copy>
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
            <Player uri={record.uri} compact />
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
              variant="ghost"
              icon="trashRed"
              onPress={remove}
              style={{ flex: 1 }}
            />
          </View>
          <DesignDialog
            bottom
            visible={actions}
            title="Действия с записью"
            onClose={() => setActions(false)}
          >
            <View style={{ padding: 16, gap: 8 }}>
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
              <Action label="Удалить запись" variant="ghost" onPress={remove} />
            </View>
          </DesignDialog>
          <DesignDialog
            visible={rename}
            title="Переименовать запись"
            onClose={() => setRename(false)}
          >
            <View style={{ padding: 16, gap: 12 }}>
              <Copy kind="label">Название записи</Copy>
              <Input
                value={name}
                onChangeText={setName}
                accessibilityLabel="Название записи"
              />
              <Copy kind="caption">
                Аудио и длительность записи сохранятся.
              </Copy>
              <Action
                label="Сохранить"
                disabled={!name.trim()}
                onPress={() => {
                  void saveAudio({ ...record, title: name.trim() })
                    .then(async () => {
                      w.setRecordings(await listAudio());
                      setRename(false);
                    })
                    .catch((e) => Alert.alert("Ошибка сохранения", String(e)));
                }}
              />
              <Action
                label="Отмена"
                variant="ghost"
                onPress={() => setRename(false)}
              />
            </View>
          </DesignDialog>
        </>
      ) : (
        <Empty title="Запись недоступна" detail="Возможно, она была удалена." />
      )}
      {modal}
    </Screen>
  );
}
