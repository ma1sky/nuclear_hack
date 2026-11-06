import { TranscriptExport } from '../types/transcript';

/**
 * Benchmark test transcript matching the theme of Nuclear IT Hack (Котовице, заседание котиков).
 * Strictly complies with Page 15 JSON schema.
 */
export const MOCK_TRANSCRIPT: TranscriptExport = {
  transcript: [
    {
      speaker_id: 'speaker_1',
      start_ms: 1250,
      end_ms: 4380,
      text: 'Добрый день, коллеги! Начинаем секретное заседание Совета Котовице.',
    },
    {
      speaker_id: 'speaker_2',
      start_ms: 4800,
      end_ms: 8120,
      text: 'Здравствуйте! На повестке дня проект M.O.U.S.E. и безопасность запасов валерьянки.',
    },
    {
      speaker_id: 'speaker_3',
      start_ms: 8500,
      end_ms: 11950,
      text: 'А также защита пиццы от посягательств мышей. Датчики движения уже установлены.',
    },
    {
      speaker_id: 'speaker_1',
      start_ms: 12300,
      end_ms: 15400,
      text: 'Отлично. Протокол заседания формируется автоматически нашим нейро-стенографистом.',
    },
    {
      speaker_id: 'speaker_2',
      start_ms: 15850,
      end_ms: 19200,
      text: 'Все этапы обработки и диаризация выполняются локально на мобильном устройстве.',
    },
    {
      speaker_id: 'speaker_3',
      start_ms: 19600,
      end_ms: 22800,
      text: 'Полная конфиденциальность соблюдена, подключение к сети отключено.',
    },
  ],
};

export const MOCK_SUMMARY =
  '• Открыто секретное заседание Совета Котовице по проекту M.O.U.S.E.\n• Утверждены меры по охране пиццы и стратегических запасов валерьянки.\n• Подтверждена локальная работа нейро-стенографиста без использования внешних облачных сервисов.';

export const DEFAULT_SPEAKER_NAMES: Record<string, string> = {
  speaker_1: 'Кот Генерал (speaker_1)',
  speaker_2: 'Кот Аналитик (speaker_2)',
  speaker_3: 'Кот Спецагент (speaker_3)',
};
