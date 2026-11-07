"""Reproducible DER calibration. Never modifies Android configuration or baseline."""
from pathlib import Path
import argparse, hashlib, json, sys, tarfile, time
import numpy as np
import soundfile as sf
import sherpa_onnx as so

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'recordings/benchmark'
STUDY=DATA/'der-study'
MODELS=ROOT/'app/models/bundles/full/models'
sys.path.insert(0,str(ROOT/'tools/benchmark'))
from score_benchmark import der
from compare_diarization_versions import normalize

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(path,value):
    temporary=path.with_name(path.name+'.part')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(path)

def prepare():
    STUDY.mkdir(exist_ok=True)
    if (STUDY/'manifest.json').exists(): raise RuntimeError('Study inputs already exist; preserve the frozen protocol')
    cases=STUDY/'cases'; cases.mkdir(exist_ok=True)
    existing=['rec_0000','rec_0055','rec_0273','rec_0274']
    metadata={}; locations={}
    for shard in range(2):
        archive=DATA/f'ru-book-shard-{shard:04d}.tar'
        with tarfile.open(archive) as tar:
            for member in tar:
                if member.name.endswith('.json'):
                    record=json.load(tar.extractfile(member))
                    metadata[record['file_id']]=record
                    locations[record['file_id']]=archive
    dev_voices={v for name in existing for v in metadata[name]['speakers'].values()}
    used=set(dev_voices); holdout=[]
    for count in [1,1,2,2,3,3]:
        selected=next((name for name,record in sorted(metadata.items()) if record['n_speakers']==count and not used.intersection(record['speakers'].values())),None)
        if selected is None: raise RuntimeError('Cannot prepare voice-disjoint holdout')
        record=metadata[selected]; used.update(record['speakers'].values())
        with tarfile.open(locations[selected]) as tar:
            members={Path(m.name).name:m for m in tar}
            audio,sr=sf.read(tar.extractfile(members[selected+'.flac']))
            sf.write(cases/(selected+'.wav'),audio,sr,subtype='PCM_16')
            (cases/(selected+'.rttm')).write_bytes(tar.extractfile(members[selected+'.rttm']).read())
        holdout.append(selected)
    manifest=[]
    for split,names,folder in [('development',existing,DATA/'cases'),('ru_holdout',holdout,cases)]:
        for name in names:
            wav=folder/(name+'.wav') if split!='development' else next(folder.glob('t??-'+name+'.wav'))
            reference=folder/(name+'.rttm')
            manifest.append(dict(id=name,split=split,file=str(wav),rttm=str(reference),sha256=sha(wav),reference_sha256=sha(reference),reference_speakers=metadata[name]['n_speakers'],source='https://huggingface.co/datasets/mexus/ru-book-mix-10h',source_voice_ids=list(metadata[name]['speakers'].values()),duration_s=60.,natural=False))
    save(STUDY/'manifest.json',manifest)
    print('Prepared development 4 + voice-disjoint Russian synthetic holdout 6:',holdout,flush=True)

def run(manifest,model,threshold,off,results):
    model_path=MODELS/'3dspeaker.onnx' if model=='3dspeaker' else STUDY/'wespeaker_en_voxceleb_resnet34.onnx'
    fingerprint=sha(model_path)
    config=dict(model=model,model_sha256=fingerprint,segmentation_sha256=sha(MODELS/'pyannote-segmentation.int8.onnx'),threshold=threshold,min_duration_on=.2,min_duration_off=off,normalization=True)
    for record in manifest:
        key=hashlib.sha256(json.dumps([config,record['sha256'],record['reference_sha256']],sort_keys=True).encode()).hexdigest()
        if any(item['key']==key for item in results): continue
        audio,sr=sf.read(record['file'],dtype='float32'); assert sr==16000
        audio,p98,gain=normalize(audio)
        engine=so.OfflineSpeakerDiarization(so.OfflineSpeakerDiarizationConfig(
            segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(MODELS/'pyannote-segmentation.int8.onnx')),num_threads=2),
            embedding=so.SpeakerEmbeddingExtractorConfig(model=str(model_path),num_threads=2),
            clustering=so.FastClusteringConfig(num_clusters=-1,threshold=threshold),min_duration_on=.2,min_duration_off=off))
        start=time.monotonic()
        segments=engine.process(audio).sort_by_start_time()
        hypothesis=[dict(speaker_id=str(s.speaker),start_ms=round(s.start*1000),end_ms=round(s.end*1000)) for s in segments]
        score=der(record['rttm'],hypothesis,len(audio)/sr)
        result=dict(key=key,id=record['id'],split=record['split'],input_sha256=record['sha256'],configuration=config,elapsed_s=round(time.monotonic()-start,3),gain=gain,score=score)
        results.append(result); save(STUDY/'results.json',results)
        print(json.dumps(result),flush=True)
        del engine

