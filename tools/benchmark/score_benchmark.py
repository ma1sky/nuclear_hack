from pathlib import Path
import json,re,itertools
import numpy as np
from speaker_assignment import maximum_overlap
root=Path(__file__).resolve().parents[2]; data=root/'recordings/benchmark'; out=data/'results'
def normalize(s): return re.sub(r'\s+',' ',re.sub(r'[^\w\s]',' ',s.lower().replace('ё','е'))).split()
def wer(reference,hypothesis):
 a,b=normalize(reference),normalize(hypothesis); row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  nxt=[i]
  for j,y in enumerate(b,1): nxt.append(min(row[j]+1,nxt[j-1]+1,row[j-1]+(x!=y)))
  row=nxt
 return {'reference_words':len(a),'edit_distance':row[-1],'wer':row[-1]/len(a) if a else None}
def der(reference,hyp,duration):
 segments=[]
 for line in Path(reference).read_text().splitlines():
  p=line.split()
  if p and p[0]=='SPEAKER': segments.append((float(p[3]),float(p[3])+float(p[4]),p[7]))
 rid=sorted({s[2] for s in segments}); hid=sorted({s['speaker_id'] for s in hyp}); times=np.arange(0.005,duration,0.01)
 r=np.zeros((len(times),len(rid)),dtype=bool); h=np.zeros((len(times),len(hid)),dtype=bool)
 for start,end,speaker in segments: r[(times>=start)&(times<end),rid.index(speaker)]=True
 for s in hyp: h[(times>=s['start_ms']/1000)&(times<s['end_ms']/1000),hid.index(s['speaker_id'])]=True
 overlap=r.astype(np.int64).T@h.astype(np.int64)
 correct=maximum_overlap(overlap)
 rc=r.sum(axis=1); hc=h.sum(axis=1); miss=int(np.maximum(rc-hc,0).sum()); fa=int(np.maximum(hc-rc,0).sum()); confusion=int(np.minimum(rc,hc).sum())-correct; denom=int(rc.sum())
 return {'der':(miss+fa+confusion)/denom if denom else None,'miss_s':miss*.01,'false_alarm_s':fa*.01,'confusion_s':confusion*.01,'reference_speakers':len(rid),'predicted_speakers':len(hid),'collar_s':0,'overlap_included':True,'frame_step_ms':10,'reference_speaker_time_s':denom*.01}
def main():
    results=[]
    for row in json.loads((data/'manifest.json').read_text(encoding='utf-8')):
     p=out/(row['id']+'.json')
     if not p.exists(): continue
     r=json.loads(p.read_text(encoding='utf-8'))
     if r['case']['sha256']!=row['sha256']: continue
     item={k:r.get(k) for k in ['status','elapsed_s','rtf','sampled_peak_pss_kb','stages']}; item.update(id=row['id'],duration_s=row['duration_s'],kind=row['kind'])
     if r['status']=='completed':
      transcript=r['transcript']['transcript']; item['utterances']=len(transcript); item['speakers']=len({s['speaker_id'] for s in transcript}); item['words']=sum(len(normalize(s['text'])) for s in transcript)
      item['schema_and_bounds_ok']=set(r['transcript'])=={'transcript'} and all(set(s)=={'speaker_id','start_ms','end_ms','text'} and isinstance(s['speaker_id'],str) and isinstance(s['text'],str) and type(s['start_ms']) is int and type(s['end_ms']) is int and 0<=s['start_ms']<s['end_ms']<=round(row['duration_s']*1000) for s in transcript)
      if row.get('reference_text'): item['asr_score']=wer(row['reference_text'],' '.join(s['text'] for s in transcript))
      if row.get('rttm'): item['diarization_score']=der(row['rttm'],transcript,row['duration_s'])
     results.append(item)
    (data/'scores.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(results,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
