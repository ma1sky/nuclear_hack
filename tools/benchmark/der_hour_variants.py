"""Research: where does the missed speech on the AMI hour come from? Variants of segmentation feeding the
same Recluster (CAM++, tau 0.6). Also reports speech-activity-only error (all speakers collapsed)."""
import argparse, json, time
import numpy as np, soundfile as sf, sherpa_onnx as so
import fastseg_reference as fr
from der_fast import der, read_rttm, recluster

def sad(ref, hyp, duration):
    one = lambda segs: [(s, e, 'x') for s, e, _ in segs]
    return der(one(ref), one(hyp), duration)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--audio'); ap.add_argument('--rttm'); ap.add_argument('--models'); a = ap.parse_args()
    audio, _ = sf.read(a.audio, dtype='float32'); audio = fr.normalize(audio); dur = len(audio) / 16000; ref = read_rttm(a.rttm)
    seg = f'{a.models}/pyannote-segmentation.int8.onnx'; camp = f'{a.models}/campplus-zh-en.onnx'
    ext = so.SpeakerEmbeddingExtractor(so.SpeakerEmbeddingExtractorConfig(model=camp, num_threads=4))
    def run(name, segs_fn):
        t = time.time(); segs = segs_fn(); t1 = time.time(); hyp = recluster(audio, segs, ext)
        d = der(ref, [(s, e, str(k)) for s, e, k in hyp], dur); sd = sad(ref, hyp, dur); sr = sad(ref, segs, dur)
        print(name, json.dumps({'der': round(d['der'], 4), 'miss': round(d['miss'], 4), 'fa': round(d['false_alarm'], 4), 'conf': round(d['confusion'], 4),
              'spk': d['hyp_speakers'], 'sad_miss_final': round(sd['miss'], 4), 'sad_miss_segments': round(sr['miss'], 4),
              'seg_s': round(t1 - t, 1), 'cluster_s': round(time.time() - t1, 1)}), flush=True)
    run('fast_step5', lambda: fr.segment(audio, seg, 4))
    fr.HOP = 40000; run('fast_step2.5', lambda: fr.segment(audio, seg, 4)); fr.HOP = 80000
    fr.MIN_ON = 0.05; fr.MIN_OFF = 0.1; run('fast_step5_minon0.05', lambda: fr.segment(audio, seg, 4)); fr.MIN_ON = 0.2; fr.MIN_OFF = 0.3
    def sherpa_segs():
        c = so.OfflineSpeakerDiarizationConfig(
            segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg), num_threads=4),
            embedding=so.SpeakerEmbeddingExtractorConfig(model=camp, num_threads=4),
            clustering=so.FastClusteringConfig(num_clusters=-1, threshold=0.8), min_duration_on=0.2, min_duration_off=0.3)
        return [(s.start, s.end, int(s.speaker)) for s in so.OfflineSpeakerDiarization(c).process(audio).sort_by_start_time()]
    run('sherpa_campp_seg', sherpa_segs)

if __name__ == '__main__': main()
