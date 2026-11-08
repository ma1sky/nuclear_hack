"""Capture real installed Android app workflows. Never changes APK or inserts UI fixtures."""
from pathlib import Path
import sys,subprocess,time,json,re,xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'benchmark'))
import android_ui as q
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'recordings/demo-real';PUBLIC=ROOT/'tools/demo-video/public/real'
OUT.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True)
def labels(ns=None):return [n.get('text') or n.get('content-desc') for n in (q.snap() if ns is None else ns) if n.get('text') or n.get('content-desc')]
def node(label,ns=None):return next(n for n in (q.snap() if ns is None else ns) if label in [n.get('text'),n.get('content-desc')] and n.get('enabled')=='true' and n.get('clickable')=='true')
def xy(n,fraction=.5):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')));return str(round(x1+(x2-x1)*fraction)),str((y1+y2)//2)
def click(n):q.adb('shell','input','tap',*xy(n));time.sleep(.35)
class Recording:
 def __init__(self,name):
  self.name=name;self.events=[];self.remote='/sdcard/nuclear-real-'+name+'.mp4';self.start=time.monotonic();self.log=(OUT/(name+'-screenrecord.log')).open('wb')
  self.proc=subprocess.Popen([q.ADB,'-s','emulator-5556','shell','screenrecord','--size','720x1600','--bit-rate','4500000','--time-limit','180',self.remote],stdout=self.log,stderr=subprocess.STDOUT)
  time.sleep(1)
 def mark(self,title,kind='action'):
  self.events.append(dict(at_s=round(time.monotonic()-self.start,3),title=title,kind=kind));self.save();print(self.name+': '+title,flush=True)
 def save(self):
  (OUT/(self.name+'-events.json')).write_text(json.dumps(dict(source=self.name+'.mp4',events=self.events),ensure_ascii=False,indent=2),encoding='utf-8')
 def stop(self):
  if self.proc.poll() is None:
   lines=q.adb('shell','ps','-A','-o','PID,ARGS').decode(errors='replace').splitlines()
   matches=[x for x in lines if self.remote in x and 'screenrecord' in x]
   for line in matches:
    pid=line.strip().split()[0]
    if pid.isdigit():q.adb('shell','kill','-2',pid)
  self.proc.wait(timeout=25);self.log.close();q.adb('pull',self.remote,str(PUBLIC/(self.name+'.mp4')));self.save()
def tapping(rec,title,label):
 n=node(label);rec.mark(title);click(n)
def import_workflow():
 file=ROOT/'recordings/ru-speed/ru-speed-aac60.m4a';q.adb('push',str(file),'/sdcard/Download/'+file.name);q.open_route('')
 for _ in range(40):
  ns=q.snap()
  if 'Подготовка встроенных моделей…' not in labels(ns) and any(n.get('enabled')=='true' and n.get('clickable')=='true' and (n.get('content-desc') or n.get('text'))=='Выбрать файл' for n in ns):break
  time.sleep(1)
 else:raise RuntimeError('Home/model preparation not ready')
 rec=Recording('01-import-asr')
 try:
  tapping(rec,'Выбираем аудиофайл M4A','Выбрать файл');ns=q.snap();ls=labels(ns)
  if 'Show roots' in ls:
   q.tap('Show roots');ns=q.snap();click([n for n in ns if n.get('text')=='Downloads'][-1])
  q.tap('Search');ns=q.snap();field=next(n for n in ns if n.get('class') in ['android.widget.EditText','android.widget.AutoCompleteTextView']);click(field)
  q.adb('shell','input','keyevent','123');q.adb('shell','input','keyevent',*(['67']*(len(field.get('text',''))+2)));q.adb('shell','input','text',file.name);q.adb('shell','input','keyevent','66');time.sleep(.7)
  ns=q.snap();rec.mark('Открываем найденную запись');click([n for n in ns if n.get('text')==file.name and n.get('class') not in ['android.widget.EditText','android.widget.AutoCompleteTextView']][-1])
  tapping(rec,'Запускаем локальную расшифровку','Расшифровать');started=time.monotonic();last=None;summary=False
  while time.monotonic()-started<125:
   ns=q.snap();ls=labels(ns)
   if any('Call to function' in x or 'OutOfMemoryError' in x for x in ls):raise RuntimeError('Native processing error')
   stage='Распознавание реплик' if any(re.search(r'\d+ из \d+ реплик',x) for x in ls) else next((x for x in ['Подготовка записи','Определение участников'] if x in ls),None)
   if stage and stage!=last:rec.mark(stage,'wait');last=stage
   if 'Экспорт' in ls and 'Расшифровка' in ls and not summary:
    rec.mark('Текст уже доступен; резюме продолжается');q.tap('Резюме');rec.mark('Локальная LLM формирует отдельное резюме','wait');summary=True
   if summary and any(n.get('enabled')=='true' and (n.get('content-desc') or n.get('text'))=='Создать заново' for n in ns):
    rec.mark('Резюме готово — проверяем результат');time.sleep(3);break
   time.sleep(.5)
  else:raise RuntimeError('Inference recording exceeded time budget')
 finally:rec.stop()
