# Android benchmark: 10 записей

Windows, Python 3.12, curl, Android SDK/adb, запущенный emulator-5554 (либо задайте ANDROID_SERIAL для подключённого телефона). Установить release APK v1.0.0-hackathon.1 и дождаться подготовки моделей. Скрипт управляет настоящим интерфейсом приложения; эмулятор должен оставаться доступным. Данные сохраняются в игнорируемом Git каталоге recordings/benchmark.

Из корня репозитория (PowerShell):

```powershell
python -m venv recordings/benchmark/env
./recordings/benchmark/env/Scripts/python.exe -m pip install -r tools/benchmark/requirements.txt
# При необходимости: $env:NUCLEAR_BUILD_PROXY='http://127.0.0.1:7890'
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/download_benchmark_inputs.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/prepare_benchmark.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/add_golos_case.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/verify_scoring.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_android_benchmark.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/score_benchmark.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/publish_metrics.py
```

Обязательно выполнить add_golos_case.py после prepare: он заменяет служебный model smoke независимым Golos с ручным эталоном. Доступность публичных URL может измениться. Подготовка требует места под исходники, WAV и Python-зависимости. Исходный MP3 преобразуется в mono 16 kHz; M4A повторно кодируется AAC. Это проверяет конкретные подготовленные файлы, а не все параметры кодеков.

Результаты с тем же SHA-256 пропускаются; для повторного измерения переместите соответствующий results/tXX.json. Ошибки автоматизации архивируются и повторяются; они не считаются ошибками ASR. После каждого файла процесс приложения запускается заново. Это не тест утечки памяти между обработками. Время включает опрос UI и получение результата; в ранних замерах t03–t08 JSON читался во время LLM, что отражено в completion_scope публичного отчёта; память — максимум выборок PSS, не настоящий пик. Короткие стадии могут пропускаться при опросе.

WER рассчитан только для короткого Golos; DER только для четырёх ru-book с RTTM, по итоговым интервалам приложения, с учётом перекрытий, без collar, шаг 10 мс, оптимальное взаимно однозначное сопоставление speaker ID. Проверка структуры включает названия полей, типы и границы меток. Для подкастов ручного эталона нет: число слов и кластеров не доказывает точность. t07 входит в t08, это 10 файлов, но не 10 независимых источников.

tune_diarization.py и validate_threshold.py — отдельная диагностика на ПК с теми же ONNX-моделями. Она не меняет APK и не подтверждает скорость на Android. Повышение threshold уменьшает число кластеров, но может объединять разных людей.

Источники и ограничения публикации приведены в docs/podcast-benchmark-2026-11-07.md. Не коммитьте записи и полные расшифровки подкастов. Публичный отчёт содержит только агрегаты, источники и хеши.

Публикуемые метаданные привязаны к release v1.0.0-hackathon.1 и его SHA-256. При проверке другой сборки сначала обновите сведения об APK и используйте отдельное имя отчёта, чтобы сохранить исходный baseline.

## Отдельная серия для нового APK

Перед новой Android-регрессией установите проверяемый APK и задайте:

```powershell
$env:BENCHMARK_RESULT_SET='candidate-20261107'
$env:BENCHMARK_CASE_IDS='t01,t02,t04'
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_android_benchmark.py
```

Результаты будут в recordings/benchmark/results-candidate-20261107. Без BENCHMARK_CASE_IDS выполняются все файлы; baseline использует исходный results. Сравнивайте и публикуйте новую серию с правильным SHA-256 APK: старый publish_metrics.py привязан к исходному baseline. Не переименовывайте новый результат в старый.

## DER study: подбор и отложенная проверка

`der_study.py prepare` формирует 4 development + 6 новых синтетических русских WAV с непересекающимися идентификаторами голосов. Требуются два скачанных ru-book shard. Повторная подготовка поверх существующего manifest запрещена. `prepare_vox_validation.py` добавляет первые 6 записей первого Parquet-шарда публичного зеркала VoxConverse, обрезает их до 120 секунд и скачивает оригинальные RTTM авторов. Время и эталоны обрезаются одинаково. Исходный Parquet и модель должны лежать в recordings/benchmark/der-study; URL/хеши приведены в отчёте исследования. Требуется pyarrow из requirements.

Порядок после подготовки: `der_study.py sweep`, затем `model`, `freeze`, `validate`. WeSpeaker ResNet34 кладётся как wespeaker_en_voxceleb_resnet34.onnx в каталог исследования, не в рабочий комплект приложения. `freeze` выбирает по development один вариант каждого семейства и фиксирует baseline до первого запуска на holdout. Повторная фиксация запрещена. Все результаты возобновляемы по ключу из хешей модели, входа, эталона и параметров. Во время записи результатов одновременно запускается только один процесс исследования.

Scorer использует точное полиномиальное сопоставление голосов, включая случаи с большим числом кластеров. Его результаты проверены против полного перебора на малых матрицах и прежних четырёх опубликованных DER. Корпуса здесь предназначены только для оценки и выбора параметров; модели не дообучаются. Англоязычная естественная речь не заменяет русские подкасты с ручной разметкой.

## Полная Android-регрессия выбранного DER-кандидата

После сборки и `adb install -r app/android/app/build/outputs/apk/release/app-release.apk` запустите `python tools/benchmark/run_der_android_regression.py` из изолированной среды. Helper сверяет SHA-256 установленного APK, сравнивает JS-бандл с APK опубликованного baseline-релиза, включает авиарежим/выключает Wi-Fi и выполняет 10 полных сценариев с LLM, 3 повтора одним процессом и отмену резюме. В finally восстанавливает предыдущие значения радиосвязи. При аварийном завершении среды исходные значения находятся в recordings/benchmark/der-study/android-run-state.json; их нужно восстановить перед завершением работы.

