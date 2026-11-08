"""Run production Kotlin/sherpa code in ART, using JNI libraries extracted from tested APK.
This measures Android engine stages, not React Native UI or full end-to-end latency.
"""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,time
import soundfile as sf
import numpy as np
from score_benchmark import der,wer
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/"recordings/runtime-options"
ADB=Path.home()/"AppData/Local/Android/Sdk/platform-tools/adb.exe"
REMOTE="/data/local/tmp/nuclear-runtime"

def adb(*args):
    r=subprocess.run([str(ADB),"-s","emulator-5556",*args],capture_output=True,timeout=900)
    if r.returncode:raise RuntimeError((r.stdout+r.stderr).decode("utf-8",errors="replace")[-3000:])
    return r.stdout.decode("utf-8",errors="replace")

def repeated(source,name):
    target=DATA/(name+".wav");reference=DATA/(name+".rttm")
    audio,sr=sf.read(source["file"],dtype="float32");sf.write(target,np.tile(audio,3),sr,subtype="PCM_16")
    lines=[]
    for repeat in range(3):
        for line in Path(source["rttm"]).read_text(encoding="utf-8").splitlines():
            f=line.split();f[1]=name;f[3]=str(float(f[3])+60*repeat);lines.append(" ".join(f))
    reference.write_text("\n".join(lines)+"\n",encoding="utf-8")
    return dict(source,id=name,file=str(target),rttm=str(reference),duration_s=180,natural=False,construction="Annotated 60s mixture repeated 3 times; IDs retained")

