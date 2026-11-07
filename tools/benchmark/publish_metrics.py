"""Publish aggregate benchmark metrics without copyrighted audio/transcripts."""
from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'recordings/benchmark'


def main():
    subprocess.run([sys.executable, str(ROOT / 'tools/benchmark/score_benchmark.py')], check=True)
    scores = json.loads((DATA / 'scores.json').read_text(encoding='utf-8'))
    manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    if len(scores) != 10 or any(row['status'] not in {'completed', 'app_error', 'process_died', 'timeout', 'automation_error'} for row in scores):
        raise RuntimeError('All ten current audio hashes must have terminal test results first')
    for score in scores:
        raw = json.loads((DATA / 'results' / (score['id'] + '.json')).read_text(encoding='utf-8'))
        score['completion_scope'] = 'not_available' if score['status'] != 'completed' else (
            'transcript_export_available'
            if 'Отменить обработку' in raw.get('summary_and_ui', [])
            else 'pipeline_idle'
        )
    report = {
        'release': 'v1.0.0-hackathon.1',
        'apk_sha256': '1652b8f8d0d1d201079d07341b615586d2ebfd2d49447141adc853651870766d',
        'device': 'Medium_Phone_API_37.0 emulator, Android 17, x86_64, configured RAM 4096 MB',
        'timing_note': 'elapsed_s ends at JSON capture; completion_scope states whether LLM was still active. Includes UI polling overhead. PSS is a sampled maximum, not a true peak.',
        'total_audio_s': sum(row['duration_s'] for row in manifest),
        'cases': scores,
        'inputs': [
            {key: (Path(value).name if key in ['file', 'rttm'] and value else value)
             for key, value in row.items()}
            for row in manifest
        ],
    }
    destination = ROOT / 'artifacts/test-results'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'podcast-benchmark-2026-11-07.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    for name in ['threshold-tuning.json', 'threshold-holdout.json']:
        if (DATA / name).exists():
            shutil.copyfile(DATA / name, destination / name)
    print('Published aggregate metrics for ten recordings')


if __name__ == '__main__':
    main()
