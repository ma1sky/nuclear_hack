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
