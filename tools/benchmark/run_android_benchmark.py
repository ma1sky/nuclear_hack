from pathlib import Path
import subprocess,time,json,xml.etree.ElementTree as ET,re,traceback,os
ROOT=Path(__file__).resolve().parents[2]; DATA=ROOT/'recordings/benchmark'
RESULT_SET=os.environ.get('BENCHMARK_RESULT_SET','baseline')
if not re.fullmatch(r'[a-zA-Z0-9_-]+',RESULT_SET): raise ValueError('Invalid benchmark result set')
OUT=DATA/('results' if RESULT_SET=='baseline' else 'results-'+RESULT_SET); OUT.mkdir(exist_ok=True)
ADB=str(Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))/'platform-tools/adb.exe'); PKG='team.hex.nuclearstenographer'
SERIAL=os.environ.get('ANDROID_SERIAL','emulator-5554')
APK_SHA=os.environ.get('BENCHMARK_APK_SHA256')
REUSE=os.environ.get('BENCHMARK_REUSE_PROCESS')=='1'
CANCEL_STAGE=os.environ.get('BENCHMARK_CANCEL_STAGE')

def adb(*args,timeout=60):
 p=subprocess.run([ADB,'-s',SERIAL,*args],capture_output=True,timeout=timeout)
 if p.returncode: raise RuntimeError(p.stderr.decode(errors='replace')[-400:])
 return p.stdout.decode('utf-8',errors='replace')
def snap():
 adb('shell','uiautomator','dump','/sdcard/bench-window.xml')
 return list(ET.fromstring(adb('shell','cat','/sdcard/bench-window.xml')).iter('node'))
def texts(nodes): return [n.get('text','') for n in nodes if n.get('text')]
def find(nodes,label):
 for n in nodes:
  if label in (n.get('text'),n.get('content-desc')) and n.get('enabled')=='true':
   b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
   if len(b)==4 and b[2]>b[0] and b[3]>b[1]: return b
