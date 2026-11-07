from pathlib import Path
import collections,hashlib,json,platform,sys
import sherpa_onnx as so

ROOT=Path(__file__).resolve().parents[2]
STUDY=ROOT/'recordings/benchmark/der-study'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def aggregate(rows):
    assert rows
    ref=sum(row['score']['reference_speaker_time_s'] for row in rows)
    parts={key:sum(row['score'][key] for row in rows) for key in ['miss_s','false_alarm_s','confusion_s']}
    return dict(weighted_der=sum(parts.values())/ref,reference_speaker_time_s=ref,**parts,
        undercounted_cases=sum(row['score']['predicted_speakers']<row['score']['reference_speakers'] for row in rows),
        counts=[dict(id=row['id'],reference=row['score']['reference_speakers'],predicted=row['score']['predicted_speakers']) for row in rows])

def main():
    results=json.loads((STUDY/'results.json').read_text(encoding='utf-8'))
    inputs=json.loads((STUDY/'manifest.json').read_text(encoding='utf-8'))
    frozen=json.loads((STUDY/'frozen-candidates.json').read_text(encoding='utf-8'))
    for item in inputs:
        assert sha(Path(item['file']))==item['sha256']
        assert sha(Path(item['rttm']))==item['reference_sha256']
    candidates=[]
    for choice in frozen:
        rows=[r for r in results if r['configuration']['model']==choice['model'] and r['configuration']['threshold']==choice['threshold'] and r['configuration']['min_duration_off']==choice['min_duration_off']]
        grouped={split:[row for row in rows if row['split']==split] for split in ['development','ru_holdout','vox_validation']}
        assert {key:len(value) for key,value in grouped.items()}=={'development':4,'ru_holdout':6,'vox_validation':6},'Evaluation incomplete'
        candidates.append(dict(**choice,metrics={key:aggregate(value) for key,value in grouped.items()}))
    baseline=candidates[0]
    accepted=[]
    for candidate in candidates[1:]:
        ru=candidate['metrics']['ru_holdout']; natural=candidate['metrics']['vox_validation']
        gates=dict(ru_der=ru['weighted_der']<=baseline['metrics']['ru_holdout']['weighted_der']*.95,
            ru_participants=ru['undercounted_cases']<=baseline['metrics']['ru_holdout']['undercounted_cases'],
            natural_der=natural['weighted_der']<=baseline['metrics']['vox_validation']['weighted_der']+.02)
        candidate['gates']=gates
        if all(gates.values()): accepted.append(candidate)
    winner=min(accepted,key=lambda c:(c['metrics']['ru_holdout']['weighted_der'],c['metrics']['vox_validation']['weighted_der'])) if accepted else baseline
    public_inputs=[{key:(Path(value).name if key in ['file','rttm'] else value) for key,value in row.items()} for row in inputs]
    output=dict(base_commit='5825896',python=platform.python_version(),sherpa_version=so.__version__,threads=2,
        protocol=json.loads((STUDY/'selection-protocol.json').read_text(encoding='utf-8')),
        frozen_candidates_sha256=sha(STUDY/'frozen-candidates.json'),candidates=candidates,selected_configuration={key:winner[key] for key in ['model','threshold','min_duration_off']},
        accepted_new_configuration=bool(accepted),inputs=public_inputs,sources=json.loads((STUDY/'sources.json').read_text(encoding='utf-8')),results=results,
        experiment_code_sha256={name:sha(ROOT/'tools/benchmark'/name) for name in ['der_study.py','score_benchmark.py','speaker_assignment.py','compare_diarization_versions.py']})
    (ROOT/'artifacts/test-results/der-study-2026-11-07.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(candidates=candidates,winner=output['selected_configuration'],accepted=bool(accepted)),ensure_ascii=False,indent=2))

if __name__=='__main__': main()
