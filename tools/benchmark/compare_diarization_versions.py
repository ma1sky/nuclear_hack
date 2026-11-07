from pathlib import Path
import sys,json,time
import numpy as np
import soundfile as sf
import sherpa_onnx as so

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/benchmark'))
from score_benchmark import der
MODELS=ROOT/'app/models/bundles/full/models'
DATA=ROOT/'recordings/benchmark'
OUT=ROOT/'recordings/benchmark/remote-comparison.json'

def normalize(audio):
    step=max(1,len(audio)//10000)
    count=len(audio)//step
    probes=np.sort(np.abs(audio[::step][:count]))
    p98=float(probes[int(count*.98)])
    if .001<=p98<=.35:
        gain=np.float32(min(8,max(1,.65/p98)))
        boosted=audio*gain
        result=boosted.copy()
        mask=boosted>.92
        result[mask]=.92+.08*np.tanh((boosted[mask]-.92)/.08)
        mask=boosted<-.92
        result[mask]=-.92-.08*np.tanh((-boosted[mask]-.92)/.08)
        return result,p98,float(gain)
    return audio,p98,1.

def main():
    results=[]
    for stem in ['t03-rec_0000','t04-rec_0055','t05-rec_0273','t06-rec_0274']:
        original,sr=sf.read(DATA/'cases'/(stem+'.wav'),dtype='float32')
        assert sr==16000
        enhanced,p98,gain=normalize(original)
        for version in ['local','remote']:
            cfg=so.OfflineSpeakerDiarizationConfig(
              segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(MODELS/'pyannote-segmentation.int8.onnx')),num_threads=2),
              embedding=so.SpeakerEmbeddingExtractorConfig(model=str(MODELS/'3dspeaker.onnx'),num_threads=2),
              clustering=so.FastClusteringConfig(num_clusters=-1,threshold=.5 if version=='local' else .55),
              min_duration_on=.2,
              min_duration_off=.5 if version=='local' else .3)
            engine=so.OfflineSpeakerDiarization(cfg)
            start=time.monotonic()
            segments=engine.process(original if version=='local' else enhanced).sort_by_start_time()
            hyp=[dict(speaker_id=str(s.speaker),start_ms=round(s.start*1000),end_ms=round(s.end*1000)) for s in segments]
            score=der(DATA/'cases'/(stem[4:]+'.rttm'),hyp,len(original)/sr)
            result=dict(case=stem,version=version,p98=p98,gain=gain if version=='remote' else 1.,score=score,elapsed_s=round(time.monotonic()-start,3))
            results.append(result)
            results.sort(key=lambda r:(r['case'],r['version']))
            OUT.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(result),flush=True)
            del engine

if __name__=='__main__': main()