def tap(nodes,label):
 b=find(nodes,label)
 if not b: raise RuntimeError('Missing control: '+label)
 adb('shell','input','touchscreen','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2)); time.sleep(1)
def choose(row):
 nodes=snap()
 if 'Просмотр JSON' in texts(nodes): tap(nodes,'Закрыть'); nodes=snap()
 for attempt in range(8):
  label=next((l for l in ['Выбрать другую запись','Выбрать запись'] if find(nodes,l)),None)
  if label: break
  adb('shell','input','touchscreen','swipe','500','600','500','1900','300'); nodes=snap()
 if not label: raise RuntimeError('Cannot reach import control')
 tap(nodes,label); nodes=snap()
 # Android DocumentsUI: search only for the unique benchmark ID.
 tap(nodes,'Search'); time.sleep(2); nodes=snap()
 field=next((n for n in nodes if any(k in n.get('class','') for k in ['EditText','AutoCompleteTextView'])),None)
 if field is None: raise RuntimeError('No search field: '+str([(n.get('text'),n.get('content-desc'),n.get('class')) for n in nodes]))
 b=list(map(int,re.findall(r'\d+',field.get('bounds','')))); adb('shell','input','touchscreen','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2)); nodes=snap()
 if not any(any(k in n.get('class','') for k in ['EditText','AutoCompleteTextView']) and n.get('focused')=='true' for n in nodes): raise RuntimeError('Search field not focused after explicit tap')
 adb('shell','input','text',row['id']); adb('shell','input','keyevent','66'); time.sleep(2)
 nodes=snap(); tap(nodes,Path(row['file']).name)
 nodes=snap()
 if Path(row['file']).name not in texts(nodes): raise RuntimeError('File not selected')
 tap(nodes,'Расшифровать')
def capture(name):
 adb('shell','screencap','-p','/sdcard/bench.png'); adb('pull','/sdcard/bench.png',str(OUT/(name+'.png')))
manifest=DATA/os.environ.get('BENCHMARK_MANIFEST','manifest.json')
if not manifest.resolve().is_relative_to(DATA.resolve()): raise ValueError('Manifest outside benchmark directory')
rows=json.loads(manifest.read_text(encoding='utf-8'))
if os.environ.get('BENCHMARK_CASE_IDS'):
 requested=set(os.environ['BENCHMARK_CASE_IDS'].split(','))
 if requested-{row['id'] for row in rows}: raise ValueError('Unknown benchmark case IDs')
 rows=[row for row in rows if row['id'] in requested]
for p in list(OUT.glob('*.json')):
 if json.loads(p.read_text(encoding='utf-8'))['status']=='automation_error':
  archive=OUT/'automation-attempts'; archive.mkdir(exist_ok=True); p.rename(archive/(str(time.time_ns())+'-'+p.name))
adb('shell','am','start','-W','-n',PKG+'/.MainActivity')
for case_index,row in enumerate(rows):
 resultfile=OUT/(row['id']+'.json')
 if resultfile.exists():
  previous=json.loads(resultfile.read_text(encoding='utf-8'))
  if not REUSE and previous['status']=='completed' and previous['case']['sha256']==row['sha256'] and previous.get('apk_sha256')==APK_SHA: continue
  archive=OUT/'superseded-inputs'; archive.mkdir(exist_ok=True); resultfile.rename(archive/(str(time.time_ns())+'-'+resultfile.name))
 result={'case':row,'status':'running','started':time.time(),'stages':[],'sampled_peak_pss_kb':0,'apk_sha256':APK_SHA,'cancel_requested':False}
 try:
  if not REUSE or case_index==0:
   adb('shell','am','force-stop',PKG); adb('shell','am','start','-W','-n',PKG+'/.MainActivity'); time.sleep(3)
  result['process_pid']=adb('shell','pidof',PKG).strip()
  adb('push',row['file'],'/sdcard/Download/'+Path(row['file']).name)
  choose(row); start=time.monotonic()
  while time.monotonic()-start<2400:
   nodes=snap(); ts=texts(nodes); labels=[n.get('content-desc','') for n in nodes]
   stage=next((t for t in ts if t in ['Подготовка записи','Определение участников','Распознавание речи','Создание резюме','Сохранение']),None)
   if stage and (not result['stages'] or result['stages'][-1]['name']!=stage): result['stages'].append({'name':stage,'elapsed_s':round(time.monotonic()-start,2)})
   mem=adb('shell','dumpsys','meminfo',PKG); match=re.search(r'TOTAL PSS:\s*(\d+)',mem)
   if match: result['sampled_peak_pss_kb']=max(result['sampled_peak_pss_kb'],int(match[1]))
   (DATA/'status.json').write_text(json.dumps({'case':row['id'],'elapsed_s':round(time.monotonic()-start),'stage':stage},ensure_ascii=False),encoding='utf-8')
   if CANCEL_STAGE and stage==CANCEL_STAGE and not result['cancel_requested']:
    if not find(nodes,'Отменить обработку'):
     adb('shell','input','touchscreen','swipe','500','1800','500','700','300'); nodes=snap()
    if find(nodes,'Отменить обработку'):
     tap(nodes,'Отменить обработку'); result['cancel_requested']=True; result['cancel_at_s']=round(time.monotonic()-start,2)
    continue
   if 'Закрыть сообщение об ошибке' in labels and result['cancel_requested'] and re.search(r'отмен|cancel',' '.join(ts),re.I):
    result.setdefault('cancellation_ui',[]).append(ts); tap(nodes,'Закрыть сообщение об ошибке'); continue
   if 'Закрыть сообщение об ошибке' in labels:
    result.update(status='app_error',ui_text=ts); capture(row['id']+'-error'); break
   ready=any(n.get('class')=='android.widget.Button' and n.get('content-desc') in ['Расшифровать','Обновить резюме'] and n.get('enabled')=='true' for n in nodes) and 'Отменить обработку' not in ts
   if 'Речь не обнаружена' in ts and ready:
    result.update(status='completed',transcript={'transcript':[]},summary=None); capture(row['id']); break
   if find(nodes,'Посмотреть JSON') and ready:
    result['summary_and_ui']=ts; capture(row['id']); tap(nodes,'Посмотреть JSON'); nodes=snap()
    for dialog_attempt in range(5):
     exported=next((t for t in texts(nodes) if t.lstrip().startswith('{')),None)
     if exported: break
     nodes=snap()
    if not exported: raise RuntimeError('JSON dialog did not expose transcript')
    result.update(status='completed',transcript=json.loads(exported))
    tap(nodes,'Закрыть'); break
   if not adb('shell','pidof',PKG).strip(): result['status']='process_died'; break
   time.sleep(5)
  else: result['status']='timeout'
  idle=adb('shell','dumpsys','meminfo',PKG); idle_match=re.search(r'TOTAL PSS:\s*(\d+)',idle)
  result['idle_pss_kb']=int(idle_match[1]) if idle_match else None
  result['process_pid_after']=adb('shell','pidof',PKG).strip()
  result['elapsed_s']=round(time.monotonic()-start,2); result['rtf']=result['elapsed_s']/row['duration_s']
 except Exception as error:
  result.update(status='automation_error',error=str(error),trace=traceback.format_exc())
 resultfile.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'id':row['id'],'status':result['status'],'seconds':result.get('elapsed_s'),'error':result.get('error')},ensure_ascii=False),flush=True)
 if result['status']=='automation_error': break
 if result['status']!='completed':
  adb('shell','am','force-stop',PKG); adb('shell','am','start','-W','-n',PKG+'/.MainActivity'); time.sleep(3)
print('Suite finished',flush=True)
