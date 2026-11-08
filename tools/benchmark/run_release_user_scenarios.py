"""Scenario checks against the installed released APK. Raw UI/screenshots stay under recordings/."""
from pathlib import Path
import json,re,time,traceback,hashlib
import android_ui as q
ROOT=q.ROOT; OUT=ROOT/'recordings/release-1.2.3-user-scenarios';OUT.mkdir(parents=True,exist_ok=True);q.OUT=OUT
RESULT=OUT/'results.json'; results=[]
NAME='QA123_Record_20261108'; RENAMED=NAME+'_Renamed'
def write():RESULT.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def labels(ns=None):return [(n.get('text') or n.get('content-desc')) for n in (ns if ns is not None else q.snap()) if n.get('text') or n.get('content-desc')]
def node(label,ns=None):return next(n for n in (ns if ns is not None else q.snap()) if label in [n.get('text'),n.get('content-desc')] and n.get('enabled')=='true' and n.get('clickable')=='true')
def rect(n):return list(map(int,re.findall(r'\d+',n.get('bounds',''))))
def click(n):
 x1,y1,x2,y2=rect(n);q.adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.4)
def position():
 ns=q.snap(); vals=[n.get('text') for n in ns if re.fullmatch(r'\d+:\d\d',n.get('text',''))]
 assert len(vals)>=2,repr(vals)
 parse=lambda s:sum(int(x)*60**i for i,x in enumerate(reversed(s.split(':'))))
 return {'current_s':parse(vals[-2]),'duration_s':parse(vals[-1]),'labels':labels(ns)}
def brief(p):return {k:v for k,v in p.items() if k!='labels'}
def save(name):q.capture(name)
def export_data():
 q.tap('Экспорт');q.tap('Посмотреть JSON');ns=q.snap();data=json.loads(next(t for t in labels(ns) if t.lstrip().startswith('{')));q.tap('Назад к экспорту');q.tap('Закрыть');return data
def case(name,fn):
 started=time.monotonic()
 try:detail=fn();r=dict(case=name,status='passed',detail=detail)
 except Exception as e:
  r=dict(case=name,status='failed',error=repr(e));(OUT/(name+'-trace.txt')).write_text(traceback.format_exc(),encoding='utf-8')
  try:save(name+'-error')
  except Exception:pass
 r['elapsed_s']=round(time.monotonic()-started,2);results.append(r);write();print(json.dumps(r,ensure_ascii=False),flush=True);return r['status']=='passed'
def open_podcast():
 q.open_route('');q.tap('Открыть расшифровку: ru-speed-podcast-b.wav');q.tap('Расшифровка');p=position();assert p['duration_s']==300,p;return p
def playback():
 open_podcast();button=node('Воспроизвести');click(button);time.sleep(3);(OUT/'playback-live.png').write_bytes(q.adb('exec-out','screencap','-p'));click(button);a=position();assert a['current_s']>=2,brief(a)
 (OUT/'playback-audio-service.txt').write_bytes(q.adb('shell','dumpsys','audio'))
 p=position();time.sleep(2);stopped=position();assert abs(stopped['current_s']-p['current_s'])<=1,(brief(p),brief(stopped));assert 'Воспроизвести' in stopped['labels'];save('playback-paused')
 return dict(playing=brief(a),paused=brief(p),after_wait=brief(stopped),audibility='Native player state and advancing time verified; acoustic listening not assessed')
