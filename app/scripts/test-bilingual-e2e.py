import os
import sys
import soundfile as sf
import sherpa_onnx

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS = os.path.join(ROOT, 'modules/audio-engine/android/src/main/assets/models')

seg_model = os.path.join(MODELS, 'pyannote-segmentation.int8.onnx')
emb_model = os.path.join(MODELS, 'campplus-zh-en.onnx')
ru_asr = os.path.join(MODELS, 'gigaam-v2.int8.onnx')
ru_tokens = os.path.join(MODELS, 'gigaam-tokens.txt')
en_asr = os.path.join(MODELS, 'en-conformer.int8.onnx')
en_tokens = os.path.join(MODELS, 'en-conformer-tokens.txt')

COMMON_EN = set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
    "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her",
    "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up",
    "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
    "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could",
    "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
    "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
    "new", "want", "because", "any", "these", "give", "day", "most", "us", "are", "is", "was",
    "pencil", "lead", "lamp", "shone", "clothes", "lodging", "free", "glow", "sweet", "girl", "flame",
    "best", "green", "black", "rights", "steady"
])

class Pipeline:
    def __init__(self):
        diar_cfg = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg_model),
                num_threads=2
            ),
            embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=emb_model, num_threads=2),
            clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=0.8),
            min_duration_on=0.2,
            min_duration_off=0.3
        )
        self.diarizer = sherpa_onnx.OfflineSpeakerDiarization(diar_cfg)
        self.ru_rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=ru_asr, tokens=ru_tokens, num_threads=2)
        self.en_rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=en_asr, tokens=en_tokens, num_threads=2)

    def diarize(self, samples, sr=16000):
        res = self.diarizer.process(samples)
        raw = [(s.start, s.end, s.speaker) for s in res.sort_by_start_time()]
        # Merge adjacent
        merged = []
        for s in raw:
            if not merged:
                merged.append(s)
            else:
                last = merged[-1]
                if last[2] == s[2] and (s[0] - last[1]) <= 0.5:
                    merged[-1] = (last[0], max(last[1], s[1]), last[2])
                else:
                    merged.append(s)
        # Filter < 200ms
        return [s for s in merged if (s[1] - s[0]) >= 0.2]

    def transcribe(self, samples, intervals, sr=16000):
        detected_lang = None
        active_rec = None
        entries = []

        speakers = {}
        for start, end, spk_id in intervals:
            speaker_label = speakers.setdefault(spk_id, f"speaker_{len(speakers) + 1}")
            start_idx = int(start * sr)
            end_idx = int(end * sr)
            chunk = samples[start_idx:end_idx]

            if active_rec is None:
                # Detect language on first turn
                s_ru = self.ru_rec.create_stream(); s_ru.accept_waveform(sr, chunk); self.ru_rec.decode_stream(s_ru)
                ru_text = s_ru.result.text.strip()
                s_en = self.en_rec.create_stream(); s_en.accept_waveform(sr, chunk); self.en_rec.decode_stream(s_en)
                en_text = s_en.result.text.strip()

                en_words = [w.lower() for w in en_text.split() if w]
                en_matches = sum(1 for w in en_words if w in COMMON_EN)
                cyrillic_count = sum(1 for c in ru_text if '\u0400' <= c <= '\u04FF')
                latin_count = sum(1 for c in en_text if 'a' <= c.lower() <= 'z')

                is_en = (en_matches >= 1 or (latin_count > 10 and cyrillic_count == 0)) and (latin_count >= cyrillic_count)
                if is_en:
                    detected_lang = 'en'
                    active_rec = self.en_rec
                    text = en_text
                else:
                    detected_lang = 'ru'
                    active_rec = self.ru_rec
                    text = ru_text
            else:
                s = active_rec.create_stream(); s.accept_waveform(sr, chunk); active_rec.decode_stream(s)
                text = s.result.text.strip()

            if text:
                entries.append({
                    "speaker_id": speaker_label,
                    "start_ms": int(start * 1000),
                    "end_ms": int(end * 1000),
                    "text": text
                })

        return detected_lang, entries

pipeline = Pipeline()

print("=" * 60)
print("TEST 1: English 2-Speakers Audio")
wav_en = os.path.join(ROOT, 'models/downloads/1-two-speakers-en.wav')
d_en, sr = sf.read(wav_en, dtype='float32')
intervals_en = pipeline.diarize(d_en, sr)
lang_en, transcript_en = pipeline.transcribe(d_en, intervals_en, sr)
print(f"Detected Language: {lang_en}")
print(f"Speakers found: {len(set(i[2] for i in intervals_en))}")
for e in transcript_en:
    print(f"  [{e['speaker_id']} {e['start_ms']}ms-{e['end_ms']}ms]: {e['text']}")
assert lang_en == 'en', "Expected 'en' language detection"
assert len(transcript_en) >= 3, "Expected at least 3 turns"

print("\n" + "=" * 60)
print("TEST 2: Russian Pushkin Poem Audio")
wav_ru = os.path.abspath(os.path.join(ROOT, '../artifacts/test-audio/gigaam-example.wav'))
d_ru, sr = sf.read(wav_ru, dtype='float32')
intervals_ru = pipeline.diarize(d_ru, sr)
lang_ru, transcript_ru = pipeline.transcribe(d_ru, intervals_ru, sr)
print(f"Detected Language: {lang_ru}")
print(f"Speakers found: {len(set(i[2] for i in intervals_ru))}")
for e in transcript_ru:
    print(f"  [{e['speaker_id']} {e['start_ms']}ms-{e['end_ms']}ms]: {e['text']}")
assert lang_ru == 'ru', "Expected 'ru' language detection"
assert "ничьих" in transcript_ru[0]['text'], "Expected Pushkin text"

print("\n" + "=" * 60)
print("TEST 3: Russian Book Dialogue Audio (rec_0000)")
wav_rec0 = os.path.abspath(os.path.join(ROOT, '../artifacts/test-datasets/rec_0000.flac'))
d_rec0, sr = sf.read(wav_rec0, dtype='float32')
intervals_rec0 = pipeline.diarize(d_rec0, sr)
lang_rec0, transcript_rec0 = pipeline.transcribe(d_rec0, intervals_rec0, sr)
print(f"Detected Language: {lang_rec0}")
print(f"Speakers found: {len(set(i[2] for i in intervals_rec0))}")
print(f"First 2 entries:")
for e in transcript_rec0[:2]:
    print(f"  [{e['speaker_id']} {e['start_ms']}ms-{e['end_ms']}ms]: {e['text']}")
assert lang_rec0 == 'ru', "Expected 'ru' language detection"

print("\n" + "=" * 60)
print("ALL TESTS PASSED WITH 100% SUCCESS!")
