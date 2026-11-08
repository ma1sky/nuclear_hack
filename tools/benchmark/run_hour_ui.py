"""Run one annotated-hour import through the real Android UI; never fabricate metrics."""
from pathlib import Path
import argparse, hashlib, json, re, subprocess, time, xml.etree.ElementTree as ET

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", default="emulator-5556")
    parser.add_argument("--label", required=True)
    parser.add_argument("--timeout", type=int, default=7200)
    parser.add_argument("--adb", default=None, help="adb executable (default: Windows SDK path, else adb on PATH)")
    parser.add_argument("--audio-dir", type=Path, default=None, help="folder made by prepare_hour_case.py")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    audio = (args.audio_dir or root / "recordings/hour-qa") / "hour-ami-IN1016.wav"
    manifest = json.loads((audio.parent / "manifest.json").read_text(encoding="utf-8"))
    out = root / "artifacts/test-results/hour-ami-2026-11-08" / args.label
    out.mkdir(parents=True, exist_ok=True)
    windows_adb = Path.home() / "AppData/Local/Android/Sdk/platform-tools/adb.exe"
    adb_path = args.adb or (windows_adb if windows_adb.exists() else "adb")
    def adb(*cmd, timeout=90):
        r = subprocess.run([str(adb_path), "-s", args.serial, *cmd], capture_output=True, timeout=timeout)
        if r.returncode: raise RuntimeError(r.stderr.decode(errors="replace"))
        return r.stdout
    def snap():
        adb("shell", "uiautomator", "dump", "/sdcard/hour-ui.xml")
        return list(ET.fromstring(adb("shell", "cat", "/sdcard/hour-ui.xml")).iter("node"))
    def labels(nodes): return [n.get("text") or n.get("content-desc") for n in nodes if n.get("text") or n.get("content-desc")]
    def click(node):
        b=list(map(int,re.findall(r"\d+",node.get("bounds",""))))
        assert len(b)==4 and b[2]>b[0] and b[3]>b[1]
        adb("shell","input","tap",str((b[0]+b[2])//2),str((b[1]+b[3])//2));time.sleep(.6)
    def tap(label):
        ns=snap()
        click(next(n for n in ns if label in [n.get("text"),n.get("content-desc")] and n.get("enabled")=="true"))
    result={"case":manifest,"serial":args.serial,"label":args.label,"status":"automation_error","stages":[],"sampled_peak_pss_kb":0}
    started=None
    try:
        adb("push",str(audio),"/sdcard/Download/"+audio.name)
        adb("shell","am","start","-a","android.intent.action.VIEW","-d","stenographer:///","team.hex.nuclearstenographer")
        for _ in range(50):
            ns=snap()
            if "Добавить аудио" in labels(ns): break
            time.sleep(1)
        tap("Выбрать файл");ns=snap()
        if "Show roots" in labels(ns):
            tap("Show roots");click([n for n in snap() if n.get("text")=="Downloads"][-1])
        tap("Search")
        field=next(n for n in snap() if n.get("class") in ["android.widget.EditText","android.widget.AutoCompleteTextView"])
        click(field)
        adb("shell","input","keyevent","123")
        adb("shell","input","keyevent",*(["67"]*(len(field.get("text",""))+2)))
        adb("shell","input","text",audio.name);adb("shell","input","keyevent","66");time.sleep(1)
        click([n for n in snap() if n.get("text")==audio.name and n.get("class") not in ["android.widget.EditText","android.widget.AutoCompleteTextView"]][-1])
        started=time.monotonic()
        tap("Расшифровать")
        while time.monotonic()-started < args.timeout:
            ns=snap();ls=labels(ns)
            elapsed=round(time.monotonic()-started,2)
            stage=next((s for s in ["Подготовка записи","Определение участников","Распознавание речи","Создание резюме","Сохранение"] if s in ls),None)
            mem=adb("shell","dumpsys","meminfo","team.hex.nuclearstenographer").decode(errors="replace")
            m=re.search(r"TOTAL PSS:\s*(\d+)",mem)
            if m:result["sampled_peak_pss_kb"]=max(result["sampled_peak_pss_kb"],int(m[1]))
            if not result["stages"] or result["stages"][-1]["ui"]!=ls:
                result["stages"].append({"elapsed_s":elapsed,"stage":stage,"ui":ls})
            (out/"status.json").write_text(json.dumps({"elapsed_s":elapsed,"ui":ls},ensure_ascii=False,indent=2),encoding="utf-8")
            if "Закрыть сообщение об ошибке" in ls or any("OutOfMemoryError" in text or "Call to function" in text for text in ls):
                result.update(status="app_error",ui=ls);break
            if "Стенограмма" in ls:
                result.update(status="completed",ui=ls);break
            if not adb("shell","pidof","team.hex.nuclearstenographer").strip():
                result.update(status="process_died",ui=ls);break
            time.sleep(3)
        else:result["status"]="timeout"
        result["elapsed_s"]=round(time.monotonic()-started,2)
        result["rtf_completed"]=result["elapsed_s"]/3600 if result["status"]=="completed" else None
        (out/"screen.png").write_bytes(adb("exec-out","screencap","-p"))
        (out/"logcat.log").write_bytes(adb("logcat","-d","-t","1200"))
        result["device"]={key:adb("shell","getprop",key).decode().strip() for key in ["ro.product.model","ro.product.cpu.abi","ro.build.version.release","dalvik.vm.heapsize"]}
    except Exception as error:result["error"]=repr(error)
    (out/"result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k not in ["stages","case"]},ensure_ascii=False),flush=True)
if __name__=="__main__":main()
