from pathlib import Path
import subprocess,os
root=Path(__file__).resolve().parents[2]; data=root/'recordings/benchmark'; data.mkdir(parents=True,exist_ok=True)
sources={
 'ru-book-shard-0000.tar':'https://huggingface.co/datasets/mexus/ru-book-mix-10h/resolve/main/data/shard-0000.tar',
 'ru-book-shard-0001.tar':'https://huggingface.co/datasets/mexus/ru-book-mix-10h/resolve/main/data/shard-0001.tar',
 'golos-row.json':'https://datasets-server.huggingface.co/rows?dataset=bond005%2Fsberdevices_golos_10h_crowd&config=default&split=test&offset=0&length=1',
 'podcast-01.mp3':'https://cdn-s-video.arzamas.academy/audio/radio/podcast/nelovko/01_volkhvy_new.mp3',
 'podcast-07.mp3':'https://cdn-s-video.arzamas.academy/audio/radio/podcast/nelovko/07_pharaoh.mp3',
 'podcast-17.mp3':'https://cdn-s-video.arzamas.academy/audio/radio/podcast/nelovko/17_moska.mp3',
}
for name,url in sources.items():
 p=data/name
 if p.exists() and name!='golos-row.json': continue
 cmd=['curl.exe','--fail','--silent','--show-error','--location','--tls-max','1.2','--max-time','300','--retry','2']
 if os.environ.get('NUCLEAR_BUILD_PROXY'): cmd+=['--proxy',os.environ['NUCLEAR_BUILD_PROXY']]
 temporary=p.with_name(p.name+'.part')
 subprocess.run(cmd+[url,'-o',str(temporary)],check=True)
 temporary.replace(p)
 print('Downloaded',name,flush=True)
