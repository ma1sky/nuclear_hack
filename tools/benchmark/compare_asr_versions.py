from pathlib import Path
import sys,json
import numpy as np,soundfile as sf,sherpa_onnx as so
import sherpa_onnx.offline_recognizer as api
ROOT=Path(__file__).resolve().parents[2]; MODELS=ROOT/'app/models/bundles/full/models'
sys.path.insert(0,str(ROOT/'tools/benchmark'))
from score_benchmark import wer
audio,sr=sf.read(ROOT/'recordings/benchmark/cases/t01-golos.wav',dtype='float32')
ref=json.loads((ROOT/'recordings/benchmark/manifest.json').read_text(encoding='utf-8'))[0]['reference_text']
results=[]
for version in ['local','remote']:
    model=api.OfflineModelConfig(nemo_ctc=api.OfflineNemoEncDecCtcModelConfig(model=str(MODELS/'gigaam-v2.int8.onnx')),tokens=str(MODELS/'gigaam-tokens.txt'),num_threads=2,provider='cpu',model_type='nemo_ctc')
    config=api.OfflineRecognizerConfig(model_config=model,blank_penalty=0. if version=='local' else 1.2)
    recognizer=so.OfflineRecognizer.__new__(so.OfflineRecognizer); recognizer.config=config; recognizer.recognizer=api._Recognizer(config)
    for name,wave in [('golos',audio),('golos-quiet',audio*.05),('silence',np.zeros(160000,dtype=np.float32))]:
        gain=1.
        if version=='remote':
            step=max(1,len(wave)//10000); count=len(wave)//step; p98=float(np.sort(np.abs(wave[::step][:count]))[int(count*.98)])
            if .001<=p98<=.35:
                gain=min(8,max(1,.65/p98)); boosted=wave*np.float32(gain); wave=boosted.copy()
                hi=boosted>.92; lo=boosted<-.92
                wave[hi]=.92+.08*np.tanh((boosted[hi]-.92)/.08)
                wave[lo]=-.92-.08*np.tanh((-boosted[lo]-.92)/.08)
        stream=recognizer.create_stream(); stream.accept_waveform(16000,wave); recognizer.decode_stream(stream)
        text=stream.result.text
        row=dict(version=version,case=name,gain=gain,text=text,score=wer(ref,text) if name!='silence' else None)
        results.append(row); print(json.dumps(row,ensure_ascii=False),flush=True)
    del recognizer
ROOT/'recordings/benchmark/remote-asr-comparison.json'.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
