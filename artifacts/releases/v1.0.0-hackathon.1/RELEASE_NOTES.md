# Нейро-стенографист — hackathon APK

Android release APK со встроенными JS и пятью файлами моделей. ABI: ARM64 и x86_64. Подписан тестовым Android debug key.

Проверено на Android-эмуляторе API 37: установка, первый запуск, подготовка моделей, импорт русского WAV, диаризация/ASR, история, строгий JSON и отдельное локальное резюме в авиарежиме. Подпись APK v2 и SHA-256 проверены.

Ограничения: в резюме наблюдались смысловые ошибки; Redmi, M4A, независимые WER/DER и многоголосый benchmark ещё не проверены. Это сборка для тестирования, не подтверждение полной приёмки.

Установка: скачать APK, разрешить установку из выбранного источника на своём Android-устройстве и установить. Интернет и Metro для запуска не нужны. Для эмулятора: `adb install -r nuclear-stenographer-1.0.0-arm64-x86_64.apk`.

Размер APK: 888 480 311 байт. SHA-256 опубликован в SHA256SUMS.txt.

- [Отчёт Android](https://github.com/ma1sky/nuclear_hack/blob/v1.0.0-hackathon.1/docs/android-smoke-2026-11-07.md)
- [Датасеты и оценка](https://github.com/ma1sky/nuclear_hack/blob/v1.0.0-hackathon.1/docs/test-datasets.md)
- [Дизайн-система](https://github.com/ma1sky/nuclear_hack/blob/v1.0.0-hackathon.1/docs/design-system.md)

Для первого прогона приложен русский `gigaam-example.wav` из официального модельного архива sherpa/GigaAM. Это smoke-пример, а не независимый benchmark.
