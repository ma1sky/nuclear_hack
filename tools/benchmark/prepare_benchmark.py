from pathlib import Path
import tarfile,json,subprocess,hashlib,shutil
import numpy as np
import soundfile as sf
import imageio_ffmpeg
root=Path(__file__).resolve().parents[2]; data=root/'recordings/benchmark'; cases=data/'cases'; cases.mkdir(exist_ok=True)
ff=imageio_ffmpeg.get_ffmpeg_exe(); rows=[]
def add(name,source,kind,rttm=None):
 path=cases/name
 with sf.SoundFile(path) as f: duration=len(f)/f.samplerate
 rows.append(dict(id=name.split('-')[0],file=str(path),duration_s=duration,kind=kind,source=source,rttm=str(rttm) if rttm else None,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
shutil.copyfile(root/'artifacts/test-audio/gigaam-example.wav',cases/'t01-baseline.wav'); add('t01-baseline.wav','sherpa/GigaAM example','model smoke, not independent')
sf.write(cases/'t02-silence.wav',np.zeros(160000),16000,subtype='PCM_16'); add('t02-silence.wav','generated silence','negative')
for i,rec in enumerate(['rec_0000','rec_0055','rec_0273','rec_0274'],3):
 shard=0 if int(rec[4:])<150 else 1
 with tarfile.open(data/f'ru-book-shard-{shard:04d}.tar') as tar:
  members={Path(m.name).name:m for m in tar}
  audio,sr=sf.read(tar.extractfile(members[rec+'.flac']))
  name=f't{i:02d}-{rec}.wav'; sf.write(cases/name,audio,sr,subtype='PCM_16')
  ref=cases/(rec+'.rttm'); ref.write_bytes(tar.extractfile(members[rec+'.rttm']).read())
 add(name,'https://huggingface.co/datasets/mexus/ru-book-mix-10h','synthetic audiobook mix',ref)
for i,episode,limit,ext in [(7,'01',120,'wav'),(8,'01',None,'m4a'),(9,'07',None,'wav'),(10,'17',None,'wav')]:
 name=f't{i:02d}-podcast{episode}.{ext}'; cmd=[ff,'-nostdin','-y','-v','error','-i',str(data/f'podcast-{episode}.mp3')]
 if limit: cmd+=['-t',str(limit)]
 cmd+=['-ar','16000','-ac','1']+(['-c:a','aac','-b:a','96k'] if ext=='m4a' else ['-c:a','pcm_s16le'])+[str(cases/name)]
 subprocess.run(cmd,check=True)
 if ext=='m4a':
  check=cases/'duration-check.wav'; subprocess.run([ff,'-y','-v','error','-i',str(cases/name),str(check)],check=True)
  with sf.SoundFile(check) as f: duration=len(f)/f.samplerate
  check.unlink(); rows.append(dict(id=f't{i:02d}',file=str(cases/name),duration_s=duration,kind='real podcast M4A',source='https://arzamas.academy/podcasts/333',rttm=None,sha256=hashlib.sha256((cases/name).read_bytes()).hexdigest()))
 else: add(name,'https://arzamas.academy/podcasts/333','real podcast'+(' excerpt' if limit else ' full episode'))
(data/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['id','duration_s','kind']} for r in rows],ensure_ascii=False),flush=True)