def player_workflow():
 q.tap('Расшифровка');q.snap();rec=Recording('02-player')
 try:
  button=node('Воспроизвести');rec.mark('Запускаем воспроизведение');click(button);time.sleep(4);rec.mark('Ставим воспроизведение на паузу');click(button);time.sleep(1)
  tapping(rec,'Перемотка вперёд на 15 секунд','Вперёд на 15 секунд');time.sleep(.7)
  tapping(rec,'Возвращаемся на 15 секунд назад','Назад на 15 секунд');time.sleep(.7)
  slider=node('Позиция воспроизведения');rec.mark('Переходим к середине аудиодорожки');q.adb('shell','input','tap',*xy(slider,.5));time.sleep(1)
  for label in ['1x','1.25x','1.5x']:tapping(rec,'Меняем скорость: '+{'1x':'1.25×','1.25x':'1.5×','1.5x':'2×'}[label],label)
  button=node('Воспроизвести');rec.mark('Слушаем на скорости 2×');click(button);time.sleep(4);click(button)
  q.tap('2x');q.tap('0.75x');ns=q.snap();target=next(n for n in ns if (n.get('content-desc') or '').startswith('Перейти к '));button=node('Воспроизвести',ns);rec.mark('Переход к реплике по таймкоду');click(target);time.sleep(3);click(button);time.sleep(1)
 finally:rec.stop()
def result_workflow():
 rec=Recording('03-export-history')
 try:
  ns=q.snap();target=next(n for n in ns if (n.get('content-desc') or '').startswith('Переименовать участника:'));rec.mark('Редактируем имя участника');click(target);q.set_input('Alex');q.adb('shell','input','keyevent','4');q.tap('Сохранить');time.sleep(1)
  tapping(rec,'Открываем экспорт','Экспорт');tapping(rec,'Проверяем структуру JSON','Посмотреть JSON');time.sleep(3);q.tap('Назад к экспорту')
  tapping(rec,'Экспорт JSON в системный диалог','Экспорт JSON');time.sleep(2);q.adb('shell','input','keyevent','4')
  tapping(rec,'Экспорт TXT-протокола','Экспорт TXT');time.sleep(2);q.adb('shell','input','keyevent','4');q.tap('Закрыть')
  rec.mark('Возвращаемся в историю');q.open_route('');q.tap('Все расшифровки');time.sleep(1)
  tapping(rec,'Повторно открываем сохранённую расшифровку','Открыть расшифровку: ru-speed-aac60.m4a');q.tap('Резюме');rec.mark('Текст, имена и резюме сохранены');time.sleep(3)
 finally:rec.stop()
def recorder_workflow():
 q.open_route('recorder');ns=q.snap();rec=Recording('04-recorder')
 try:
  tapping(rec,'Начинаем запись в диктофоне','Начать запись');time.sleep(5)
  # Bounds observed in this exact portrait RecorderScreen during the validated QA run.
  rec.mark('Пауза записи');q.adb('shell','input','tap','300','816');time.sleep(.5);ns=q.snap();assert 'Продолжить' in labels(ns)
  resume=node('Продолжить',ns);finish=node('Завершить',ns);time.sleep(2);rec.mark('Продолжаем в том же файле');click(resume);time.sleep(4);rec.mark('Завершаем запись');click(finish)
  ns=q.snap();assert 'Запись готова' in labels(ns);button=node('Воспроизвести',ns);rec.mark('Прослушиваем перед сохранением');click(button);time.sleep(3);click(button)
  rec.mark('Задаём название записи');q.set_input('LiveDemo_Recorder');q.adb('shell','input','keyevent','4');tapping(rec,'Сохраняем аудиозапись','Сохранить аудио');time.sleep(1)
  q.tap('В аудиотеку');tapping(rec,'Открываем сохранённое аудио','Открыть аудио: LiveDemo_Recorder');button=node('Воспроизвести');rec.mark('Повторное воспроизведение из аудиотеки');click(button);time.sleep(3);click(button);time.sleep(1)
 finally:rec.stop()
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('workflow',choices=['import','player','result','recorder']);args=p.parse_args()
 original=q.adb('shell','settings','get','system','show_touches').decode().strip()
 q.adb('shell','settings','put','system','show_touches','1')
 try:{'import':import_workflow,'player':player_workflow,'result':result_workflow,'recorder':recorder_workflow}[args.workflow]()
 finally:
  if original=='null':q.adb('shell','settings','delete','system','show_touches')
  else:q.adb('shell','settings','put','system','show_touches',original)
