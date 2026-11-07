from pathlib import Path
import json,subprocess,hashlib,os,soundfile as sf
d=Path(__file__).resolve().parents[2]/'recordings/benchmark'; r=json.loads((d/'golos-row.json').read_text(encoding='utf-8'))['rows'][0]['row']; p=d/'cases/t01-golos.wav'
subprocess.run(['curl.exe','--fail','--silent','--show-error','--location','--tls-max','1.2',*(['--proxy',os.environ['NUCLEAR_BUILD_PROXY']] if os.environ.get('NUCLEAR_BUILD_PROXY') else []),'--max-time','40',r['audio'][0]['src'],'-o',str(p)],check=True)
with sf.SoundFile(p) as f: duration=len(f)/f.samplerate
rows=json.loads((d/'manifest.json').read_text(encoding='utf-8'))
rows[0]=dict(id='t01',file=str(p),duration_s=duration,kind='Golos crowd test with manual reference',source='https://huggingface.co/datasets/bond005/sberdevices_golos_10h_crowd',source_row=0,reference_text=r['transcription'],rttm=None,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
(d/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared manual-reference Golos test:',duration,flush=True)
