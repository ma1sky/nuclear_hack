"""Collect actual UI JSON, verify bounds and score exported diarization against AMI."""
from pathlib import Path
import argparse,json,re,subprocess,time,xml.etree.ElementTree as ET
from score_benchmark import der

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--label",required=True)
    parser.add_argument("--serial",default="emulator-5556")
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    out=root/"artifacts/test-results/hour-ami-2026-11-08"/args.label
    result=json.loads((out/"result.json").read_text(encoding="utf-8"))
    if result["status"]!="completed":raise RuntimeError("Full UI processing has not completed")
    adb_path=Path.home()/"AppData/Local/Android/Sdk/platform-tools/adb.exe"
    def adb(*cmd):
        r=subprocess.run([str(adb_path),"-s",args.serial,*cmd],capture_output=True,timeout=90)
        if r.returncode:raise RuntimeError(r.stderr.decode(errors="replace"))
        return r.stdout
    def snap():
        adb("shell","uiautomator","dump","/sdcard/hour-result.xml")
        raw=adb("shell","cat","/sdcard/hour-result.xml")
        return list(ET.fromstring(raw).iter("node")),raw
    def labels(nodes):return [n.get("text") or n.get("content-desc") for n in nodes if n.get("text") or n.get("content-desc")]
    def tap(label):
        ns,_=snap()
        n=next(n for n in ns if label in [n.get("text"),n.get("content-desc")] and n.get("enabled")=="true")
        b=list(map(int,re.findall(r"\d+",n.get("bounds",""))))
        adb("shell","input","tap",str((b[0]+b[2])//2),str((b[1]+b[3])//2));time.sleep(.8)
    tap("Экспорт");tap("Посмотреть JSON")
    ns,raw=snap()
    (out/"export-preview.xml").write_bytes(raw)
    text=next(t for t in labels(ns) if t.lstrip().startswith("{"))
    data=json.loads(text)
    turns=data["transcript"]
    valid=set(data)=={"transcript"} and all(
        set(t)=={"speaker_id","start_ms","end_ms","text"} and isinstance(t["speaker_id"],str) and isinstance(t["text"],str)
        and type(t["start_ms"]) is int and type(t["end_ms"]) is int
        and 0<=t["start_ms"]<t["end_ms"]<=3600000 for t in turns)
    (out/"transcript.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    metrics={"schema_and_bounds_ok":valid,"utterances":len(turns),
             "speakers":len({t["speaker_id"] for t in turns}),"text_words":sum(len(t["text"].split()) for t in turns),
             "diarization_score":der(root/"recordings/hour-qa/hour-ami-IN1016.rttm",turns,3600),
             "diarization_scope":"Final exported turns, including ASR filtering, not isolated segmentation",
             "wer":None,"wer_note":"English input with Russian GigaAM; no claim about Russian ASR quality"}
    tap("Назад к экспорту")
    tap("Экспорт JSON")
    time.sleep(2)
    share_nodes,share_raw=snap()
    metrics["json_share_ui"]=labels(share_nodes)
    (out/"json-share.xml").write_bytes(share_raw)
    (out/"json-share.png").write_bytes(adb("exec-out","screencap","-p"))
    adb("shell","input","keyevent","4");time.sleep(1)
    tap("Закрыть");tap("Резюме")
    ns,_=snap();ls=labels(ns)
    metrics["summary_available"]="Создать заново" in ls
    metrics["summary_ui"]=ls
    (out/"summary.png").write_bytes(adb("exec-out","screencap","-p"))
    metrics["apk_sha256"]="b5fb30861cf866ed39f990527a3400453c23cf405d2849a656b1c6bec0190fca"
    (out/"metrics.json").write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in metrics.items() if k!="summary_ui"},ensure_ascii=False),flush=True)
if __name__=="__main__":main()
