from pathlib import Path
import subprocess,time,json,re,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'recordings/figma-ui-smoke';OUT.mkdir(exist_ok=True)
ADB=r'C:\Users\gutsa\AppData\Local\Android\Sdk\platform-tools\adb.exe'
PKG='team.hex.nuclearstenographer'
def adb(*args):
    r=subprocess.run([ADB,'-s','emulator-5554',*args],capture_output=True,timeout=90)
    if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace'))
    return r.stdout
def snap():
    for retry in range(5):
        try:
            adb('shell','uiautomator','dump','/sdcard/figma-ui.xml')
            return list(ET.fromstring(adb('shell','cat','/sdcard/figma-ui.xml')).iter('node'))
        except Exception:
            if retry==4:raise
            time.sleep(.5)
def labels():return [(n.get('text') or n.get('content-desc')) for n in snap() if n.get('text') or n.get('content-desc')]
def tap(label):
    for retry in range(5):
        nodes=snap()
        for node in nodes:
            if label in [node.get('text'),node.get('content-desc')] and node.get('enabled')=='true':
                bounds=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
                if len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]>bounds[1]:
                    adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));time.sleep(1);return
        time.sleep(1)
    raise RuntimeError('Missing: '+label+'; UI: '+str(labels()))
def set_input(value):
    nodes=snap();node=next(n for n in nodes if n.get('class')=='android.widget.EditText')
    bounds=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
    adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2))
    adb('shell','input','keyevent','123')
    adb('shell','input','keyevent',*(['67']*(len(node.get('text',''))+2)))
    adb('shell','input','text',value.replace(' ','%s'))
def capture(name):
    snap()
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    (OUT/(name+'.json')).write_text(json.dumps(labels(),ensure_ascii=False,indent=2),encoding='utf-8')
def open_route(route):
    adb('shell','am','start','-a','android.intent.action.VIEW','-d','stenographer:///'+route,PKG);time.sleep(2)
if __name__=='__main__':
    import sys
    if len(sys.argv)>1:
        if sys.argv[1]=='capture':capture(sys.argv[2]);print(json.dumps(labels(),ensure_ascii=False))
        elif sys.argv[1]=='tap':tap(sys.argv[2]);print(json.dumps(labels(),ensure_ascii=False))
        elif sys.argv[1]=='route':open_route(sys.argv[2]);print(json.dumps(labels(),ensure_ascii=False))
