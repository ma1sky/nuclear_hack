# Android-приложение

Проект использует Expo SDK 58, React Native и локальный Kotlin-модуль `audio-engine`. Текущий сценарий импортирует WAV, автоматически разделяет говорящих через sherpa-onnx 2.0.1 и показывает интервалы от начала записи. Их можно скопировать через системное меню «Поделиться интервалами». Распознавание речи и резюме подключаются отдельными задачами команды.

## Открыть в Android Studio

Из папки `app/` на Windows выполните:

```powershell
npm.cmd ci
npm.cmd run models:android
npx.cmd expo prebuild --platform android --no-install
```

В Android Studio выберите **File → Open** и откройте сгенерированную папку `app/android`. Для сборки нужен JDK 17 и Android SDK Platform 37. Если встроенный JDK Android Studio другой версии, в **Settings → Build Tools → Gradle → Gradle JDK** можно указать установленный JDK 17. Для отладочной сборки запустите `npm.cmd start` из `app/` и выберите приложение `app` в Android Studio. Исходники Kotlin находятся в `app/modules/audio-engine/android/`, TypeScript в `app/App.tsx`. Папка `app/android` пересоздаётся Expo.

## Собрать APK для проверки

Укажите `JAVA_HOME` и `ANDROID_HOME` на установленные JDK и SDK. Для контрольного APK со встроенным JS и двумя моделями диаризации выполните из `app/`:

```powershell
npm.cmd run models:android -- --diarization-only
.\android\gradlew.bat -p android :app:assembleRelease '-PdiarizationOnly=true' '-PreactNativeArchitectures=arm64-v8a,x86_64'
```

APK появится в `android/app/build/outputs/apk/release/app-release.apk`. Он подходит для Redmi и эмулятора x86_64. Gradle-проект Expo использует отладочную подпись для локального release APK. JS и модели находятся внутри APK, поэтому после установки Metro и интернет для проверки не требуются.

Для сборки под Redmi со всеми весами выполните:

```powershell
npm.cmd run models:android
.\android\gradlew.bat -p android :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a'
```

Эта команда добавляет GigaAM INT8, его словарь и Qwen GGUF к моделям диаризации. Веса проверяются при подготовке сборки и копируются при запуске приложения в приватный каталог с проверкой SHA-256. `AudioEngine.prepareModels()` возвращает локальные пути по ключам `segmentation`, `embedding`, `asrModel`, `asrTokens`, `llm` для моделей, входящих в сборку.

Источники и хеши загрузок закреплены в [скрипте подготовки моделей](scripts/prepare-android-models.mjs). Лицензии Pyannote и GigaAM берутся из их архивов и включаются в APK. Лицензии и карточки остальных компонентов доступны у авторов. [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/LICENSE) · [3D-Speaker](https://github.com/modelscope/3D-Speaker/blob/main/LICENSE) · [Qwen GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF)

## Контрольный WAV

Скрипт подготовки скачивает `models/downloads/1-two-speakers-en.wav`, 16 секунд, PCM 16 бит, моно, 16 кГц. Перенесите его в «Загрузки», установите APK и включите авиарежим. В приложении выберите файл и нажмите **Разделить говорящих**. [Исходный WAV](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/1-two-speakers-en.wav)

В авиарежиме на эмуляторе Android получены два голоса. У первого интервалы 1,617–3,271 и 4,435–6,427 с, у второго 9,346–11,455 и 12,181–14,645 с. Для проверки повторного появления голоса использован WAV из отрезков 1,3–3,6, 9,1–11,8 и 4,2–6,7 с с полусекундными паузами. Приложение вернуло последовательность `speaker_1 → speaker_2 → speaker_1`. На Redmi зафиксируйте фактические интервалы и время обработки.

[Фактические интервалы обоих прогонов](../artifacts/test-results/diarization-emulator.json)

## Передача интервалов в ASR

`SpeakerDiarizer.process` принимает нормализованный `FloatArray` mono 16 кГц. Интервалы отсортированы по времени и содержат `startMs`, `endMs` и `speakerId`. Идентификатор назначается при первом появлении говорящего в записи и переиспользуется в следующих репликах. Модели диаризации освобождаются перед возвратом интервалов, после чего можно загружать GigaAM. `AudioEngine.diarize(fileUri)` даёт доступ к тем же интервалам для проверки через интерфейс.

Для интеграции GigaAM соберите вариант со всеми весами. Внутри Kotlin-модуля передайте декодированные сэмплы в `SpeakerDiarizer.process`, затем подготовьте пути `asrModel` и `asrTokens` через `ModelAssets.prepare`.

```kotlin
val diarizationModels = ModelAssets.prepare(context, ModelAssets.diarizationKeys)
val intervals = SpeakerDiarizer.process(samples, diarizationModels)
val asrModels = ModelAssets.prepare(context, listOf("asrModel", "asrTokens"))
```
