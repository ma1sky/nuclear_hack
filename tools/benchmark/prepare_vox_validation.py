from pathlib import Path
import hashlib,io,json,subprocess
import pyarrow.parquet as pq
import soundfile as sf

ROOT=Path(__file__).resolve().parents[2]
STUDY=ROOT/'recordings/benchmark/der-study'
if (STUDY/'frozen-candidates.json').exists(): raise RuntimeError('Prepare evaluation inputs before freezing candidates')
manifest=json.loads((STUDY/'manifest.json').read_text(encoding='utf-8'))
if any(r['split']=='vox_validation' for r in manifest): raise RuntimeError('Natural validation is already prepared')
folder=STUDY/'cases'
sha=lambda data:hashlib.sha256(data).hexdigest()
rows=next(pq.ParquetFile(STUDY/'vox-dev.parquet').iter_batches(batch_size=6)).to_pylist()
for row in rows:
    name=Path(row['audio']['path']).stem
    original=folder/(name+'-original.rttm')
    url=f'https://raw.githubusercontent.com/joonson/voxconverse/master/dev/{name}.rttm'
    subprocess.run(['curl.exe','--fail','--silent','--show-error','--location','--max-time','40',url,'-o',str(original)],check=True)
    audio,sr=sf.read(io.BytesIO(row['audio']['bytes']),dtype='float32'); assert sr==16000 and audio.ndim==1
    audio=audio[:120*sr]; duration=len(audio)/sr
    wav=folder/(name+'.wav'); sf.write(wav,audio,sr,subtype='PCM_16')
    output=[]; speakers=set()
    for line in original.read_text(encoding='utf-8').splitlines():
        fields=line.split()
        if not fields or fields[0]!='SPEAKER': continue
        start=float(fields[3]); end=min(start+float(fields[4]),duration)
        if start>=end: continue
        fields[3]=f'{start:.6f}'; fields[4]=f'{end-start:.6f}'
        output.append(' '.join(fields)); speakers.add(fields[7])
    assert speakers,'No speech in crop'
    reference=folder/(name+'.rttm'); reference.write_text('\n'.join(output)+'\n',encoding='utf-8')
    manifest.append(dict(id=name,split='vox_validation',file=str(wav),rttm=str(reference),sha256=sha(wav.read_bytes()),reference_sha256=sha(reference.read_bytes()),reference_speakers=len(speakers),duration_s=duration,source='https://huggingface.co/datasets/diarizers-community/voxconverse',reference_source=url,original_reference_sha256=sha(original.read_bytes()),natural=True,language='en',crop_start_s=0,crop_end_s=duration))
    print(name,duration,len(speakers),flush=True)
(STUDY/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