def main():
    p=argparse.ArgumentParser();p.add_argument("stage",choices=["screen","long","long-dev","long-check","match-dev","match-check","asr"]);args=p.parse_args()
    old=json.loads((ROOT/"recordings/benchmark/der-study/manifest.json").read_text(encoding="utf-8"))
    if args.stage=="screen":
        cases=[next(r for r in old if r["id"]=="rec_0273")]
        configurations=[("eres2net",2,.8),("titanet",1,.75),("titanet",2,.75),("titanet",4,.75)]
    elif args.stage in ["long","long-dev","long-check","match-dev","match-check"]:
        fresh=json.loads((DATA/"fresh-manifest.json").read_text(encoding="utf-8"))
        if args.stage=="match-dev":
            cases=[repeated(next(r for r in old if r["id"]==name),"native-dev-"+name) for name in ["rec_0273","rec_0274"]]
            configurations=[("titanet",2,.75,cutoff) for cutoff in [.85,.9,1.01]]
        elif args.stage=="match-check":
            frozen=json.loads((DATA/"frozen-match.json").read_text(encoding="utf-8"))
            cases=[repeated(fresh[i],"native-check-"+fresh[i]["id"]) for i in [0,2,4]]
            configurations=[("eres2net",2,.8,.65),("titanet",2,.75,frozen["local_merge_threshold"])]
        elif args.stage=="long-dev":
            cases=[repeated(next(r for r in old if r["id"]==name),"native-dev-"+name) for name in ["rec_0273","rec_0274"]]
            configurations=[("titanet",2,t) for t in [.65,.7,.75,.8]]
        elif args.stage=="long-check":
            frozen=json.loads((DATA/"frozen-long.json").read_text(encoding="utf-8"))
            cases=[repeated(fresh[i],"native-check-"+fresh[i]["id"]) for i in [0,2,4]]
            configurations=[("eres2net",2,.8),("titanet",2,frozen["threshold"])]
        else:
            cases=[repeated(next(r for r in old if r["id"]=="rec_0275"),"native-long-regression"),repeated(fresh[-1],"native-long-new")]
            configurations=[("eres2net",2,.8),("titanet",2,.75),("titanet",4,.75)]
    else:
        source=json.loads((ROOT/"recordings/benchmark/manifest.json").read_text(encoding="utf-8"))
        cases=[dict(id="golos",file=str(ROOT/"recordings/benchmark/cases/t01-golos.wav"),reference_text="шестьдесят тысяч тенге сколько будет стоить"),dict(id="ru-20s",file=next(r["file"] for r in source if r["id"]=="t09"))]
        configurations=[("eres2net",n,.8) for n in [1,2,4]]
    results=[]
    for case in cases:
        filename=case["id"]+".wav"
        assert re.fullmatch(r"[A-Za-z0-9_.-]+",filename)
        adb("push",case["file"],REMOTE+"/"+filename)
        for configuration in configurations:
            model,threads,threshold=configuration[:3]
            local_merge=configuration[3] if len(configuration)>3 else .65
            mode="asr" if args.stage=="asr" else "diar"
            command="LD_LIBRARY_PATH="+REMOTE+"/lib CLASSPATH="+REMOTE+"/bench.dex.jar app_process -Xmx192m -Djava.library.path="+REMOTE+"/lib /system/bin expo.modules.audioengine.NativeRuntimeBenchKt "+mode+" "+REMOTE+" "+REMOTE+"/"+filename+" "+model+" "+str(threads)+" "+str(threshold)+" "+str(local_merge)
            output=adb("shell",command)
            row=json.loads(output.split("BENCH_JSON ")[-1].strip());row["case"]=case["id"]
            row["input_sha256"]=hashlib.sha256(Path(case["file"]).read_bytes()).hexdigest()
            if mode=="diar":
                row["score"]=der(case["rttm"],row["turns"],case["duration_s"])
                row["known_only_score"]=der(case["rttm"],[t for t in row["turns"] if t["speaker_id"]!="speaker_unknown"],case["duration_s"])
                row["known_speakers"]=len({t["speaker_id"] for t in row["turns"] if t["speaker_id"]!="speaker_unknown"})
                row["new_ids_after_120s"]=len({t["speaker_id"] for t in row["turns"] if t["start_ms"]>=120000 and t["speaker_id"]!="speaker_unknown"}-{t["speaker_id"] for t in row["turns"] if t["start_ms"]<120000})
                brief={k:v for k,v in row.items() if k!="turns"}
            else:
                if case.get("reference_text"):
                    for r in row["iterations"]:r["score"]=wer(case["reference_text"],r["text"])
                brief=row
            results.append(row)
            (DATA/("android-"+args.stage+".json")).write_text(json.dumps(dict(platform="Android 17 x86_64 ART app_process",source="production Kotlin engine and sherpa 2.0.1 APK JNI",results=results),ensure_ascii=False,indent=2),encoding="utf-8")
            print(json.dumps(brief,ensure_ascii=False),flush=True)
    if args.stage=="match-dev":
        ranking=[]
        for cutoff in [.85,.9,1.01]:
            rs=[r for r in results if r["local_merge_threshold"]==cutoff]
            lost=sum(r["known_speakers"]<r["score"]["reference_speakers"] for r in rs)
            ref=sum(r["known_only_score"]["reference_speaker_time_s"] for r in rs)
            error=sum(r["known_only_score"]["der"]*r["known_only_score"]["reference_speaker_time_s"] for r in rs)/ref
            ranking.append(dict(local_merge_threshold=cutoff,lost_cases=lost,weighted_der=error))
        ranking.sort(key=lambda r:(r["lost_cases"],r["weighted_der"]))
        (DATA/"frozen-match.json").write_text(json.dumps(dict(local_merge_threshold=ranking[0]["local_merge_threshold"],clustering_threshold=.75,development=[r["id"] for r in cases],ranking=ranking),indent=2),encoding="utf-8")
        print("FROZEN MATCH",ranking,flush=True)
    if args.stage=="long-dev":
        ranking=[]
        for threshold in [.65,.7,.75,.8]:
            rs=[r for r in results if r["threshold"]==threshold]
            lost=sum(r["known_speakers"]<r["score"]["reference_speakers"] for r in rs)
            ref=sum(r["known_only_score"]["reference_speaker_time_s"] for r in rs)
            error=sum(r["known_only_score"]["der"]*r["known_only_score"]["reference_speaker_time_s"] for r in rs)/ref
            ranking.append(dict(threshold=threshold,lost_cases=lost,weighted_der=error))
        ranking.sort(key=lambda r:(r["lost_cases"],r["weighted_der"]))
        (DATA/"frozen-long.json").write_text(json.dumps(dict(threshold=ranking[0]["threshold"],development=[r["id"] for r in cases],ranking=ranking),indent=2),encoding="utf-8")
        print("FROZEN LONG",ranking,flush=True)
if __name__=="__main__":main()
