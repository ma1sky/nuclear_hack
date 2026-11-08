"""CPU experiments, separate from production configuration. Raw text/audio stay ignored."""
from pathlib import Path
import argparse,gc,hashlib,json,random,tarfile,time,statistics
import numpy as np
import soundfile as sf
import sherpa_onnx as so
import sherpa_onnx.offline_recognizer as api
from calibrate_ru_linker import normalize
from score_benchmark import der,wer

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/"recordings/runtime-options"
MODELS=ROOT/"app/models/bundles/full/models"
TITA=DATA/"models/nemo_en_titanet_small.onnx"

def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")

def prepare():
    target=DATA/"fresh-cases";target.mkdir(parents=True,exist_ok=True)
    old=json.loads((ROOT/"recordings/benchmark/der-study/manifest.json").read_text(encoding="utf-8"))
    used={voice for row in old for voice in row.get("source_voice_ids",[])}
    metadata={};locations={}
    for archive in sorted((ROOT/"recordings/benchmark").glob("ru-book-shard-*.tar")):
        with tarfile.open(archive) as tar:
            for item in tar:
                if item.name.endswith(".json"):
                    row=json.load(tar.extractfile(item));metadata[row["file_id"]]=row;locations[row["file_id"]]=archive
    used.update(voice for row in old for voice in metadata.get(row["id"],{}).get("speakers",{}).values())
    previous_voices=set(used)
    used_ids={r["id"] for r in old}
    fresh=[]
    for count in [1,1,2,2,3,3]:
        candidates=[(len(used.intersection(row["speakers"].values())),key) for key,row in sorted(metadata.items()) if row["n_speakers"]==count and key not in used_ids]
        _,name=min(candidates)
        used_ids.add(name)
        row=metadata[name];used.update(row["speakers"].values())
        with tarfile.open(locations[name]) as tar:
            members={Path(m.name).name:m for m in tar}
            audio,sr=sf.read(tar.extractfile(members[name+".flac"]));sf.write(target/(name+".wav"),audio,sr,subtype="PCM_16")
            (target/(name+".rttm")).write_bytes(tar.extractfile(members[name+".rttm"]).read())
        fresh.append(dict(id=name,file=str(target/(name+".wav")),rttm=str(target/(name+".rttm")),reference_speakers=count,source_voice_ids=list(row["speakers"].values()),voice_overlap_with_previous=len(previous_voices.intersection(row["speakers"].values())),duration_s=60,natural=False,source="https://huggingface.co/datasets/mexus/ru-book-mix-10h",sha256=hashlib.sha256((target/(name+".wav")).read_bytes()).hexdigest()))
    save(DATA/"fresh-manifest.json",fresh)
    print("Prepared new-clip regression (voice overlap recorded)",[(r["id"],r["reference_speakers"]) for r in fresh],flush=True)

def engine(model,threads,threshold):
    return so.OfflineSpeakerDiarization(so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(MODELS/"pyannote-segmentation.int8.onnx")),num_threads=threads),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=str(MODELS/"3dspeaker.onnx" if model=="eres2net" else TITA),num_threads=threads),
        clustering=so.FastClusteringConfig(num_clusters=-1,threshold=threshold),min_duration_on=.2,min_duration_off=.3))