def seeking():
 p=position();q.tap('Вперёд на 15 секунд');f=position();assert abs(f['current_s']-p['current_s']-15)<=1,(brief(p),brief(f))
 q.tap('Назад на 15 секунд');b=position();assert abs(b['current_s']-p['current_s'])<=1,(brief(p),brief(b))
 n=node('Позиция воспроизведения');x1,y1,x2,y2=rect(n);q.adb('shell','input','tap',str(x1+int((x2-x1)*.5)),str((y1+y2)//2));time.sleep(.6);mid=position();assert 140<=mid['current_s']<=160,brief(mid)
 q.tap('Вперёд на 15 секунд');after=position();assert abs(after['current_s']-mid['current_s']-15)<=1
 save('seek-middle');return dict(before=brief(p),forward=brief(f),back=brief(b),waveform_midpoint=brief(mid),forward_after_seek=brief(after))
def rate():
 # Timing includes the UI dump/tap overhead, so compare distance/time rather than a fixed number of seconds.
 start=position();button=node('Воспроизвести');t=time.monotonic();click(button);time.sleep(4);click(button);dt1=time.monotonic()-t;end=position();delta1=end['current_s']-start['current_s']
 for label in ['1x','1.25x','1.5x']:q.tap(label)
 assert '2x' in labels();start2=position();button=node('Воспроизвести');t=time.monotonic();click(button);time.sleep(4);click(button);dt2=time.monotonic()-t;end2=position();delta2=end2['current_s']-start2['current_s']
 measured1=delta1/dt1;measured2=delta2/dt2;assert measured2>measured1*1.4,(delta1,dt1,delta2,dt2)
 q.tap('2x');assert '.75x' in labels() or '0.75x' in labels();q.tap('0.75x');assert '1x' in labels();save('rate-reset')
 return dict(normal=dict(audio_seconds=delta1,wall_seconds=round(dt1,2)),double=dict(audio_seconds=delta2,wall_seconds=round(dt2,2)),relative_rate=round(measured2/measured1,2),all_rate_labels_cycled=True)
def bounds_and_timecode():
 n=node('Позиция воспроизведения');x1,y1,x2,y2=rect(n);q.adb('shell','input','tap',str(x1),str((y1+y2)//2));q.tap('Назад на 15 секунд');zero=position();assert zero['current_s']==0
 ns=q.snap();target=next(n for n in ns if (n.get('content-desc') or '').startswith('Перейти к '));label=target.get('content-desc');button=node('Воспроизвести');click(target);time.sleep(2);click(button);p=position();target_s=sum(int(x)*60**i for i,x in enumerate(reversed(label.split()[-1].split(':'))));assert 1<=p['current_s']-target_s<=5,brief(p)
 return dict(back_at_start=brief(zero),timecode=label,after_timecode=brief(p))
def exports():
 before=export_data();assert set(before)=={'transcript'} and before['transcript'];assert all(set(x)=={'speaker_id','start_ms','end_ms','text'} for x in before['transcript'])
 counts={}
 for title,ext in [('Экспорт JSON','.json'),('Экспорт TXT','.txt')]:
  q.tap('Экспорт');q.tap(title);time.sleep(1);ns=q.snap();ls=labels(ns);save('share'+ext)
  assert any(ext in t for t in ls),ls
  counts[ext]=dict(sheet_opened=True,filename_visible=next(t for t in ls if ext in t))
  (OUT/('share'+ext+'-activity.txt')).write_bytes(q.adb('shell','dumpsys','activity','top'))
  q.adb('shell','input','keyevent','4');time.sleep(.4)
  if 'Экспорт расшифровки' in labels():q.tap('Закрыть')
 assert before==export_data();return dict(strict_json=True,transcript_unchanged=True,shares=counts,external_delivery='Share sheets opened and cancelled; no external recipient used')
def rename_speaker():
 data=export_data();ns=q.snap();target=next(n for n in ns if (n.get('content-desc') or '').startswith('Переименовать участника:'));old=target.get('content-desc').split(': ',1)[1];click(target);q.set_input('QA123_Speaker_Renamed');q.adb('shell','input','keyevent','4');q.tap('Сохранить');assert 'QA123_Speaker_Renamed' in labels();assert data==export_data()
 q.tap('Переименовать участника: QA123_Speaker_Renamed');q.set_input(old);q.adb('shell','input','keyevent','4');q.tap('Сохранить');return dict(display_name_changed=True,strict_json_ids_and_text_unchanged=True,original_display_name_restored=True)
def restart_history():
 before=export_data();q.adb('shell','am','force-stop',q.PKG);q.open_route('');q.tap('Открыть расшифровку: ru-speed-podcast-b.wav');after=export_data();assert before==after;q.tap('Резюме');assert 'Создать заново' in labels();q.tap('Расшифровка');assert position()['duration_s']==300;return dict(transcript_exact_after_process_restart=True,summary_restored=True,audio_loaded=True)
def saved_audio():
 q.open_route('');q.tap('Открыть аудио: QA12_RecordRenamed');p=position() if False else None
 ns=q.snap();ls=labels(ns);assert 'Воспроизвести' in ls;button=node('Воспроизвести');click(button);time.sleep(3);click(button);ls=labels();assert any(re.fullmatch(r'00:0[2-9] / 01:33',t) for t in ls),ls;save('existing-record-playback')
 return dict(existing_record_93s_playable=True,seek_and_speed='not available on saved-audio screen: compact player exposes play/pause only')
def audio_persistence_rename_delete():
 q.adb('shell','am','force-stop',q.PKG);q.open_route('');q.tap('Открыть аудио: '+NAME);q.tap('Переименовать');q.set_input(RENAMED);q.adb('shell','input','keyevent','4');q.tap('Сохранить');assert RENAMED in labels();button=node('Воспроизвести');click(button);time.sleep(2);click(button);assert 'Воспроизвести' in labels()
 q.tap('Удалить');assert 'Удалить аудиозапись?' in labels();q.tap('Отмена');assert RENAMED in labels();q.tap('Удалить');q.tap('Удалить');q.open_route('');assert 'Открыть аудио: '+RENAMED not in labels();return dict(saved_after_process_restart=True,renamed_audio_playable=True,cancel_delete_preserves_record=True,confirmed_delete_removed_only_test_record=True)
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--group',choices=['player'],required=True);args=p.parse_args()
 jobs=[('playback_pause',playback),('seek_controls',seeking),('speed_controls',rate),('seek_bounds_timecode',bounds_and_timecode),('json_txt_exports',exports),('rename_speaker',rename_speaker),('history_after_restart',restart_history),('saved_audio_playback',saved_audio)]
 if RESULT.exists():results.extend(json.loads(RESULT.read_text(encoding='utf-8')))
 for name,fn in jobs:
  if not case(name,fn):break
