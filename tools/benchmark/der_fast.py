"""DER of the app's diarization on one annotated recording (e.g. the AMI hour from prepare_hour_case.py).

Configurations:
  fast  — this version: FastSegmenter (fastseg_reference.py) + Recluster (CAM++ zh-en, AHC tau 0.6)
  v12   — v1.2: sherpa-onnx diarization, ERes2Net-base, FastClustering threshold 0.8
DER: collar 0 (and 0.25 s), overlaps scored, 10 ms step, optimal speaker mapping, weighted by reference speech.

Usage: python der_fast.py --audio x.wav --rttm x.rttm --models DIR [--configs fast,v12] [--out result.json]
"""
import argparse, json, time
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.optimize import linear_sum_assignment
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
import fastseg_reference as fr

SR = 16000


def read_rttm(path):
    out = []
    for line in Path(path).read_text().splitlines():
        p = line.split()
        if p and p[0] == 'SPEAKER': out.append((float(p[3]), float(p[3]) + float(p[4]), p[7]))
    return out


def der(ref, hyp, duration, collar=0.0, step=0.01):
    t = np.arange(step / 2, duration, step)
    rid = sorted({s[2] for s in ref}); hid = sorted({s[2] for s in hyp})
    R = np.zeros((len(t), max(1, len(rid))), bool); H = np.zeros((len(t), max(1, len(hid))), bool)
    for s, e, k in ref: R[(t >= s) & (t < e), rid.index(k)] = True
    for s, e, k in hyp: H[(t >= s) & (t < e), hid.index(k)] = True
    keep = np.ones(len(t), bool)
    if collar > 0:
        for s, e, _ in ref:
            for b in (s, e): keep &= ~((t > b - collar) & (t < b + collar))
    R, H = R[keep], H[keep]
    ov = R.astype(np.int64).T @ H.astype(np.int64)
    r, c = linear_sum_assignment(-ov); correct = ov[r, c].sum()
    rc, hc = R.sum(1), H.sum(1)
    miss = np.maximum(rc - hc, 0).sum(); fa = np.maximum(hc - rc, 0).sum()
    conf = np.minimum(rc, hc).sum() - correct; denom = rc.sum()
    return dict(der=float((miss + fa + conf) / denom), miss=float(miss / denom), false_alarm=float(fa / denom),
                confusion=float(conf / denom), ref_speakers=len(rid), hyp_speakers=len(hid))


def recluster(audio, segs, extractor, tau=0.6, min_emb=0.6, win=3.0, hop=1.5, small=0.02, small_min=2.0, iters=2, merge_gap=0.5):
    """Python twin of Recluster.kt (average-linkage AHC on cosine distance + small-cluster folding)."""
    def E(x):
        s = extractor.create_stream(); s.accept_waveform(SR, x); s.input_finished()
        v = np.array(extractor.compute(s), np.float32); return v / (np.linalg.norm(v) + 1e-9)
    items = []
    for s, e, _ in segs:
        d = e - s; a = audio[int(s * SR):int(e * SR)]
        if d < min_emb: items.append([s, e, None, d]); continue
        vs, ws = [], []
        if d <= win: vs.append(E(a)); ws.append(d)
        else:
            st = 0.0
            while st < d - 0.5:
                en = min(d, st + win); vs.append(E(a[int(st * SR):int(en * SR)])); ws.append(en - st); st += hop
        v = np.average(np.stack(vs), axis=0, weights=ws); items.append([s, e, v / (np.linalg.norm(v) + 1e-9), d])
    idx = [i for i, it in enumerate(items) if it[2] is not None]
    if not idx: return [(s, e, 0) for s, e, _, _ in items]
    X = np.stack([items[i][2] for i in idx]); W = np.array([items[i][3] for i in idx])
    lab = np.zeros(1, int) if len(idx) == 1 else fcluster(linkage(pdist(X, 'cosine'), 'average'), tau, 'distance') - 1
    total = W.sum()
    for _ in range(iters + 1):
        ks = np.unique(lab); dur = {k: W[lab == k].sum() for k in ks}
        big = [k for k in ks if dur[k] >= max(small_min, small * total)] or [max(ks, key=lambda k: dur[k])]
        C = np.stack([np.average(X[lab == k], axis=0, weights=W[lab == k]) for k in big]); C /= np.linalg.norm(C, axis=1, keepdims=True)
        new = np.array(big)[np.argmax(X @ C.T, axis=1)]
        if np.array_equal(new, lab): break
        lab = new
    out = [None] * len(items)
    for j, i in enumerate(idx): out[i] = int(lab[j])
    centers = np.array([(items[i][0] + items[i][1]) / 2 for i in idx])
    for i, it in enumerate(items):
        if out[i] is None: out[i] = out[idx[int(np.argmin(np.abs(centers - (it[0] + it[1]) / 2)))]]
    merged = []
    for s, e, k in sorted((items[i][0], items[i][1], out[i]) for i in range(len(items))):
        if merged and merged[-1][2] == k and s - merged[-1][1] <= merge_gap: merged[-1] = (merged[-1][0], max(e, merged[-1][1]), k)
        else: merged.append((s, e, k))
    return merged


def main():
    import sherpa_onnx as so
    ap = argparse.ArgumentParser()
    ap.add_argument('--audio', required=True); ap.add_argument('--rttm', required=True); ap.add_argument('--models', required=True)
    ap.add_argument('--configs', default='fast,v12'); ap.add_argument('--threads', type=int, default=4); ap.add_argument('--out')
    a = ap.parse_args(); M = Path(a.models)
    audio, sr = sf.read(a.audio, dtype='float32'); assert sr == SR
    if audio.ndim > 1: audio = audio.mean(axis=1)
    audio = fr.normalize(audio); duration = len(audio) / SR; ref = read_rttm(a.rttm)
    seg_model = str(M / 'pyannote-segmentation.int8.onnx')
    results = {'audio': a.audio, 'duration_s': duration, 'configs': {}}
    for cfg in a.configs.split(','):
        t0 = time.time()
        if cfg == 'fast':
            ext = so.SpeakerEmbeddingExtractor(so.SpeakerEmbeddingExtractorConfig(model=str(M / 'campplus-zh-en.onnx'), num_threads=a.threads))
            segs = fr.segment(audio, seg_model, a.threads); t1 = time.time()
            hyp = recluster(audio, segs, ext); timing = {'segmentation_s': round(t1 - t0, 1), 'clustering_s': round(time.time() - t1, 1)}
        elif cfg == 'v12':
            c = so.OfflineSpeakerDiarizationConfig(
                segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg_model), num_threads=a.threads),
                embedding=so.SpeakerEmbeddingExtractorConfig(model=str(M / 'eres2net-base.onnx'), num_threads=a.threads),
                clustering=so.FastClusteringConfig(num_clusters=-1, threshold=0.8), min_duration_on=0.2, min_duration_off=0.3)
            hyp = [(s.start, s.end, int(s.speaker)) for s in so.OfflineSpeakerDiarization(c).process(audio).sort_by_start_time()]
            timing = {}
        else: raise SystemExit(f'unknown config {cfg}')
        elapsed = time.time() - t0
        h = [(s, e, str(k)) for s, e, k in hyp]
        r = {'collar_0': der(ref, h, duration), 'collar_0.25': der(ref, h, duration, 0.25),
             'elapsed_s': round(elapsed, 1), 'rtf': round(elapsed / duration, 4), 'threads': a.threads, **timing}
        results['configs'][cfg] = r
        print(cfg, json.dumps(r), flush=True)
    if a.out: Path(a.out).write_text(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
