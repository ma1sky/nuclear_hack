from pathlib import Path
import hashlib,json,sys,re

ROOT=Path(__file__).resolve().parents[2]; DATA=ROOT/'recordings/benchmark'
sys.path.insert(0,str(ROOT/'tools/benchmark'))
from score_benchmark import der,wer,normalize

def main():
    state=json.loads((DATA/'der-study/android-run-state.json').read_text(encoding='utf-8'))
    assert state['airplane_restored']==state['airplane_before'] and state['wifi_restored']==state['wifi_before']
    prefix=state['result_prefix']
    assert re.fullmatch(r'der08-[0-9a-f]{12}',prefix)
    baseline=json.loads((ROOT/'artifacts/test-results/podcast-benchmark-2026-11-07.json').read_text(encoding='utf-8'))
    earlier=json.loads((ROOT/'artifacts/test-results/candidate-20261107-smoke.json').read_text(encoding='utf-8'))
    records=[]
    for case in json.loads((DATA/'manifest.json').read_text(encoding='utf-8')):
        raw=json.loads((DATA/('results-'+prefix+'-full')/(case['id']+'.json')).read_text(encoding='utf-8'))
        assert raw['status']=='completed' and raw['apk_sha256']==state['apk_sha256']
        entries=raw['transcript']['transcript']
        if case['id']!='t02':
            assert 'Краткое резюме' in raw.get('summary_and_ui',[]),'LLM completion not confirmed'
            assert 'Отменить обработку' not in raw.get('summary_and_ui',[]),'Pipeline was still busy'
        valid=set(raw['transcript'])=={'transcript'} and all(set(s)=={'speaker_id','start_ms','end_ms','text'} and type(s['start_ms']) is int and type(s['end_ms']) is int and isinstance(s['speaker_id'],str) and isinstance(s['text'],str) and 0<=s['start_ms']<s['end_ms']<=round(case['duration_s']*1000) for s in entries)
        assert valid
        assert case['id']=='t02' or entries,'Speech disappeared'
        assert case['id']!='t02' or not entries,'Silence hallucination'
        assert hashlib.sha256(Path(case['file']).read_bytes()).hexdigest()==case['sha256']
        row=dict(id=case['id'],status=raw['status'],duration_s=case['duration_s'],elapsed_s=raw['elapsed_s'],rtf=raw['rtf'],sampled_peak_pss_kb=raw['sampled_peak_pss_kb'],idle_pss_kb=raw.get('idle_pss_kb'),utterances=len(entries),speakers=len({s['speaker_id'] for s in entries}),words=sum(len(normalize(s['text'])) for s in entries),schema_and_bounds_ok=valid,completion_scope='pipeline_idle',stages=raw['stages'],input_sha256=case['sha256'])
        if case.get('reference_text'): row['asr_score']=wer(case['reference_text'],' '.join(s['text'] for s in entries))
        if case.get('rttm'): row['diarization_score']=der(case['rttm'],entries,case['duration_s'])
        old=next(s for s in baseline['cases'] if s['id']==case['id'])
        if old.get('diarization_score'): row['published_release_der']=old['diarization_score']['der']
        recent=next((s for s in earlier['cases'] if s['id']==case['id']),None)
        if recent and recent.get('diarization_score'): row['candidate_5825896_der']=recent['diarization_score']['der']
        records.append(row)
    repeats=[json.loads((DATA/('results-'+prefix+'-repeat')/(f'repeat{i}.json')).read_text(encoding='utf-8')) for i in range(1,4)]
    pids={s['process_pid'] for s in repeats}|{s['process_pid_after'] for s in repeats}
    assert len(pids)==1 and '' not in pids
    for s in repeats: assert wer(s['case']['reference_text'],' '.join(t['text'] for t in s['transcript']['transcript']))['wer']==0
    cancel_id=state.get('cancellation_case_id','t04' if (DATA/('results-'+prefix+'-cancel')/'t04.json').exists() else 't01')
    cancel=json.loads((DATA/('results-'+prefix+'-cancel')/(cancel_id+'.json')).read_text(encoding='utf-8'))
    repeated=dict(same_process=True,completed=3,idle_pss_kb=[s.get('idle_pss_kb') for s in repeats],sampled_peak_pss_kb=[s['sampled_peak_pss_kb'] for s in repeats],note='Three repetitions are a smoke test, not proof of no memory leaks; PSS includes caches and GC effects.')
    exercised=bool(cancel.get('cancel_requested') and cancel.get('cancellation_ui'))
    cancelled=dict(status='passed' if exercised else 'not_verified',input_case=cancel_id,cancel_exercised=exercised,transcript_preserved=True if exercised and cancel['transcript']['transcript'] else None,elapsed_s=cancel['elapsed_s'],cancel_requested_at_s=cancel.get('cancel_at_s'),observed_wait_after_request_s=round(cancel['elapsed_s']-cancel['cancel_at_s'],2) if exercised else None,reason=None if exercised else 'Automation did not reach actual cancellation; processing completed normally. No cancellation success or application failure is inferred.')
    state.update(full_completed=len(records),same_process_repeats=3,cancel_test_status=cancelled['status'])
    output=dict(configuration=dict(model='3dspeaker',threshold=.8,min_duration_on=.2,min_duration_off=.3,blank_penalty=0,interval_padding_ms=0),build_and_network=state,cases=records,repeated_processing=repeated,cancellation=cancelled,device='Android 17 x86_64 emulator, configured RAM 4096 MB; Redmi/ARM runtime not tested',timing_scope='Speech cases wait for LLM and export; silence finishes with an empty transcript. Elapsed includes UI polling/export and memory sampling, not isolated inference.')
    (ROOT/'artifacts/test-results/der08-android-regression-2026-11-07.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(cases=len(records),repeated=repeated,cancellation=cancelled),ensure_ascii=False,indent=2))

if __name__=='__main__': main()
