from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import subprocess, threading, hashlib, shutil, os
BASES={'google':'https://dl.google.com/dl/android/maven2/', 'central':'https://repo.maven.apache.org/maven2/', 'plugins':'https://plugins.gradle.org/m2/'}
CACHE=Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'nuclear-hack' / 'maven-cache'
PROXY=os.environ.get('NUCLEAR_BUILD_PROXY', '')
GRADLE=Path.home()/'.gradle/caches/modules-2/files-2.1'
locks={}; guard=threading.Lock(); slots=threading.Semaphore(4)
class Handler(BaseHTTPRequestHandler):
 def do_HEAD(self): self.serve(False)
 def do_GET(self): self.serve(True)
 def serve(self, body):
  parts=self.path.lstrip('/').split('/',1)
  if len(parts)!=2 or parts[0] not in BASES or '..' in parts[1] or '?' in parts[1]: self.send_error(400); return
  url=BASES[parts[0]]+parts[1]
  key=hashlib.sha256(url.encode()).hexdigest()
  with guard: lock=locks.setdefault(key,threading.Lock())
  target=CACHE/key
  with lock:
   if not target.exists():
    CACHE.mkdir(parents=True, exist_ok=True)
    coordinates=parts[1].split('/')
    if len(coordinates)>=4:
     group='.'.join(coordinates[:-3]); artifact,version,filename=coordinates[-3:]
     existing=list((GRADLE/group/artifact/version).glob('*/'+filename))
     if existing: shutil.copyfile(existing[0],target)
     elif filename.endswith('.sha1'):
      existing=list((GRADLE/group/artifact/version).glob('*/'+filename[:-5]))
      if existing: target.write_text(hashlib.sha1(existing[0].read_bytes()).hexdigest())
   if not target.exists():
    with slots:
     order=[parts[0]]+[name for name in BASES if name!=parts[0]]
     for repository in order:
      remote=BASES[repository]+parts[1]
      result=subprocess.run(['curl.exe','--fail','--silent','--show-error','--location','--tls-max','1.2',*(['--proxy',PROXY] if PROXY else []),'--max-time','90','--retry','2','--output',str(target)+'.part',remote],capture_output=True)
      if result.returncode==0: break
      if b'404' not in result.stderr: break
    temp=Path(str(target)+'.part')
    if result.returncode:
     print('FETCH FAILED',url,result.stderr.decode(errors='replace')[-150:],flush=True)
     self.send_error(404 if b'404' in result.stderr else 502); return
    temp.replace(target)
    print('FETCH OK',remote,target.stat().st_size,flush=True)
  self.send_response(200); self.send_header('Content-Length',str(target.stat().st_size)); self.end_headers()
  if body:
   try:
    with target.open('rb') as source:
     while chunk:=source.read(1024*1024): self.wfile.write(chunk)
   except (BrokenPipeError,ConnectionResetError): pass
 def log_message(self,*args): pass
class Server(ThreadingHTTPServer):
 request_queue_size=256
 daemon_threads=True
 allow_reuse_address=True
print('Local verified Maven bridge: 127.0.0.1:8766',flush=True)
Server(('127.0.0.1',8766),Handler).serve_forever()
