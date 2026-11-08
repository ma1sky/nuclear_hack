"""Build Remotion edits directly from timed actions in real screenrecord clips."""
from pathlib import Path
import json,subprocess,math,hashlib,argparse,wave
ROOT=Path(__file__).resolve().parents[2];PUBLIC=ROOT/'tools/demo-video/public';OUT=ROOT/'recordings/demo-real';FPS=24
PROBE=ROOT/'tools/demo-video/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe'
CHAPTERS=[('01-import-asr','Импорт и локальное распознавание'),('02-player','Плеер: позиция и скорость'),('03-export-history','Экспорт, имена и история'),('04-recorder','Диктофон и сохранение аудио')]
def duration(p):return float(json.loads(subprocess.check_output([str(PROBE),'-v','error','-show_format','-of','json',str(p)]))['format']['duration'])
def prepare():
 segments=[];sources=[]
 for index,(name,chapter) in enumerate(CHAPTERS):
  file=PUBLIC/'real'/(name+'.mp4');seconds=duration(file);meta=OUT/(name+'-events.json')
  if not meta.exists():meta=PUBLIC/'real'/(name+'-events.json')
  d=json.loads(meta.read_text(encoding='utf-8'));(PUBLIC/'real'/(name+'-events.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');events=d['events'];assert events and seconds>10
  if index==0:events=[dict(at_s=0,title='Нейро-стенографист: реальные действия в приложении',kind='intro')]+events
  for i,e in enumerate(events):
   start=max(0,e['at_s']-.12);end=min(seconds-.15,events[i+1]['at_s']-.12 if i+1<len(events) else seconds-.15)
   if end-start<.4:
    # screenrecord can omit the static hold after the last UI update; retain the actual ready screen.
    if i==len(events)-1:start=max(0,seconds-2.7);end=seconds-.1
    else:continue
   voice=f'real/voice-{len(segments):02d}.wav';speech=e['title'].replace('M4A','эм четыре а').replace('JSON','джейсон').replace('TXT','тэ икс тэ').replace('LLM','языковая модель').replace('1.25×','один двадцать пять').replace('1.5×','полтора раза').replace('2×','два раза')
   segments.append(dict(source='real/'+name+'.mp4',chapter=chapter,chapter_index=index+1,title=e['title'],kind=e['kind'],start_s=start,end_s=end,voice=voice,speech=speech))
  sources.append(dict(source='real/'+name+'.mp4',seconds=seconds,bytes=file.stat().st_size,sha256=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()))
 # Final limitations are narrated over the real ending of the recorder, never over a fake app screen.
 last=segments[-1];segments.append(dict(source=last['source'],chapter='Границы демонстрации',chapter_index=4,title='Эмулятор • качество речи и Redmi требуют отдельной проверки',kind='outro',start_s=max(0,last['end_s']-4),end_s=last['end_s'],voice=f'real/voice-{len(segments):02d}.wav',speech='Это демонстрация на эмуляторе. Реальный телефон и качество записи микрофона требуют отдельной проверки.'))
 (PUBLIC/'real/timeline-draft.json').write_text(json.dumps(dict(fps=FPS,sources=sources,segments=segments),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Prepared',len(segments),'real video segments')
def finalize():
 d=json.loads((PUBLIC/'real/timeline-draft.json').read_text(encoding='utf-8'));frame=0
 for s in d['segments']:
  with wave.open(str(PUBLIC/s['voice'])) as w:voice_seconds=w.getnframes()/w.getframerate()
  base=6 if s['kind']=='wait' else 1.5
  target=max((s['end_s']-s['start_s'])/base,voice_seconds+.45,2.5)
  s['duration_frames']=math.ceil(target*FPS);s['from_frame']=frame;frame+=s['duration_frames'];s['rate']=(s['end_s']-s['start_s'])/(s['duration_frames']/FPS);s['voice_seconds']=round(voice_seconds,3)
 d.update(total_frames=frame,seconds=frame/FPS,width=900,height=1600,description='All picture frames from Android screenrecord; editorial speed shown on screen; Russian synthetic commentary, source screen audio muted.')
 (PUBLIC/'real/timeline.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(dict(segments=len(d['segments']),frames=frame,seconds=frame/FPS),ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('step',choices=['prepare','finalize']);a=p.parse_args();{'prepare':prepare,'finalize':finalize}[a.step]()
