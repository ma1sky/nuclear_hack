# Android-приложение

Expo SDK 58 / React Native / TypeScript. Объединены UI, локальная диаризация sherpa-onnx 2.0.1, GigaAM v2 CTC INT8, аудиоподготовка WAV/M4A/AAC, отдельное резюме Qwen через llama.rn 0.12.9, история и JSON/TXT-экспорт.

Реальный конвейер подключён в коде. Его точность, скорость и автономность на Redmi ещё требуют проверки. Ошибки моделей не заменяются тестовой расшифровкой или имитацией резюме. Фикстуры UI находятся в tests и не подключены к приложению.

## Подготовка

Из папки app:

```powershell
npm ci
npm run models:android
npm run typecheck
npm run lint
npm run test:models
npm run test:integration
npx expo prebuild --platform android --no-install
```

Первый скрипт моделей выполняется разработчиком на ПК: скачивает AAR и все веса с проверкой SHA-256, генерирует единый комплект assets. При запуске на телефоне сеть не используется. Подробнее: [доставка моделей](../docs/model-bundle.md).

llama.rn загружает нативные библиотеки в postinstall. Если npm блокирует install scripts или загрузка не завершилась, нужно явно выполнить `node node_modules/llama.rn/install/download-native-artifacts.js` до сборки. Файлы весов и нативные архивы не хранятся в Git.

Для Kotlin-аудиотестов: `modules/audio-engine/tests/test-audio.ps1 -StudioPath 'D:\Programs\Android Studio'`.

## Android Studio и сборка

Открыть сгенерированную папку app/android. Нужен JDK, совместимый с Gradle 9.4.1, Android SDK Platform 37 и настроенные JAVA_HOME/ANDROID_HOME.

```powershell
.\android\gradlew.bat -p android :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a'
```

Контрольный артефакт: android/app/build/outputs/apk/release/app-release.apk. Включает встроенный JS и все модели. Старый флаг `diarizationOnly` является диагностическим и намеренно отклоняется для этой сборки: диаризация без ASR/LLM не закрывает задание.

Схема внешнего JSON: `{ "transcript": [{ "speaker_id": "speaker_1", "start_ms": 0, "end_ms": 1000, "text": "..." }] }`. Резюме и переименования не меняют JSON. Некорректные метки отклоняются, а не подменяются нулями.

Расшифровка сохраняется до запуска LLM. Ошибка LLM отображается отдельно; готовый текст остаётся доступен для экспорта. Отмена ждёт текущий блок инференса и не запускает вторую задачу параллельно.

## Что обязательно проверить на Redmi

Чистая установка и первый запуск в авиарежиме, новая русская запись, реальный ASR/диаризация/резюме, экспорт, три последовательных запуска, отмена, повреждённые файлы, память, WER и RTF. Без этих проверок приложение не считается полностью принятым. Английский, запись с микрофона и разделение одновременных голосов не заявлены готовыми.
