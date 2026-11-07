from pathlib import Path
import json,time
import soundfile as sf
import sherpa_onnx as so
from score_benchmark import der
root=Path(__file__).resolve().parents[2]; data=root/'recordings/benchmark'; models=root/'app/models/bundles/full/models'
results=[]
for threshold in [.5,.65,.8,.95]:
 for stem,reference in [('t03-rec_0000','rec_0000'),('t04-rec_0055','rec_0055')]:
  config=so.OfflineSpeakerDiarizationConfig(segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(models/'pyannote-segmentation.int8.onnx')),num_threads=2),embedding=so.SpeakerEmbeddingExtractorConfig(model=str(models/'3dspeaker.onnx'),num_threads=2),clustering=so.FastClusteringConfig(num_clusters=-1,threshold=threshold))
  engine=so.OfflineSpeakerDiarization(config); audio,sr=sf.read(data/'cases'/(stem+'.wav'),dtype='float32'); start=time.monotonic()
  segments=engine.process(audio).sort_by_start_time()
  hyp=[dict(speaker_id=str(s.speaker),start_ms=round(s.start*1000),end_ms=round(s.end*1000),text='') for s in segments]
  score=der(data/'cases'/(reference+'.rttm'),hyp,len(audio)/sr)
  r=dict(threshold=threshold,case=stem,elapsed_s=time.monotonic()-start,score=score); results.append(r)
  (data/'threshold-tuning.json').write_text(json.dumps(results,indent=2),encoding='utf-8'); print(json.dumps(r),flush=True)
  del engine
