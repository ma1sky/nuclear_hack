"""Publish aggregate measurements only; podcast transcripts and screenshots remain local."""
from pathlib import Path
import hashlib,json,statistics,zipfile
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/"recordings/runtime-options"
OUT=ROOT/"artifacts/test-results/runtime-options-2026-11-08"

def read(path):return json.loads(path.read_text(encoding="utf-8"))
def save(name,value):(OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
def weighted(rows,known=False):
    if not rows:return None
    scores=[r.get("known_only_score",r["score"]) if known else r["score"] for r in rows]
    total=sum(s["reference_speaker_time_s"] for s in scores)
    return sum(s["der"]*s["reference_speaker_time_s"] for s in scores)/total

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    files=["screen","evaluate","threads"]
    for name in files:save("pc-"+name+".json",read(DATA/(name+".json")))
    save("frozen-model.json",read(DATA/"frozen.json"));save("frozen-matching.json",read(DATA/"frozen-match.json"))
    fresh=read(DATA/"fresh-manifest.json")
    for row in fresh:
        for key in ["file","rttm"]:row[key]=str(Path(row[key]).relative_to(ROOT)).replace("\\","/")
    save("fresh-cases.json",fresh)
    for name in ["screen","long","match-dev","match-check"]:
        data=read(DATA/("android-"+name+".json"))
        for row in data["results"]:row.pop("turns",None)
        save("android-"+name+".json",data)
    android_asr=read(DATA/"android-asr.json")
    for row in android_asr["results"]:
        row["processed_audio_ms"]=min(20000,row["duration_ms"])
        row["median_decode_ms"]=statistics.median(r["elapsed_ms"] for r in row["iterations"])
        for item in row["iterations"]:
            text=item.pop("text");item["text_sha256"]=hashlib.sha256(text.encode()).hexdigest()
    save("android-asr.json",android_asr)
    llm=read(DATA/"summary/results.json")
    save("llm-limits.json",dict(platform="Windows PC llama-completion b12198, not llama.rn Android timing",runtime_source=read(DATA/"llama-cli/source.json"),results=llm,decision="Keep 160: 96 clips a long answer mid-word; short answers match, no useful speed gain. Both limits have semantic/format errors."))
    app=[]
    for file in sorted((ROOT/"recordings/ru-speed/results/titanet-final").glob("*/result.json")):
        row=read(file)
        if row["status"]!="completed":continue
        for key in ["file","rttm"]:
            if row["case"].get(key):row["case"][key]=str(Path(row["case"][key]).relative_to(ROOT)).replace("\\","/")
        row["summary_tab_resets"]=row.get("summary_tab_resets",0)
        app.append(row)
    save("app-results.json",app)
    cancel=ROOT/"recordings/ru-speed/results/summary-cancel/results.json"
    if cancel.exists():save("summary-cancel.json",read(cancel))
    apk=ROOT/"artifacts/emulator/nuclear-stenographer-runtime-optimized.apk"
    with zipfile.ZipFile(apk) as z:
        manifest=json.loads(z.read("assets/models/manifest.json"))
        abis=sorted({n.split("/")[1] for n in z.namelist() if n.startswith("lib/")})
        assert "assets/models/3dspeaker.onnx" not in z.namelist()
        assert "assets/models/LICENSE.titanet" in z.namelist()
    save("apk.json",dict(file=str(apk.relative_to(ROOT)).replace("\\","/"),sha256=hashlib.sha256(apk.read_bytes()).hexdigest(),bytes=apk.stat().st_size,abis=abis,models=manifest,retired_embedding_excluded=True))
    check=read(DATA/"android-match-check.json")["results"]
    aggregate={}
    for model in ["eres2net","titanet"]:
        rows=[r for r in check if r["model"]==model]
        multi=[r for r in rows if r["score"]["reference_speakers"]>1]
        aggregate[model]=dict(cases=len(rows),weighted_der=weighted(rows,True),multispeaker_weighted_der=weighted(multi,True),elapsed_s=sum(r["elapsed_ms"] for r in rows)/1000)
    save("comparison.json",dict(android_engine=aggregate,selected=dict(embedding="TitaNet Small",clustering_distance=.75,local_merge_similarity=.85,cross_window_similarity=.55,diarization_threads=2,asr_threads_x86_with_4_cpus=4,asr_threads_arm=2,llm_threads=2,llm_limit=160),app_cases=len(app)))
    print(json.dumps(aggregate,indent=2));print("Completed full APK cases:",[r["case"]["id"] for r in app])
if __name__=="__main__":main()