def diar(stage):
    old=json.loads((ROOT/"recordings/benchmark/der-study/manifest.json").read_text(encoding="utf-8"))
    dev=[r for r in old if r["split"]=="development"]
    configurations=[]
    if stage=="screen":
        cases=dev
        configurations=[("eres2net",2,.8)]+[("titanet",2,t) for t in [.35,.45,.55,.65,.75,.85]]
    else:
        frozen=json.loads((DATA/"frozen.json").read_text(encoding="utf-8"))
        cases=dev if stage=="threads" else json.loads((DATA/"fresh-manifest.json").read_text(encoding="utf-8"))
        configurations=[(model,threads,frozen[model]) for model in ["eres2net","titanet"] for threads in ([1,2,4] if stage=="threads" else [2])]
    results=[]
    for model,threads,threshold in configurations:
        started=time.perf_counter();diarizer=engine(model,threads,threshold);load_s=time.perf_counter()-started
        for row in cases:
            audio,sr=sf.read(row["file"],dtype="float32");assert sr==16000;audio=normalize(audio)
            started=time.perf_counter();segments=diarizer.process(audio).sort_by_start_time();elapsed=time.perf_counter()-started
            # Same conversion/merging as the app for local <=120s windows, before ASR filtering.
            turns=[]
            for s in segments:
                a=int(np.floor(s.start*1000+.5));b=int(np.floor(s.end*1000+.5));speaker=str(s.speaker)
                if turns and turns[-1]["speaker_id"]==speaker and a-turns[-1]["end_ms"]<=500:turns[-1]["end_ms"]=max(b,turns[-1]["end_ms"])
                else:turns.append(dict(start_ms=a,end_ms=b,speaker_id=speaker))
            turns=[x for x in turns if x["end_ms"]-x["start_ms"]>=200]
            score=der(row["rttm"],turns,len(audio)/sr)
            result=dict(case=row["id"],model=model,threads=threads,threshold=threshold,load_s=round(load_s,4),elapsed_s=round(elapsed,4),duration_s=len(audio)/sr,score=score)
            results.append(result);save(DATA/(stage+".json"),dict(platform="Windows PC Ryzen 5 3600",sherpa_version=so.__version__,results=results))
            print(model,threads,threshold,row["id"],round(elapsed,3),round(score["der"],4),score["predicted_speakers"],flush=True)
        del diarizer;gc.collect()
    if stage=="screen":
        ranked=[]
        for threshold in [.35,.45,.55,.65,.75,.85]:
            subset=[r for r in results if r["model"]=="titanet" and r["threshold"]==threshold]
            lost=sum(r["score"]["predicted_speakers"]<r["score"]["reference_speakers"] for r in subset)
            weighted=sum(r["score"]["der"]*r["score"]["reference_speaker_time_s"] for r in subset)/sum(r["score"]["reference_speaker_time_s"] for r in subset)
            ranked.append((lost,weighted,threshold))
        best=min(ranked);save(DATA/"frozen.json",dict(eres2net=.8,titanet=best[2],selected_only_on_development=True,ranking=sorted(ranked)))
        print("FROZEN",best,flush=True)

def asr():
    cases=[("golos",ROOT/"recordings/benchmark/cases/t01-golos.wav",4),("ru-20s",ROOT/"recordings/benchmark/cases/t09-podcast07.wav",20)]
    results=[]
    for threads in [2,1,4]:
        cfg=api.OfflineModelConfig(nemo_ctc=api.OfflineNemoEncDecCtcModelConfig(model=str(MODELS/"gigaam-v2.int8.onnx")),tokens=str(MODELS/"gigaam-tokens.txt"),num_threads=threads,provider="cpu",model_type="nemo_ctc")
        config=api.OfflineRecognizerConfig(model_config=cfg,blank_penalty=0.)
        started=time.perf_counter();recognizer=so.OfflineRecognizer.__new__(so.OfflineRecognizer);recognizer.config=config;recognizer.recognizer=api._Recognizer(config);load_s=time.perf_counter()-started
        for name,path,seconds in cases:
            audio,sr=sf.read(path,dtype="float32",frames=seconds*16000);audio=normalize(audio)
            for repeat in range(3):
                started=time.perf_counter();stream=recognizer.create_stream();stream.accept_waveform(sr,audio);recognizer.decode_stream(stream);text=stream.result.text;elapsed=time.perf_counter()-started
                r=dict(threads=threads,case=name,repeat=repeat,elapsed_s=round(elapsed,4),load_s=round(load_s,4),text=text,score=wer("шестьдесят тысяч тенге сколько будет стоить",text) if name=="golos" else None)
                results.append(r);save(DATA/"asr-threads-raw.json",results);print(threads,name,repeat,round(elapsed,3),flush=True)
        del recognizer;gc.collect()

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("stage",choices=["prepare","screen","threads","evaluate","asr"]);a=p.parse_args()
    if a.stage=="prepare":prepare()
    elif a.stage=="asr":asr()
    else:diar(a.stage)
