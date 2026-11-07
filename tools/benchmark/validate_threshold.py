from pathlib import Path
import json,time
import soundfile as sf
import sherpa_onnx as so
from score_benchmark import der
root=Path(__file__).resolve().parents[2]; data=root/'recordings/benchmark'; m=root/'app/models/bundles/full/models'; results=[]
for stem,ref in [('t05-rec_0273','rec_0273'),('t06-rec_0274','rec_0274')]:
 c=so.OfflineSpeakerDiarizationConfig(segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(m/'pyannote-segmentation.int8.onnx')),num_threads=2),embedding=so.SpeakerEmbeddingExtractorConfig(model=str(m/'3dspeaker.onnx'),num_threads=2),clustering=so.FastClusteringConfig(num_clusters=-1,threshold=.95))
 engine=so.OfflineSpeakerDiarization(c); audio,sr=sf.read(data/'cases'/(stem+'.wav'),dtype='float32'); start=time.monotonic(); seg=engine.process(audio).sort_by_start_time()
 hyp=[dict(speaker_id=str(s.speaker),start_ms=round(s.start*1000),end_ms=round(s.end*1000),text='') for s in seg]
 result=dict(case=stem,threshold=.95,elapsed_s=time.monotonic()-start,score=der(data/'cases'/(ref+'.rttm'),hyp,len(audio)/sr)); results.append(result); print(json.dumps(result),flush=True); del engine
(data/'threshold-holdout.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
