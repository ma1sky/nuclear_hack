import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { useFocusEffect } from "expo-router";
import { View, Pressable } from "react-native";
import { Action, Copy, IconButton, s, seconds } from "./ProductUI";
import { colors } from "../theme/tokens";

// A measured playhead is used until waveform samples are available; no fake amplitudes.
export function Player({
  uri,
  seek,
  onPosition,
  onExport,
  compact = false,
  waveform = [],
  autoPlay = false,
}: {
  uri: string;
  seek?: { seconds: number; nonce: number };
  onPosition?: (ms: number) => void;
  onExport?: () => void;
  compact?: boolean;
  waveform?: number[];
  autoPlay?: boolean;
}) {
  const trackWidth = useRef(0);
  const track = useRef<ComponentRef<typeof View>>(null);
  const trackLeft = useRef(0);
  const started = useRef(false);
  const [rate, setRate] = useState(1);
  const player = useAudioPlayer(uri || null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  useEffect(() => { started.current = false; }, [uri]);
  useEffect(() => {
    if (autoPlay && status.isLoaded && !started.current) {
      started.current = true;
      player.play();
    }
  }, [autoPlay, status.isLoaded, player]);
  useFocusEffect(
    useCallback(
      () => () => {
        try {
          player.pause();
        } catch {
          /* Native hook may already have released the player. */
        }
      },
      [player],
    ),
  );
  useEffect(() => {
    onPosition?.(status.currentTime * 1000);
  }, [status.currentTime, onPosition]);
  useEffect(() => {
    if (!seek || !status.isLoaded) return;
    void player
      .seekTo(Math.min(status.duration, seek.seconds))
      .then(() => player.play());
  }, [player, seek, status.isLoaded, status.duration]);
  const seekTo = (time: number) => {
    void player
      .seekTo(Math.max(0, Math.min(status.duration, time)))
      .catch(() => {});
  };
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || status.currentTime >= status.duration - 0.05) {
        void player.seekTo(0).then(() => player.play()).catch(() => {});
      } else player.play();
    }
  };
  if (compact)
    return (
      <View style={s.row}>
        <IconButton
          name={status.playing ? "pause" : "playWhite"}
          label={status.playing ? "Приостановить" : "Воспроизвести"}
          primary
          disabled={!status.isLoaded}
          onPress={toggle}
        />
        <Copy kind="caption">
          {seconds(status.currentTime)} / {seconds(status.duration)}
        </Copy>
      </View>
    );
  return (
    <View
      style={{
        backgroundColor: colors.card,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 4,
      }}
    >
      {!compact && (
        <Pressable
          ref={track}
          accessibilityRole="adjustable"
          accessibilityLabel="Позиция воспроизведения"
          accessibilityValue={{
            min: 0,
            max: Math.floor(status.duration),
            now: Math.floor(status.currentTime),
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) =>
            seekTo(
              status.currentTime +
                (e.nativeEvent.actionName === "increment" ? 15 : -15),
            )
          }
          onPress={(e) => {
            const width = trackWidth.current;
            if (width)
              seekTo(Math.max(0, Math.min(1, (e.nativeEvent.pageX - trackLeft.current) / width)) * status.duration);
          }}
          onLayout={(e) => {
            trackWidth.current = e.nativeEvent.layout.width;
            track.current?.measureInWindow((x) => { trackLeft.current = x; });
          }}
          style={{ minHeight: 32, justifyContent: "center" }}
        >
          {waveform.length ? (
            <View
              pointerEvents="none"
              style={{
                height: 28,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {waveform.map((amplitude, i) => (
                <View
                  key={i}
                  style={{
                    width: 2,
                    borderRadius: 2,
                    height: Math.max(4, Math.min(28, amplitude * 80)),
                    backgroundColor:
                      i / waveform.length <
                      status.currentTime / (status.duration || 1)
                        ? colors.foreground
                        : colors.border,
                  }}
                />
              ))}
            </View>
          ) : (
            <View
              style={{
                height: 4,
                backgroundColor: colors.border,
                borderRadius: 2,
              }}
            >
              <View
                style={{
                  height: 4,
                  backgroundColor: colors.foreground,
                  width: `${status.duration ? (status.currentTime / status.duration) * 100 : 0}%`,
                }}
              />
            </View>
          )}
        </Pressable>
      )}
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Copy kind="caption">{seconds(status.currentTime)}</Copy>
        <Copy kind="caption">{seconds(status.duration)}</Copy>
      </View>
      {!status.isLoaded && (
        <Copy kind="caption">
          Загрузка аудио… Если исходный файл удалён, воспроизведение недоступно.
        </Copy>
      )}
      <View
        style={[
          s.row,
          { justifyContent: compact ? "flex-start" : "space-between" },
        ]}
      >
        {!compact && (
          <Action
            variant="ghost"
            label={`${rate}x`}
            disabled={!status.isLoaded}
            onPress={() => {
              const rates = [1, 1.25, 1.5, 2, 0.75];
              const next = rates[(rates.indexOf(rate) + 1) % rates.length];
              player.setPlaybackRate(next);
              // Android does not emit rate updates while paused.
              setRate(next);
            }}
          />
        )}
        {!compact && (
          <IconButton
            name="rewind"
            label="Назад на 15 секунд"
            disabled={!status.isLoaded}
            onPress={() => seekTo(status.currentTime - 15)}
          />
        )}
        <IconButton
          name={status.playing ? "pause" : "playWhite"}
          label={status.playing ? "Приостановить" : "Воспроизвести"}
          primary
          disabled={!status.isLoaded}
          onPress={toggle}
        />
        {!compact && (
          <IconButton
            name="forward"
            label="Вперёд на 15 секунд"
            disabled={!status.isLoaded}
            onPress={() => seekTo(status.currentTime + 15)}
          />
        )}
        {onExport && (
          <IconButton name="export" label="Экспорт" onPress={onExport} />
        )}
      </View>
    </View>
  );
}
