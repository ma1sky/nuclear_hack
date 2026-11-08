"""Reference implementation of FastSegmenter.kt (pyannote segmentation-3.0, 10 s windows, 5 s step).

Every frame is decided by the window whose centre is nearest; local speakers of each window become
separate segments (no cross-window stitching: it merged different voices and raised DER). Final speaker
IDs come from Recluster (global re-clustering of per-segment CAM++ embeddings, tau 0.6).

Usage (CI cross-check):  python fastseg_reference.py <model.onnx> <audio.wav> <out.json>
"""
import json, sys
import numpy as np

SR = 16000; WIN = 160000; HOP = 80000; SHIFT = 270; RF = 991; MIN_ON = 0.2; MIN_OFF = 0.3
POWERSET = [(), (0,), (1,), (2,), (0, 1), (0, 2), (1, 2)]


def normalize(audio):
    """Same rule as AudioNormalizer.kt / PcmStore: boost quiet audio so p98 reaches 0.65 (max x8)."""
    step = max(1, len(audio) // 10000); count = len(audio) // step
    probes = np.sort(np.abs(audio[::step][:count])); p98 = float(probes[int(count * .98)])
    if .001 <= p98 <= .35:
        gain = np.float32(min(8, max(1, .65 / p98))); b = audio * gain; r = b.copy()
        m = b > .92; r[m] = .92 + .08 * np.tanh((b[m] - .92) / .08)
        m = b < -.92; r[m] = -.92 - .08 * np.tanh((-b[m] - .92) / .08)
        return r.astype(np.float32)
    return audio


def window_starts(n):
    starts = list(range(0, max(1, n - WIN + HOP), HOP))
    if starts[-1] + WIN < n: starts.append(n - WIN if n > WIN else 0)
    return starts


def segment(audio, model, threads=2):
    import onnxruntime as ort
    o = ort.SessionOptions(); o.intra_op_num_threads = threads; o.inter_op_num_threads = 1
    s = ort.InferenceSession(model, o); name = s.get_inputs()[0].name
    n = len(audio); total = n / SR; starts = window_starts(n)
    fdur = SHIFT / SR; foff = RF / 2 / SR
    out = []
    for w, st in enumerate(starts):
        x = audio[st:st + WIN]
        if len(x) < WIN: x = np.pad(x, (0, WIN - len(x)))
        cls = s.run(None, {name: x[None, None, :].astype(np.float32)})[0][0].argmax(-1)
        t0 = st / SR
        lo = 0.0 if w == 0 else (t0 + starts[w - 1] / SR) / 2 + 5.0
        hi = total if w == len(starts) - 1 else (t0 + starts[w + 1] / SR) / 2 + 5.0
        times = t0 + foff + np.arange(len(cls)) * fdur
        keep = (times >= lo) & (times < hi) & (times < total)
        for k in range(3):
            a = np.zeros(len(cls), np.int8)
            for c, spk in enumerate(POWERSET):
                if k in spk: a[cls == c] = 1
            a &= keep.astype(np.int8)
            edges = np.diff(np.concatenate([[0], a, [0]]).astype(int))
            pieces = []
            for b, e in zip(np.where(edges == 1)[0], np.where(edges == -1)[0]):
                start = t0 + foff + b * fdur - fdur / 2; end = min(total, t0 + foff + (e - 1) * fdur + fdur / 2)
                if pieces and start - pieces[-1][1] <= MIN_OFF: pieces[-1][1] = max(pieces[-1][1], end)
                else: pieces.append([start, end])
            out += [(p[0], p[1], w * 3 + k) for p in pieces if p[1] - p[0] >= MIN_ON]
    return sorted(out)


if __name__ == '__main__':
    import soundfile as sf
    audio, sr = sf.read(sys.argv[2], dtype='float32')
    if audio.ndim > 1: audio = audio.mean(axis=1)
    assert sr == SR, 'reference expects 16 kHz input'
    segs = segment(normalize(audio), sys.argv[1])
    json.dump([[a, b] for a, b, _ in segs], open(sys.argv[3], 'w'))
    print(f'{len(segs)} segments')
