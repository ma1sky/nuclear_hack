import sys,json,time,hashlib
from pathlib import Path
import android_ui as q
q.OUT=q.ROOT/"recordings/ru-speed/results/summary-cancel"
q.OUT.mkdir(parents=True,exist_ok=True)
q.open_route("history")
# History is newest-first; select the newest matching five-minute record.
target="Открыть расшифровку: ru-speed-podcast-b.wav"
for _ in range(12):
 if target in q.labels():break
 q.adb("shell","input","swipe","500","1900","500","700","300")
q.tap(target)
q.tap("Экспорт");q.tap("Посмотреть JSON")
original=json.loads(next(x for x in q.labels() if x.lstrip().startswith("{")))
q.tap("Назад к экспорту");q.tap("Закрыть");q.tap("Резюме")
q.tap("Создать заново")
for _ in range(12):
 if "Отменить обработку" in q.labels():break
 time.sleep(.5)
q.capture("regenerating")
q.tap("Отменить обработку")
for _ in range(90):
 nodes=q.snap();ls=[n.get("text") or n.get("content-desc") for n in nodes if n.get("text") or n.get("content-desc")]
 if "Ошибка LLM" in ls or "OK" in ls:
  if "OK" in ls:q.tap("OK")
  continue
 ready=any(n.get("enabled")=="true" and n.get("clickable")=="true" and (n.get("content-desc") or n.get("text"))=="Создать заново" for n in nodes)
 if ready and "Отменить обработку" not in ls:break
 time.sleep(1)
else:raise RuntimeError("Summary cancellation did not finish")
q.tap("Расшифровка")
assert "Формирование резюме отменено. Расшифровка сохранена." in q.labels(),"Missing final cancellation state"
q.tap("Экспорт");q.tap("Посмотреть JSON")
after=json.loads(next(x for x in q.labels() if x.lstrip().startswith("{")))
assert original==after,"Cancellation changed the transcript"
q.tap("Назад к экспорту");q.tap("Закрыть")
q.capture("transcript-preserved")
result={"apk_sha256":hashlib.sha256(Path("artifacts/emulator/nuclear-stenographer-runtime-optimized.apk").read_bytes()).hexdigest(),"cancelled_regeneration":True,"transcript_unchanged":True,"final_cancel_message_verified":True,"utterances":len(after["transcript"])}
(q.OUT/"results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(result,flush=True)
q.open_route("")
