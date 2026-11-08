"""Build the fixed Russian window-linking corpus from already downloaded benchmark inputs.
No private recordings are read. Synthetic 60s mixtures are repeated, not described as podcasts.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[2]

def local_path(value):
    path=Path(value)
    if path.exists():return path
    # Existing manifests may have been produced in another checkout.
    for directory in [ROOT/"recordings/benchmark/cases",ROOT/"recordings/benchmark/der-study"]:
        candidate=directory/path.name
        if candidate.exists():return candidate
    raise FileNotFoundError(value)

def main():
    cases=json.loads((ROOT/"artifacts/test-results/ru-speed-2026-11-08/cases.json").read_text(encoding="utf-8"))
    study=json.loads((ROOT/"recordings/benchmark/der-study/manifest.json").read_text(encoding="utf-8"))
    original=json.loads((ROOT/"recordings/benchmark/manifest.json").read_text(encoding="utf-8"))
    for case in cases:
        target=ROOT/case["file"]
        target.parent.mkdir(parents=True,exist_ok=True)
        if case.get("rttm"):
            source=next(row for row in study if row["id"]==case["source_case"])
            audio,sr=sf.read(local_path(source["file"]),dtype="float32")
            assert sr==16000 and audio.ndim==1 and len(audio)==60*sr
            sf.write(target,np.tile(audio,3),sr,subtype="PCM_16")
            lines=[]
            for repeat in range(3):
                for line in local_path(source["rttm"]).read_text(encoding="utf-8").splitlines():
                    fields=line.split();fields[1]=case["id"];fields[3]=str(float(fields[3])+60*repeat)
                    lines.append(" ".join(fields))
            reference=ROOT/case["rttm"]
            reference.write_text("\n".join(lines)+"\n",encoding="utf-8")
            case["rttm"]=str(reference)
        elif case["id"].startswith("ru-speed-podcast"):
            source=next(row for row in original if row["id"]==case["source_case"])
            audio,sr=sf.read(local_path(source["file"]),dtype="float32",frames=int(case["duration_s"]*16000))
            assert sr==16000 and audio.ndim==1
            sf.write(target,audio,sr,subtype="PCM_16")
        assert hashlib.sha256(target.read_bytes()).hexdigest()==case["sha256"],case["id"]+": unexpected audio bytes"
        case["file"]=str(target)
    (ROOT/"recordings/ru-speed/manifest.json").write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Prepared and hash-checked",len(cases),"Russian cases")

if __name__=="__main__":main()