def rank(results,model=None):
    groups={}
    for result in results:
        if result['split']!='development' or model and result['configuration']['model']!=model: continue
        config=result['configuration']; key=json.dumps(config,sort_keys=True)
        groups.setdefault(key,[]).append(result)
    ranked=[]
    for key,rows in groups.items():
        if len(rows)!=4: continue
        errors=sum(s['score']['miss_s']+s['score']['false_alarm_s']+s['score']['confusion_s'] for s in rows)
        reference=sum(s['score']['reference_speaker_time_s'] for s in rows)
        lost=sum(s['score']['predicted_speakers']<s['score']['reference_speakers'] for s in rows)
        ranked.append(dict(configuration=json.loads(key),weighted_der=errors/reference,lost_participant_cases=lost,counts=[s['score']['predicted_speakers'] for s in sorted(rows,key=lambda s:s['id'])]))
    return sorted(ranked,key=lambda x:(x['lost_participant_cases'],x['weighted_der']))

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('stage',choices=['prepare','sweep','model','freeze','validate']); args=parser.parse_args()
    if args.stage=='prepare': prepare(); return
    manifest=json.loads((STUDY/'manifest.json').read_text(encoding='utf-8'))
    results=json.loads((STUDY/'results.json').read_text(encoding='utf-8')) if (STUDY/'results.json').exists() else []
    dev=[row for row in manifest if row['split']=='development']
    if args.stage=='sweep':
        for threshold in [.55,.60,.65,.70,.75,.80,.85]: run(dev,'3dspeaker',threshold,.3,results)
        best=rank(results,'3dspeaker')[0]['configuration']
        for off in [.15,.3,.5]: run(dev,'3dspeaker',best['threshold'],off,results)
    elif args.stage=='model':
        for threshold in [.35,.45,.55,.65,.75,.85]: run(dev,'wespeaker',threshold,.3,results)
    elif args.stage=='freeze':
        if (STUDY/'frozen-candidates.json').exists(): raise RuntimeError('Selection already frozen; preserve original holdout protocol')
        # Development-only refinement: .35 preserves all voices, .45 loses one.
        # Run before freezing and before any held-out inference.
        for threshold in [.375,.4,.425]: run(dev,'wespeaker',threshold,.3,results)
        ranked=rank(results); assert ranked
        selection=[dict(model='3dspeaker',threshold=.55,min_duration_off=.3,role='baseline')]
        for model in ['3dspeaker','wespeaker']:
            choices=[x for x in ranked if x['configuration']['model']==model]
            if choices:
                c=choices[0]['configuration']; selection.append(dict(model=model,threshold=c['threshold'],min_duration_off=c['min_duration_off'],role='development_selected'))
        save(STUDY/'frozen-candidates.json',selection)
    else:
        selection=json.loads((STUDY/'frozen-candidates.json').read_text(encoding='utf-8'))
        unseen=[row for row in manifest if row['split']!='development']
        for config in selection: run(unseen,config['model'],config['threshold'],config['min_duration_off'],results)
    save(STUDY/'development-ranking.json',rank(results)); print(json.dumps(rank(results),indent=2),flush=True)

if __name__=='__main__': main()
