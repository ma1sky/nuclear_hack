"""Full offline emulator regression, preserving baseline and network state."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,zipfile

ROOT=Path(__file__).resolve().parents[2]; DATA=ROOT/'recordings/benchmark'; STUDY=DATA/'der-study'
ADB=str(Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))/'platform-tools/adb.exe')
SERIAL=os.environ.get('ANDROID_SERIAL','emulator-5554')
APK=ROOT/os.environ.get('BENCHMARK_APK_PATH','app/android/app/build/outputs/apk/release/app-release.apk')
BASE=ROOT/os.environ.get('BENCHMARK_BASELINE_APK','artifacts/releases/v1.0.0-hackathon.1/nuclear-stenographer-1.0.0-arm64-x86_64.apk')
def adb(*args): return subprocess.check_output([ADB,'-s',SERIAL,*args]).decode('utf-8',errors='replace').strip()
def save(name,value): (STUDY/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

digest=hashlib.sha256(APK.read_bytes()).hexdigest(); prefix='der08-'+digest[:12]
installed=adb('shell','pm','path','team.hex.nuclearstenographer').splitlines()
base=next(line.removeprefix('package:') for line in installed if line.endswith('/base.apk'))
assert adb('shell','sha256sum',base).split()[0]==digest,'Install this APK before running the benchmark'
with zipfile.ZipFile(BASE) as old,zipfile.ZipFile(APK) as new:
    name='assets/index.android.bundle'
    assert old.read(name)==new.read(name),'UI bundle changed'
    bundle_hash=hashlib.sha256(new.read(name)).hexdigest()
    actual_abis=sorted({entry.split('/')[1] for entry in new.namelist() if entry.startswith('lib/')})
state=dict(airplane_before=adb('shell','settings','get','global','airplane_mode_on'),wifi_before=adb('shell','settings','get','global','wifi_on'),apk_sha256=digest,result_prefix=prefix,js_bundle_sha256=bundle_hash,ui_unchanged=True,abis=actual_abis)
save('android-run-state.json',state)
env=os.environ.copy(); env['BENCHMARK_APK_SHA256']=digest; env['ANDROID_SERIAL']=SERIAL
for key in ['BENCHMARK_CASE_IDS','BENCHMARK_MANIFEST','BENCHMARK_REUSE_PROCESS','BENCHMARK_CANCEL_STAGE']: env.pop(key,None)

def run(suffix,manifest='manifest.json',reuse=False,cancel=None,case_ids=None):
    child=env.copy(); child['BENCHMARK_RESULT_SET']=prefix+'-'+suffix; child['BENCHMARK_MANIFEST']=manifest
    if reuse: child['BENCHMARK_REUSE_PROCESS']='1'
    if cancel: child['BENCHMARK_CANCEL_STAGE']=cancel
    if case_ids: child['BENCHMARK_CASE_IDS']=case_ids
    subprocess.run([sys.executable,str(ROOT/'tools/benchmark/run_android_benchmark.py')],env=child,check=True)
    rows=json.loads((DATA/manifest).read_text(encoding='utf-8'))
    if case_ids: rows=[row for row in rows if row['id'] in case_ids.split(',')]
    output=[json.loads((DATA/('results-'+child['BENCHMARK_RESULT_SET'])/(row['id']+'.json')).read_text(encoding='utf-8')) for row in rows]
    assert all(row['status']=='completed' and row['apk_sha256']==digest for row in output),'Android regression failure'
    return output

try:
    adb('shell','cmd','connectivity','airplane-mode','enable'); adb('shell','svc','wifi','disable')
    state['offline_airplane']=adb('shell','settings','get','global','airplane_mode_on')
    state['offline_wifi']=adb('shell','settings','get','global','wifi_on')
    assert state['offline_airplane']=='1' and state['offline_wifi']=='0'
    save('android-run-state.json',state)
    full=run('full')
    original=json.loads((DATA/'manifest.json').read_text(encoding='utf-8'))[0]
    repeats=[]; folder=STUDY/'repeat-cases'; folder.mkdir(exist_ok=True)
    for index in range(1,4):
        row=original.copy(); row['id']=f'repeat{index}'; wav=folder/(row['id']+'-golos.wav'); shutil.copyfile(original['file'],wav); row['file']=str(wav); repeats.append(row)
    save('repeat-manifest.json',repeats)
    repeated=run('repeat','der-study/repeat-manifest.json',reuse=True)
    pids={r['process_pid'] for r in repeated}|{r['process_pid_after'] for r in repeated}
    assert len(pids)==1 and '' not in pids,'Repeat test did not use one process'
    cancelled=run('cancel',cancel='Создание резюме',case_ids='t04')[0]
    assert cancelled['cancel_requested'] and cancelled.get('cancellation_ui') and cancelled['transcript']['transcript'],'Cancellation was not exercised or transcript lost'
    state['full_completed']=len(full); state['same_process_repeats']=len(repeated); state['cancel_preserved_transcript']=True; state['cancellation_case_id']='t04'
finally:
    adb('shell','cmd','connectivity','airplane-mode','enable' if state['airplane_before']=='1' else 'disable')
    adb('shell','svc','wifi','enable' if state['wifi_before']=='1' else 'disable')
    state['airplane_restored']=adb('shell','settings','get','global','airplane_mode_on')
    state['wifi_restored']=adb('shell','settings','get','global','wifi_on')
    save('android-run-state.json',state)
print(json.dumps(state,ensure_ascii=False),flush=True)
