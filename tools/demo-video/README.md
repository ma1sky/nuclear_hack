# Живая демонстрация приложения — Remotion

Основной entry: `src.jsx`, Composition **ProductDemo**. Результат: `artifacts/submission/demo-real.mp4`, 900×1600, 24 fps, около 167.71 с. **Весь видеоряд — реальные MP4 приложения**, без Img/скриншотов в композиции. Remotion монтирует действия и ожидание моделей; скорость монтажа видна на экране. Голос Microsoft Irina Desktop — синтезированный русский комментарий, не звук источника.

```powershell
npm ci
npm run render
```

При необходимости замените путь Chrome в package.json. В `public/real/` включены четыре исходных MP4, события с временами действий, WAV-озвучка, draft и финальный timeline. Для обычного рендера Android и модели не нужны.

Перезапись материала (нужен установленный APK на emulator-5556 и тестовый `recordings/ru-speed/ru-speed-aac60.m4a`): `capture_workflows.py import`, затем `player`, `result`, `recorder`. Видео захватывается через Android screenrecord, фактические касания отображаются системой. Скрипт не изменяет APK и не внедряет тестовую расшифровку. `build_timeline.py prepare` → `narrate.ps1` → `build_timeline.py finalize` пересобирает монтаж и голос. WAV уже включены, повторный синтез не требуется.

Старый обзор: `overview.jsx`, `npm run render:overview`; основной ролик его заменяет. Доказательства и SHA-256 — `artifacts/submission/video-real-verification.json`. Ссылки на готовое видео и исходный ZIP — в корневом README.
