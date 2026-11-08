"""Real Android UI A/B for Russian recordings; annotated repeated mixtures are marked synthetic."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,time,xml.etree.ElementTree as ET
from score_benchmark import der,wer

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--variant",required=True)
    parser.add_argument("--apk",required=True,type=Path)
    parser.add_argument("--ids",default="")
    parser.add_argument("--manifest",type=Path)
    parser.add_argument("--timeout",type=int,default=1800)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    out=root/"recordings/ru-speed/results"/args.variant
    out.mkdir(parents=True,exist_ok=True)
    adb_path=Path.home()/"AppData/Local/Android/Sdk/platform-tools/adb.exe"
    def adb(*cmd):
        r=subprocess.run([str(adb_path),"-s","emulator-5556",*cmd],capture_output=True,timeout=90)
        if r.returncode:raise RuntimeError(r.stderr.decode(errors="replace"))
        return r.stdout
    def snap():
        # A failed idle wait may exit 0 and leave yesterday's XML in place. Never read it.
        for _ in range(5):
            output=adb("shell","uiautomator","dump","/sdcard/ru-speed.xml")
            if b"dumped to:" in output:
                return list(ET.fromstring(adb("shell","cat","/sdcard/ru-speed.xml")).iter("node"))
            time.sleep(.5)
        raise RuntimeError("UIAutomator did not produce a fresh snapshot")
    def labels(ns):return [n.get("text") or n.get("content-desc") for n in ns if n.get("text") or n.get("content-desc")]
    def node(ns,label):return next(n for n in ns if label in [n.get("text"),n.get("content-desc")] and n.get("enabled")=="true" and n.get("clickable")=="true")
    def click(n):
        b=list(map(int,re.findall(r"\d+",n.get("bounds",""))))
        if len(b)!=4 or b[2]<=b[0] or b[3]<=b[1]:raise RuntimeError("Invalid UI bounds")
        adb("shell","input","tap",str((b[0]+b[2])//2),str((b[1]+b[3])//2));time.sleep(.4)
    def tap(label):click(node(snap(),label))
    def screenshot(folder,name): (folder/(name+".png")).write_bytes(adb("exec-out","screencap","-p"))
    def export():
        tap("Экспорт");tap("Посмотреть JSON")
        ns=snap()
        data=json.loads(next(t for t in labels(ns) if t.lstrip().startswith("{")))
        tap("Назад к экспорту");tap("Закрыть")
        return data
    rows=json.loads((args.manifest or root/"recordings/ru-speed/manifest.json").read_text(encoding="utf-8"))
    if args.ids:rows=[r for r in rows if r["id"] in args.ids.split(",")]
    with args.apk.open('rb') as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
    installed=adb("shell","pm","path","team.hex.nuclearstenographer").decode().strip().splitlines()[0].removeprefix("package:")
    assert re.fullmatch(r"/data/app/[A-Za-z0-9_~=/+.-]+/base.apk",installed)
    assert adb("shell","sha256sum",installed).decode().split()[0]==sha,"Install requested APK first"
    for row in rows:
        folder=out/row["id"];folder.mkdir(exist_ok=True)
        result={"case":row,"apk_sha256":sha,"variant":args.variant,"status":"running","stages":[],"sampled_peak_pss_kb":0}
        (folder/"result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        try:
            adb("push",row["file"],"/sdcard/Download/"+Path(row["file"]).name)
            adb("shell","am","start","-a","android.intent.action.VIEW","-d","stenographer:///","team.hex.nuclearstenographer")
            for _ in range(40):
                ns=snap();ls=labels(ns)
                if "Подготовка встроенных моделей…" not in ls and any((n.get("text") or n.get("content-desc"))=="Выбрать файл" and n.get("enabled")=="true" and n.get("clickable")=="true" for n in ns):break
                time.sleep(1)
            if "Закрыть сообщение об ошибке" in ls:tap("Закрыть сообщение об ошибке")
            tap("Выбрать файл");ls=labels(snap())
            if "Show roots" in ls:
                tap("Show roots");click([n for n in snap() if n.get("text")=="Downloads"][-1])
            tap("Search")
            field=next(n for n in snap() if n.get("class") in ["android.widget.EditText","android.widget.AutoCompleteTextView"])
            click(field);adb("shell","input","keyevent","123")
            adb("shell","input","keyevent",*(["67"]*(len(field.get("text",""))+2)))
            adb("shell","input","text",Path(row["file"]).name);adb("shell","input","keyevent","66");time.sleep(1)
            click([n for n in snap() if n.get("text")==Path(row["file"]).name and n.get("class") not in ["android.widget.EditText","android.widget.AutoCompleteTextView"]][-1])
            start=time.monotonic();tap("Расшифровать")
            data=None;first_ready=None;monitor_summary=False;observed_summary=False
            while time.monotonic()-start<args.timeout:
                ns=snap();ls=labels(ns);elapsed=round(time.monotonic()-start,2)
                memory=adb("shell","dumpsys","meminfo","team.hex.nuclearstenographer").decode(errors="replace")
                match=re.search(r"TOTAL PSS:\s*(\d+)",memory)
                if match:result["sampled_peak_pss_kb"]=max(result["sampled_peak_pss_kb"],int(match[1]))
                stage="Распознавание речи" if any(re.search(r"\d+ из \d+ реплик",t) for t in ls) else next((t for t in ls if t in ["Подготовка записи","Определение участников","Создание резюме"]),None)
                if stage and (not result["stages"] or result["stages"][-1]["stage"]!=stage):result["stages"].append({"stage":stage,"elapsed_s":elapsed})
                (out/"status.json").write_text(json.dumps({"case":row["id"],"elapsed_s":elapsed,"stage":stage,"ui":ls,"sampled_peak_pss_kb":result["sampled_peak_pss_kb"]},ensure_ascii=False,indent=2),encoding="utf-8")
                if any("OutOfMemoryError" in t or "Call to function" in t for t in ls):
                    raise RuntimeError("Native processing error: "+str(ls))
                if monitor_summary:
                    # A result-route refresh can reset the local tab; restore the observed panel.
                    if "Краткое резюме" not in ls:
                        key="summary_tab_resets" if observed_summary else "summary_tab_activation_retries"
                        result[key]=result.get(key,0)+1
                        tap("Резюме")
                        continue
                    observed_summary=True
                    if "Формируется резюме…" in ls:
                        result["text_visible_while_summary"]=True
                        if data is None and row["id"] in ["ru-speed-podcast-a","ru-speed-podcast-b"]:
                            data=export()
                            result["early_export_finished_s"]=round(time.monotonic()-start,2)
                        if data is not None:result["early_export_while_summary"]=True
                    complete=any(n.get("enabled")=="true" and n.get("clickable")=="true" and (n.get("text") or n.get("content-desc")) in ["Создать заново","Повторить"] for n in ns)
                    if complete:
                        result["full_completed_s"]=round(time.monotonic()-start,2)
                        break
                elif "Экспорт" in ls and "Расшифровка" in ls and "Резюме" in ls:
                    active="Текст готов. Резюме формируется…" in ls
                    if first_ready is None:
                        first_ready=elapsed;result["text_visible_s"]=elapsed;result["text_visible_while_summary"]=active
                        result["export_enabled_at_text_ready"]=node(ns,"Экспорт").get("enabled")=="true"
                        screenshot(folder,"text-ready")
                        if active and row["id"] in ["ru-speed-podcast-a","ru-speed-podcast-b"]:
                            data=export()
                            result["early_export_finished_s"]=round(time.monotonic()-start,2)
                            result["early_export_while_summary"]="Текст готов. Резюме формируется…" in labels(snap())
                    tap("Резюме")
                    monitor_summary=True
                if "Вернуться к записи" in ls and "Отменить обработку" not in ls:raise RuntimeError(str(ls))
                time.sleep(2)
            else:raise RuntimeError("Processing timeout")
            if data is None:data=export()
            else:
                after_summary=export()
                result["early_export_unchanged_after_summary"]=data==after_summary
                if data!=after_summary:raise RuntimeError("Summary changed transcript JSON")
            native_log=adb("logcat","-d","-v","brief","-s","AudioEngine:I","*:S").decode(errors="replace")
            marker=native_log.rfind("diarization sessions=")
            if marker>=0:result["native_profile"]=native_log[marker:].splitlines()

            turns=data["transcript"]
            result["schema_and_bounds_ok"]=set(data)=={"transcript"} and all(
                set(t)=={"speaker_id","start_ms","end_ms","text"} and isinstance(t["speaker_id"],str) and isinstance(t["text"],str)
                and type(t["start_ms"]) is int and type(t["end_ms"]) is int
                and 0<=t["start_ms"]<t["end_ms"]<=round(row["duration_s"]*1000)+50 for t in turns)
            if not result["schema_and_bounds_ok"]:raise RuntimeError("Invalid transcript schema or timestamps")
            result["utterances"]=len(turns)
            result["known_speakers"]=len({t["speaker_id"] for t in turns if t["speaker_id"]!="speaker_unknown"})
            result["unknown_turns"]=sum(t["speaker_id"]=="speaker_unknown" for t in turns)
            result["unknown_turn_seconds"]=sum((t["end_ms"]-t["start_ms"])/1000 for t in turns if t["speaker_id"]=="speaker_unknown")
            (folder/"transcript.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
            if row.get("rttm"):
                result["exported_der"]=der(row["rttm"],turns,row["duration_s"])
                result["known_only_der_unknown_as_missed"]=der(row["rttm"],[t for t in turns if t["speaker_id"]!="speaker_unknown"],row["duration_s"])
            if row.get("reference_text"):result["asr_score"]=wer(row["reference_text"]," ".join(t["text"] for t in turns))
            tap("Резюме");ls=labels(snap())
            result["summary_available"]="Создать заново" in ls
            screenshot(folder,"summary")
            memory=adb("shell","dumpsys","meminfo","team.hex.nuclearstenographer").decode(errors="replace")
            idle=re.search(r"TOTAL PSS:\s*(\d+)",memory)
            if idle:result["after_completion_pss_kb"]=int(idle[1])
            result["status"]="completed" if result["summary_available"] else "summary_failed"
        except Exception as error:
            result.update(status="error",error=repr(error))
            screenshot(folder,"error")
        (folder/"result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps({key:value for key,value in result.items() if key not in ["case","stages"]},ensure_ascii=False),flush=True)
        if result["status"] not in ["completed","summary_failed"]:break
if __name__=="__main__":main()
