# Remotion: видеодемонстрация

Remotion 4.0.541, React 19.3.1. Композиция `Submission`, 1280×720, 24 fps, 2712 кадров / 113 секунд. 18 разделов. Реальные PNG и Android screenrecord находятся в public; OffthreadVideo использует ускорение ×3 с явной подписью. Звуковой дорожки нет. Модели/ASR в ролике не имитируются; статичные кадры и монтаж не являются замером времени.

```powershell
npm ci
npm run render
```

Укажите установленный Chrome через `--browser-executable` в package.json. MP4 создаётся в artifacts/submission/demo.mp4. Он вложен в GitHub Release, ссылка в корневом README. Публичные кадры показывают только тестовые записи, не пользовательские приватные разговоры. Справка: https://www.remotion.dev/docs/cli/render .
