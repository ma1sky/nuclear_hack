import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import { router, usePreventRemove } from "expo-router";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Copy, Action, Screen, Surface, seconds, s } from "./ProductUI";
import { Player } from "./Player";
import { Input } from "../components/ui/input";
import { useWorkspace } from "../state/WorkspaceProvider";
import {
  retainAudio,
  saveAudio,
  listAudio,
  removeAudio,
  type AudioRecording,
} from "../services/libraryService";
import { useConfirmation } from "./Confirmation";
import { colors } from "../theme/tokens";

export function RecorderScreen() {
  const w = useWorkspace();
  const { confirm, modal } = useConfirmation();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 200);
  const [mode, setMode] = useState<
    "ready" | "recording" | "paused" | "finished" | "saved" | "denied"
  >("ready");
  const [pending, setPending] = useState<AudioRecording>();
  const [name, setName] = useState("Новая запись");
  const [working, setWorking] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(50).fill(4));
  const elapsed = useRef(0);
  const measuredLevels = useRef<number[]>([]);
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = recorder.getStatus();
      if (current.durationMillis > 0) elapsed.current = current.durationMillis;
      if (current.isRecording && current.metering !== undefined) {
        measuredLevels.current.push(
          Math.min(1, Math.pow(10, current.metering / 40)),
        );
        setLevels((x) => [
          ...x.slice(-49),
          Math.max(4, Math.min(64, Math.pow(10, current.metering! / 40) * 64)),
        ]);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [recorder]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && recorder.isRecording) {
        recorder.pause();
        setMode("paused");
      }
    });
    return () => sub.remove();
  }, [recorder]);
  const unsaved =
    mode === "recording" || mode === "paused" || mode === "finished";
  const disablePrevention = usePreventRemove(unsaved, ({ repeat }) => {
    if (mode === "recording" || mode === "paused")
      confirm({
        title: "Запись не завершена",
        description: "Завершите запись, чтобы сохранить или удалить аудио.",
        cancelLabel: "Продолжить",
        confirmLabel: "Завершить",
        destructive: false,
        onConfirm: () => finish(),
      });
    else discard(repeat);
  });
  async function start() {
    if (lock.current || w.busy) return;
    lock.current = true;
    setWorking(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMode("denied");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      measuredLevels.current = [];
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMode("recording");
    } catch (e) {
      Alert.alert("Не удалось начать запись", String(e));
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  async function finish() {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    try {
      const duration = elapsed.current;
      await recorder.stop();
      if (!recorder.uri) throw new Error("Файл записи недоступен");
      const kept = await retainAudio(recorder.uri, "m4a");
      const samples = measuredLevels.current;
      const waveform = Array.from({ length: 61 }, (_, i) => {
        const first = Math.floor((i * samples.length) / 61);
        const last = Math.floor(((i + 1) * samples.length) / 61);
        const bucket = samples.slice(first, last);
        return bucket.length
          ? bucket.reduce((a, b) => a + b, 0) / bucket.length
          : 0;
      });
      setPending({
        waveform,
        ...kept,
        title: name.trim() || "Новая запись",
        durationMs: duration,
        createdAt: new Date().toISOString(),
      });
      await setAudioModeAsync({ allowsRecording: false });
      setMode("finished");
    } catch (e) {
      Alert.alert("Не удалось завершить запись", String(e));
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  async function save(transcribe = false) {
    if (!pending || lock.current) return;
    lock.current = true;
    setWorking(true);
    try {
      const record = { ...pending, title: name.trim() || "Новая запись" };
      await saveAudio(record);
      w.setRecordings(await listAudio());
      setPending(record);
      setMode("saved");
      if (transcribe) {
        w.selectAudio({
          uri: record.uri,
          name: record.title + ".m4a",
          durationMs: record.durationMs,
          waveform: record.waveform,
        });
        disablePrevention();
        router.replace("/selected");
      }
    } catch (e) {
      Alert.alert("Не удалось сохранить аудио", String(e));
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  function discard(after?: () => void) {
    confirm({
      title: "Удалить запись?",
      description: "Аудио будет удалено. Восстановить запись не получится.",
      cancelLabel: "Оставить",
      onConfirm: async () => {
        if (!pending) return;
        await removeAudio(pending);
        setPending(undefined);
        setMode("ready");
        elapsed.current = 0;
        disablePrevention();
        after?.();
      },
    });
  }
  return (
    <Screen
      title={
        mode === "saved"
          ? "Аудиозапись сохранена"
          : mode === "finished"
            ? "Запись готова"
            : "Диктофон"
      }
    >
      {mode === "denied" ? (
        <Surface>
          <Copy kind="title">Нет доступа к микрофону</Copy>
          <Copy>
            Разрешите доступ к микрофону в настройках приложения, затем
            вернитесь к записи.
          </Copy>
          <Action
            label="Открыть настройки"
            onPress={() => void Linking.openSettings()}
          />
          <Action
            label="Попробовать снова"
            variant="outline"
            onPress={() => void start()}
          />
        </Surface>
      ) : (
        <Surface>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor:
                  mode === "recording" ? colors.errorSurface : colors.muted,
              }}
            >
              <Copy
                kind="label"
                style={{
                  color:
                    mode === "recording"
                      ? colors.destructive
                      : colors.mutedForeground,
                }}
              >
                {
                  {
                    ready: "Готов к записи",
                    recording: "Идёт запись",
                    paused: "Пауза",
                    finished: "Запись завершена",
                    saved: "Запись сохранена",
                  }[mode]
                }
              </Copy>
            </View>
            <Copy kind="large">
              {seconds(
                (mode === "ready"
                  ? 0
                  : pending?.durationMs || state.durationMillis) / 1000,
              )}
            </Copy>
          </View>
          <View
            style={{
              height: 72,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {(pending?.waveform
              ? pending.waveform.map((x) => Math.max(4, x * 64))
              : levels
            ).map((height, i) => (
              <View
                key={i}
                style={{
                  width: 2,
                  borderRadius: 1,
                  height,
                  backgroundColor:
                    mode === "recording"
                      ? colors.destructive
                      : colors.foreground,
                }}
              />
            ))}
          </View>
          <Copy kind="label" style={{ color: colors.mutedForeground }}>
            {mode === "ready"
              ? "Разместите телефон рядом с собеседниками и нажмите кнопку начала записи."
              : mode === "recording"
                ? "Запись идёт через микрофон телефона. Нажмите паузу, чтобы прервать запись."
                : mode === "paused"
                  ? "Запись приостановлена. Продолжите или завершите запись."
                  : "Прослушайте аудио перед сохранением или отправьте его на расшифровку."}
          </Copy>
          {mode === "ready" && (
            <Action
              label="Начать запись"
              icon="microphoneWhite"
              disabled={working || w.busy}
              onPress={() => void start()}
            />
          )}
          {(mode === "recording" || mode === "paused") && (
            <View style={s.row}>
              <Action
                label={mode === "recording" ? "Пауза" : "Продолжить"}
                variant="outline"
                icon={mode === "recording" ? "pauseDark" : "playDark"}
                disabled={working}
                style={{ flex: 1 }}
                onPress={() => {
                  if (mode === "recording") {
                    recorder.pause();
                    setMode("paused");
                  } else {
                    recorder.record();
                    setMode("recording");
                  }
                }}
              />
              <Action
                label="Завершить"
                icon="stopWhite"
                variant="destructive"
                disabled={working}
                style={{ flex: 1 }}
                onPress={() => void finish()}
              />
            </View>
          )}
          {pending && <Player uri={pending.uri} compact />}
        </Surface>
      )}
      {(mode === "finished" || mode === "saved") && (
        <>
          <Surface>
            <Copy kind="label">Название записи</Copy>
            <Input
              value={name}
              onChangeText={setName}
              accessibilityLabel="Название записи"
              editable={mode !== "saved"}
            />
          </Surface>
          <View style={{ gap: 8 }}>
            <Action
              label="Расшифровать"
              icon="sparkles"
              disabled={working || w.busy}
              onPress={() => void save(true)}
            />
            {mode === "finished" ? (
              <>
                <Action
                  label="Сохранить аудио"
                  icon="save"
                  variant="outline"
                  disabled={working}
                  onPress={() => void save()}
                />
                <Action
                  label="Удалить запись"
                  icon="trash"
                  variant="ghost"
                  disabled={working}
                  onPress={() => discard()}
                />
              </>
            ) : (
              <>
                <Action
                  label="Записать ещё"
                  variant="outline"
                  onPress={() => {
                    setPending(undefined);
                    setMode("ready");
                    elapsed.current = 0;
                    setLevels(Array(50).fill(4));
                    setName("Новая запись");
                  }}
                />
                <Action
                  label="В аудиотеку"
                  variant="ghost"
                  onPress={() => router.replace("/")}
                />
              </>
            )}
          </View>
        </>
      )}
      {(mode === "ready" || mode === "recording" || mode === "paused") && (
        <View style={{ gap: 12 }}>
          <Copy kind="title">
            {mode === "ready"
              ? "Запишите разговор"
              : "Можно поставить на паузу"}
          </Copy>
          <Copy style={{ color: colors.mutedForeground }}>
            {mode === "ready"
              ? "После записи можно прослушать аудио, задать имя и получить расшифровку."
              : "После паузы запись продолжится в том же файле. Кнопка завершения откроет прослушивание."}
          </Copy>
        </View>
      )}
      {(mode === "ready" || mode === "denied") && (
        <Action
          label="Выбрать готовую запись"
          icon="uploadDark"
          variant="outline"
          onPress={() => {
            void w.chooseAudioFile().then((picked) => {
              if (picked) router.replace("/selected");
            });
          }}
        />
      )}
      {modal}
    </Screen>
  );
}