Все серии разделены по SHA-256 APK и сценарию, исходный results не перезаписывается. Сбор агрегатов только после окончания: `python tools/benchmark/publish_der_android.py`. Скриншоты и полные расшифровки остаются локальными. Повторы PSS — проверка стабильности, не доказательство отсутствия утечек. Отмена проверяется во время LLM, не во время всей длинной диаризации.

Для UI-сравнения нужен скачанный baseline APK из GitHub Release v1.0.0-hackathon.1 по пути artifacts/releases/v1.0.0-hackathon.1/nuclear-stenographer-1.0.0-arm64-x86_64.apk. Альтернативный эталон задаётся BENCHMARK_BASELINE_APK. Путь нового сохранённого APK задаётся BENCHMARK_APK_PATH; по умолчанию используется Android build output. В зафиксированном прогоне использован сохранённый кандидат 5825896 с тем же JS-бандлом.


## Русская проверка окон и раннего показа текста (8 ноября)

После подготовки прежних benchmark inputs и der-study:

```powershell
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/prepare_ru_speed.py
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_ru_speed.py --variant optimized --apk artifacts/emulator/nuclear-stenographer-ru-speed-v2.apk
```

Нужен разблокированный emulator-5556 с уже установленным указанным APK; скрипт сверяет SHA-256. Авиарежим включается перед серией. Скрипт выполняет записи последовательно одним процессом приложения, отдельно измеряет появление текста и завершение резюме. `--ids` выбирает случаи из manifest, `--variant` должен отличаться у разных сборок. Перед повтором сохраните прежний каталог варианта.

Три размеченных теста — 60-секундные синтетические русские смеси, повторённые трижды с сохранением эталонных speaker ID. Два подкаста не имеют ручного эталона; WER/DER для них не вычисляется. Короткий Golos имеет эталон текста из шести слов. По данным этих тестов нельзя заявлять качество на произвольных часовых подкастах.

`recordings/ru-speed/results` содержит локальные полные результаты, JSON и скриншоты. В Git остаются агрегаты в `artifacts/test-results/ru-speed-2026-11-08` и отчёт `docs/ru-optimization-2026-11-08.md`. Полные тексты подкастов не публикуются. DER считается по итоговому экспорту (не только по выходу диаризатора), overlap включён, collar 0, шаг 10 мс; дополнительно считается DER без неопределённых реплик, учитываемых как пропущенная речь. Память — максимум выборок PSS, не инструментированный пик. Время включает опрос UI; один прогон не даёт статистической гарантии ускорения.

`calibrate_ru_linker.py` проверяет ПК-признаки через настоящий Kotlin GlobalSpeakerLinker и fixture runner. Часть evaluation-примеров была исследована при отладке: это регрессия, не слепой holdout. Пороги нативной кластеризации (cosine distance) и сопоставления (cosine similarity) имеют разный смысл.


## Сравнение TitaNet, потоков и LLM (8 ноября)

Точный протокол, качество и регрессии: `docs/runtime-options-2026-11-08.md`. Прерванные подборы не считаются проверкой качества. Не перезаписывайте опубликованные baseline; перед повтором сохраните каталог соответствующей серии.

Подготовка требует прежних benchmark inputs, двух ru-book shard и manifest `der-study`. Для обоих extractor сначала выполните `npm run models:android` из `app/` с профилями `titanet` и `eres2net`, затем верните `titanet` и выполните `models:pack`. Оба исходных веса остаются в `app/models/bundles/full/models`; APK содержит только выбранный. Для ПК-эксперимента скопируйте TitaNet в `recordings/runtime-options/models/nemo_en_titanet_small.onnx`.

```powershell
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/runtime_options.py prepare
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/runtime_options.py screen
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/runtime_options.py evaluate
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/runtime_options.py threads
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/runtime_options.py asr
./tools/benchmark/build-native-runtime.ps1
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_native_runtime.py screen
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_native_runtime.py match-dev
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_native_runtime.py match-check
./recordings/benchmark/env/Scripts/python.exe tools/benchmark/run_native_runtime.py asr
```

Для native нужен собранный APK по пути `artifacts/emulator/nuclear-stenographer-runtime-optimized.apk` (или параметр `-ReferenceApk`), AAR sherpa 2.0.1 и SDK/JBR. Kotlin-компиляция использует производственные классы; DEX запускается через app_process с Java-кучей 192 МиБ. `-Serial` и `-Abi arm64-v8a` у сборщика позволяют подготовить библиотеки телефона, но текущие измерения получены только на emulator-5556, x86_64. Перед ARM-запуском также укажите правильный serial в runner; интерфейс приложения этим способом не тестируется.

Проверка LLM использует официальный `llama-b12198-bin-win-cpu-x64.zip` из ggml-org/llama.cpp, SHA-256 `b63d6d05a00fd109d284341e5388274ca5b4ffacd0503d4fe9fbdc24a00648c1`. Распакуйте в `recordings/runtime-options/llama-cli`, сохраните источник в source.json, затем запустите `compare_summary_limits.py`. Примеры авторские, факты заданы в `summary_fixtures.json`. Это сравнение на ПК, не замер llama.rn Android.

После полной UI-серии `run_ru_speed.py --variant titanet-final --apk ...` проверка отмены воспроизводится `run_summary_cancel.py`; для неё нужна сохранённая последняя запись `ru-speed-podcast-b.wav`. Сбор агрегатов: `publish_runtime_options.py`. Полные расшифровки и скриншоты остаются в recordings, в Git публикуются только метрики и авторские LLM-примеры.
