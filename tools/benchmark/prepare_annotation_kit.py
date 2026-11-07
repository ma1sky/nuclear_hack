"""Create Russian podcast clips for human annotation. No automatic gold labels."""
from pathlib import Path
import hashlib,json,subprocess
import imageio_ffmpeg,soundfile as sf

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'recordings/benchmark'; OUT=DATA/'annotation-kit'
OUT.mkdir(exist_ok=True)
rows=[]
for episode in ['01','07','17']:
    for offset,label in [(0,'intro'),(120,'body')]:
        identifier=f'podcast-{episode}-{label}'
        wav=OUT/(identifier+'.wav')
        if not wav.exists():
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-ss',str(offset),'-i',str(DATA/f'podcast-{episode}.mp3'),'-t','120','-ar','16000','-ac','1','-c:a','pcm_s16le',str(wav)],check=True)
        with sf.SoundFile(wav) as audio: duration=len(audio)/audio.samplerate
        template=OUT/(identifier+'.annotation.json')
        if not template.exists():
            template.write_text(json.dumps(dict(status='unannotated',segments=[],instructions='Human annotation required. start_s/end_s are relative to this clip, not the original episode. Do not use model predictions as reference.'),ensure_ascii=False,indent=2),encoding='utf-8')
        rows.append(dict(id=identifier,file=wav.name,annotation=template.name,duration_s=duration,original_offset_s=offset,source='https://arzamas.academy/podcasts/333',sha256=hashlib.sha256(wav.read_bytes()).hexdigest(),ground_truth_available=False))
(OUT/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'README.md').write_text('''# Ручная разметка русских подкастов

Шесть фрагментов по 2 минуты, без готового эталона. Все speaker ID определяет человек после прослушивания. Не копируйте предсказания приложения как ground truth.

Для каждого фрагмента заполните segments в соответствующем annotation.json объектами с полями speaker_id, start_s, end_s, text. Метки относятся к началу фрагмента; смещение в исходном выпуске записано отдельно в manifest. При возвращении того же голоса используйте прежний ID. При одновременной речи создавайте отдельные перекрывающиеся интервалы; не заставляйте голоса идти последовательно. Музыка, тишина и шум не являются участниками. text нужен для отдельной оценки WER; не исправляйте смысл и сохраняйте реально произнесённые слова.

Второй человек проверяет принадлежность, границы и текст. Только после этого поставьте status=verified и укажите проверившего локально. До проверки эти файлы не подключаются к исследованию и по ним не вычисляются WER/DER. Аудио и полные тексты остаются в recordings/benchmark, в Git публикуются лишь агрегаты и хеши.
''',encoding='utf-8')
print('Prepared six unannotated Russian podcast clips; no gold labels fabricated')
