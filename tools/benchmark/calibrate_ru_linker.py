"""Calibrate recording-wide identity matching on marked synthetic development clips.
Inference runs on PC; exact production Kotlin matcher is called through its fixture runner.
"""
from pathlib import Path
import json,subprocess,time,wave,sys
import numpy as np
import soundfile as sf
import sherpa_onnx as so
from score_benchmark import der

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/"recordings/ru-speed"
MODELS=ROOT/"app/models/bundles/full/models"
CLASSES=ROOT/"recordings/ru-speed/linker-classes"
JAVA=Path(r"D:/Programs/Android Studio/jbr/bin/java.exe")
STDLIB=Path(r"D:/Programs/Android Studio/plugins/Kotlin/kotlinc/lib/kotlin-stdlib.jar")
def merge(turns):
 out=[]
 for a,b,s in sorted(turns):
  if out and out[-1][2]==s and a-out[-1][1]<=500:out[-1]=(out[-1][0],max(b,out[-1][1]),s)
  else:out.append((a,b,s))
 return [t for t in out if t[1]-t[0]>=200]
def normalize(audio):
 if len(audio)<100:return audio
 count=min(10000,len(audio));indices=np.arange(count,dtype=np.int64)*len(audio)//count
 p98=np.sort(np.abs(audio[indices]))[int(count*.98)]
 if .001<=p98<=.35:
  audio=audio*min(8.,.65/float(p98))
  audio=np.where(audio>.92,.92+.08*np.tanh((audio-.92)/.08),np.where(audio<-.92,-.92-.08*np.tanh((-audio-.92)/.08),audio))
 return audio.astype(np.float32)
def main():
 source=json.loads((ROOT/"recordings/benchmark/der-study/manifest.json").read_text(encoding="utf-8"))
 cases=[]
 for count in [1,2,3]:
  r=next(r for r in source if r["split"]=="development" and r["reference_speakers"]==count)
  name="calibration-"+str(count);path=DATA/(name+".wav");ref=DATA/(name+".rttm")
  audio,sr=sf.read(r["file"],dtype="float32");sf.write(path,np.tile(audio,3),sr,subtype="PCM_16")
  lines=[]
  for repeat in range(3):
   for line in Path(r["rttm"]).read_text().splitlines():
    f=line.split();f[1]=name;f[3]=str(float(f[3])+60*repeat);lines.append(" ".join(f))
  ref.write_text("\n".join(lines)+"\n",encoding="utf-8")
  cases.append(dict(id=name,file=str(path),rttm=str(ref),source_case=r["id"],reference_speakers=count))
 if "--evaluate" in sys.argv:
  cases=[r for r in json.loads((DATA/"manifest.json").read_text(encoding="utf-8")) if r.get("rttm")]
 engine=so.OfflineSpeakerDiarization(so.OfflineSpeakerDiarizationConfig(
  segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(MODELS/"pyannote-segmentation.int8.onnx")),num_threads=2),
  embedding=so.SpeakerEmbeddingExtractorConfig(model=str(MODELS/"3dspeaker.onnx"),num_threads=2),
  clustering=so.FastClusteringConfig(num_clusters=-1,threshold=.8),min_duration_on=.2,min_duration_off=.3))
 extractor=so.SpeakerEmbeddingExtractor(so.SpeakerEmbeddingExtractorConfig(model=str(MODELS/"3dspeaker.onnx"),num_threads=2))
 scores=[]
 for case in cases:
  cache=DATA/(case["id"]+"-evidence.json")
  if cache.exists():groups=json.loads(cache.read_text(encoding="utf-8"))
  else:
   audio,sr=sf.read(case["file"],dtype="float32");audio=normalize(audio);groups=[]
   for first in range(0,len(audio),120*16000):
    samples=audio[first:first+120*16000]
    segments=engine.process(samples).sort_by_start_time()
    local=merge([(int(np.floor(s.start*1000+.5)),int(np.floor(s.end*1000+.5)),int(s.speaker)) for s in segments])
    for speaker in sorted({s for a,b,s in local}):
     turns=[(a,b) for a,b,s in local if s==speaker]
     chosen=sorted(turns,key=lambda t:-(t[1]-t[0]))[:3]
     budget=6*16000//len(chosen)
     parts=[samples[a*16:min(b*16,a*16+budget)] for a,b in chosen]
     speech=np.concatenate(parts);seconds=len(speech)/16000;vector=None
     if seconds>=1.5:
      stream=extractor.create_stream();stream.accept_waveform(16000,speech);stream.input_finished()
      if extractor.is_ready(stream):vector=np.asarray(extractor.compute(stream)).tolist()
     groups.append(dict(seconds=seconds,embedding=vector,spans=[(a+first//16,b+first//16) for a,b in turns]))
    print(case["id"],"window",first//(120*16000)+1,flush=True)
   cache.write_text(json.dumps(groups),encoding="utf-8")
  fixture=DATA/(case["id"]+".tsv")
  fixture.write_text("\n".join(str(g["seconds"])+"\t"+";".join(str(a)+","+str(b) for a,b in g["spans"])+"\t"+
   (",".join(map(str,g["embedding"])) if g["embedding"] is not None else "null") for g in groups),encoding="utf-8")
  for threshold in [.2,.25,.3,.35,.4,.45,.5,.55,.6,.65]:
   labels=subprocess.check_output([str(JAVA),"-cp",str(CLASSES)+";"+str(STDLIB),"expo.modules.audioengine.audio.LinkerFixtureRunnerKt",str(fixture),str(threshold)]).decode().strip()
   ids=list(map(int,labels.split(",")))
   hyp=[dict(start_ms=a,end_ms=b,speaker_id="speaker_"+str(ids[i])) for i,g in enumerate(groups) for a,b in g["spans"]]
   score=der(case["rttm"],hyp,180)
   scores.append(dict(case=case,threshold=threshold,known_speakers=len({i for i in ids if i>=0}),unknown_groups=ids.count(-1),score=score))
  print([(r["threshold"],r["known_speakers"],round(r["score"]["der"],4)) for r in scores if r["case"]["id"]==case["id"]],flush=True)
 (ROOT/("artifacts/test-results/ru-speed-2026-11-08/linker-evaluation.json" if "--evaluate" in sys.argv else "artifacts/test-results/ru-speed-2026-11-08/linker-calibration.json")).write_text(json.dumps(dict(inference_platform="PC",sherpa_version=so.__version__,cases=cases,results=scores),ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__":main()
