# Android-приложение

Expo SDK 58 / React Native / TypeScript приложение «Нейро-стенографист» для офлайн-транскрибации, диаризации и локального резюмирования аудиозаписей на Android.

## Что реализовано (Зона ответственности: Бессонов Станислав)

- **Интерфейс приложения (`App.tsx`, `src/components/`)**:
  - Карточка выбора аудиозаписи (WAV / M4A / AAC) с индикацией размера и формата.
  - Кнопка «+ Тестовая запись» для мгновенной проверки интерфейса, реплик и экспорта.
  - Отображение стадий обработки: *Подготовка аудио* → *Диаризация* → *Распознавание речи* → *Локальная LLM (Qwen)*.
  - Кооперативная отмена обработки с безопасным освобождением ресурсов.
  - Список реплик диалога с цветными бейджами спикеров, временными метками `MM:SS.ms` и сырыми миллисекундами.
  - Модальное окно переименования участников (для удобства чтения протокола).
  - Карточка краткого резюме встречи от локальной нейросети (Qwen2.5-0.5B-Instruct).
  - Модальное окно предпросмотра сгенерированного JSON прямо на экране.
  - История ранее обработанных записей с быстрым открытием и удалением.

- **Экспорт данных (`src/services/exportService.ts`)**:
  - Строгий экспорт в **JSON** точно по спецификации страницы 15 официального ТЗ:
    `{ "transcript": [ { "speaker_id": "...", "start_ms": 123, "end_ms": 456, "text": "..." } ] }`. Никаких лишних полей в JSON для оценки не добавляется.
  - Экспорт читаемого **TXT**-протокола совещания с датой, длительностью, локальным резюме и диалогом по ролям.
  - Шаринг файлов через системное меню Android (`expo-sharing`).

- **Локальная LLM (`src/services/llmService.ts`)**:
  - Адаптер для вызова `llama.rn` (Qwen2.5-0.5B-Instruct GGUF `Q4_K_M`) на CPU.
  - Чанкинг длинных диалогов под контекст 2048 токенов для исключения OOM на 6 ГБ RAM.
  - Защита конвейера: сбой или отсутствие весов LLM не ломает расшифровку ASR и сохраняет экспорт.

- **Локальное хранение (`src/services/storageService.ts`)**:
  - Автоматическое сохранение результатов в приватную память (`FileSystem.documentDirectory/transcripts/`).
  - Сохранение истории между перезапусками приложения в авиарежиме.

- **Связь с Kotlin-модулем (`modules/audio-engine/`)**:
  - Поддержка нативного вызова `AudioEngineService.transcribe()` и симуляции для отладки UI/QA.

## Открыть в Android Studio

Из папки `app/` на Windows выполните:

```powershell
npm.cmd ci
npm.cmd run models:android
npx.cmd expo prebuild --platform android --no-install
```

В Android Studio выберите **File → Open** и откройте сгенерированную папку `app/android`. Для сборки нужен JDK 17 и Android SDK Platform 37. Исходники Kotlin находятся в `app/modules/audio-engine/android/`, TypeScript в `app/App.tsx`.

## Собрать APK для проверки

Укажите `JAVA_HOME` и `ANDROID_HOME` на установленные JDK и SDK. Для контрольного APK со встроенным JS и двумя моделями диаризации выполните из `app/`:

```powershell
npm.cmd run models:android -- --diarization-only
.\android\gradlew.bat -p android :app:assembleRelease '-PdiarizationOnly=true' '-PreactNativeArchitectures=arm64-v8a,x86_64'
```

APK появится в `android/app/build/outputs/apk/release/app-release.apk`. Он подходит для Redmi и эмулятора x86_64.

Для сборки под Redmi со всеми весами:

```powershell
npm.cmd run models:android
.\android\gradlew.bat -p android :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a'
```

## Контрольный WAV

Скрипт подготовки скачивает `models/downloads/1-two-speakers-en.wav`, 16 секунд, PCM 16 бит, моно, 16 кГц. Перенесите его в «Загрузки», установите APK и включите авиарежим. В приложении выберите файл и нажмите **Распознать запись**.
