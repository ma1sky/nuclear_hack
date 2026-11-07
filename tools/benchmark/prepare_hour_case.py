"""Download a real annotated AMI meeting and trim its first hour (no synthetic repeats)."""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, urllib.request, wave, zipfile
import xml.etree.ElementTree as ET

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2]/"recordings/hour-qa")
    out=parser.parse_args().output;out.mkdir(parents=True,exist_ok=True)
    base="https://groups.inf.ed.ac.uk/ami/"
    sources={"IN1016.Mix-Headset.wav":base+"AMICorpusMirror/amicorpus/IN1016/audio/IN1016.Mix-Headset.wav",
             "ami_public_manual_1.6.2.zip":base+"AMICorpusAnnotations/ami_public_manual_1.6.2.zip"}
    def download(item):
        name,url=item;target=out/name
        if not target.exists():
            temporary=target.with_suffix(target.suffix+".part")
            urllib.request.urlretrieve(url,temporary);temporary.replace(target)
        return name
    with concurrent.futures.ThreadPoolExecutor(2) as pool:list(pool.map(download,sources.items()))
    with wave.open(str(out/"IN1016.Mix-Headset.wav"),"rb") as source:
        assert source.getnchannels()==1 and source.getsampwidth()==2 and source.getframerate()==16000
        assert source.getnframes()>=3600*16000
        with wave.open(str(out/"hour-ami-IN1016.wav"),"wb") as target:
            target.setparams(source.getparams())
            for _ in range(360):target.writeframesraw(source.readframes(160000))
    segments=[];words=[]
    with zipfile.ZipFile(out/"ami_public_manual_1.6.2.zip") as archive:
        for name in archive.namelist():
            if not name.startswith(("segments/IN1016.","words/IN1016.")):continue
            speaker=Path(name).name.split(".")[1]
            for node in ET.fromstring(archive.read(name)):
                if "transcriber_start" in node.attrib:
                    start=float(node.attrib["transcriber_start"]);end=float(node.attrib["transcriber_end"])
                    if 0<=start<3600 and end>start:segments.append((speaker,start,min(end,3600)))
                elif node.tag=="w" and "starttime" in node.attrib and node.text:
                    start=float(node.attrib["starttime"]);end=float(node.attrib["endtime"])
                    if 0<=start<3600:words.append({"speaker":speaker,"start":start,"end":min(end,3600),"text":node.text})
    assert len(segments)>100 and len(words)>1000
    (out/"hour-ami-IN1016.rttm").write_text("".join(
        f"SPEAKER hour-ami-IN1016 1 {start:.3f} {end-start:.3f} <NA> <NA> {speaker} <NA> <NA>\n"
        for speaker,start,end in sorted(segments,key=lambda row:row[1])),encoding="utf-8")
    (out/"reference-words.json").write_text(json.dumps(sorted(words,key=lambda row:row["start"]),ensure_ascii=False,indent=2),encoding="utf-8")
    meta={"id":"hour-ami-IN1016","duration_s":3600,"language":"en","kind":"natural meeting, first 3600 seconds, no repetition",
          "source_audio":sources["IN1016.Mix-Headset.wav"],"source_annotations":sources["ami_public_manual_1.6.2.zip"],
          "license":"CC BY 4.0, AMI corpus","reference_segments":len(segments),"reference_words":len(words),
          "speakers":sorted(set(row[0] for row in segments)),
          "sha256":hashlib.sha256((out/"hour-ami-IN1016.wav").read_bytes()).hexdigest()}
    (out/"manifest.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,ensure_ascii=False))
if __name__=="__main__":main()
