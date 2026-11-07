package expo.modules.audioengine

import expo.modules.audioengine.audio.AudioSource
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sqrt

/**
 * Global speaker re-clustering on top of pyannote segmentation.
 *
 * sherpa-onnx clusters per-window embeddings with a single fixed threshold, which over-splits voices
 * (extra speaker IDs) on real recordings. Here every diarized segment is re-embedded on up to 3 s windows,
 * segments are grouped by average-linkage clustering on cosine distance, small clusters are folded into the
 * nearest large one and labels are refined against cluster centroids (an eigengap speaker-count estimate is
 * available but disabled: it under-counted speakers on natural conversations). Validated in the DER v2 study (holdout DER 9.2%); used here to link speakers across chunks of long recordings.
 */
internal object Recluster {
  data class Seg(val start: Double, val end: Double, val speaker: Int)

  data class Params(
    val tau: Double = 0.55,          // cosine-distance cut for average-linkage AHC (CAM++ zh-en embeddings)
    val useSpectral: Boolean = false, // eigengap estimate: under-counts natural speech, kept for experiments
    val pruning: Double = 0.5,       // share of neighbours kept per row of the affinity matrix
    val maxSpeakers: Int = 12,
    val minEmbed: Double = 0.6,      // shorter segments inherit the label of the nearest embedded segment
    val window: Double = 3.0,
    val hop: Double = 1.5,
    val smallShare: Double = 0.02,   // clusters below max(2 s, 2% of speech) are folded
    val smallMin: Double = 2.0,
    val iterations: Int = 2,
    val mergeGap: Double = 0.5,
  )

  fun interface Embedder { fun embed(samples: FloatArray): FloatArray? }

  fun run(audio: AudioSource, segments: List<Seg>, embedder: Embedder, p: Params = Params(), check: () -> Unit = {}): List<Seg> {
    if (segments.isEmpty()) return emptyList()
    val sr = 16_000
    val vecs = arrayOfNulls<FloatArray>(segments.size)
    val durs = DoubleArray(segments.size) { segments[it].end - segments[it].start }
    for ((i, s) in segments.withIndex()) {
      check()
      val d = durs[i]
      if (d < p.minEmbed) continue
      val total = audio.sampleCount
      val from = (s.start * sr).roundToLong().coerceIn(0, total)
      val to = (s.end * sr).roundToLong().coerceIn(from, total)
      var acc: FloatArray? = null
      var weight = 0.0
      var st = 0.0
      while (true) {
        val en = min(d, st + p.window)
        val a = from + (st * sr).roundToLong()
        val b = min(to, from + (en * sr).roundToLong())
        if (b - a >= sr / 4) {
          val v = embedder.embed(audio.read(a, b))
          if (v != null) {
            normalize(v)
            if (acc == null) acc = FloatArray(v.size)
            val w = (en - st).toFloat()
            for (k in v.indices) acc[k] += v[k] * w
            weight += w
          }
        }
        if (d <= p.window) break
        st += p.hop
        if (st >= d - 0.5) break // same window schedule as tools/benchmark/der_v2.py
      }
      if (acc != null && weight > 0) { normalize(acc); vecs[i] = acc }
    }
    val idx = vecs.indices.filter { vecs[it] != null }
    if (idx.isEmpty()) return merge(segments.map { Seg(it.start, it.end, 0) }, p.mergeGap)
    val x = idx.map { vecs[it]!! }
    val w = DoubleArray(idx.size) { durs[idx[it]] }
    check()

    var labels = if (x.size == 1) IntArray(1) else {
      val k = if (p.useSpectral) spectralCount(x, w, p.pruning, p.maxSpeakers) else -1
      averageLinkage(x, if (k > 0) Double.MAX_VALUE else p.tau, k)
    }
    check()
    // Fold small clusters and refine against centroids.
    val total = w.sum()
    repeat(p.iterations + 1) {
      val ids = labels.distinct()
      val dur = ids.associateWith { id -> labels.indices.filter { labels[it] == id }.sumOf { w[it] } }
      var big = ids.filter { dur.getValue(it) >= max(p.smallMin, p.smallShare * total) }
      if (big.isEmpty()) big = listOf(ids.maxBy { dur.getValue(it) })
      val centroids = big.map { id -> centroid(x, w, labels, id) }
      val next = IntArray(labels.size) { i -> big[centroids.indices.maxBy { dot(x[i], centroids[it]) }] }
      if (next.contentEquals(labels)) return@repeat
      labels = next
    }
    val out = IntArray(segments.size) { -1 }
    idx.forEachIndexed { j, i -> out[i] = labels[j] }
    val centers = idx.map { (segments[it].start + segments[it].end) / 2 }
    for (i in segments.indices) if (out[i] < 0) {
      val c = (segments[i].start + segments[i].end) / 2
      out[i] = out[idx[centers.indices.minBy { abs(centers[it] - c) }]]
    }
    return merge(segments.indices.map { Seg(segments[it].start, segments[it].end, out[it]) }.sortedBy { it.start }, p.mergeGap)
  }

  private fun merge(list: List<Seg>, gap: Double): List<Seg> {
    val res = ArrayList<Seg>()
    for (s in list.sortedWith(compareBy({ it.start }, { it.end }))) {
      val last = res.lastOrNull()
      if (last != null && last.speaker == s.speaker && s.start - last.end <= gap) res[res.size - 1] = Seg(last.start, max(last.end, s.end), s.speaker)
      else res.add(s)
    }
    return res
  }

  private fun normalize(v: FloatArray) {
    var n = 0.0
    for (f in v) n += f * f
    val inv = (1.0 / (sqrt(n) + 1e-9)).toFloat()
    for (i in v.indices) v[i] *= inv
  }

  private fun dot(a: FloatArray, b: FloatArray): Double { var s = 0.0; for (i in a.indices) s += a[i] * b[i]; return s }

  private fun centroid(x: List<FloatArray>, w: DoubleArray, labels: IntArray, id: Int): FloatArray {
    val c = FloatArray(x[0].size)
    for (i in x.indices) if (labels[i] == id) for (k in c.indices) c[k] += (x[i][k] * w[i]).toFloat()
    normalize(c); return c
  }

  /** Average-linkage agglomerative clustering on cosine distance; stops at [cut] or at [k] clusters. */
  fun averageLinkage(x: List<FloatArray>, cut: Double, k: Int): IntArray {
    val n = x.size
    val d = Array(n) { i -> DoubleArray(n) { j -> if (i == j) Double.MAX_VALUE else 1.0 - dot(x[i], x[j]) } }
    val size = IntArray(n) { 1 }
    val alive = BooleanArray(n) { true }
    val member = IntArray(n) { it }
    val nn = IntArray(n); val nd = DoubleArray(n)
    fun refresh(i: Int) {
      var b = -1; var bd = Double.MAX_VALUE
      for (j in 0 until n) if (alive[j] && j != i && d[i][j] < bd) { bd = d[i][j]; b = j }
      nn[i] = b; nd[i] = bd
    }
    for (i in 0 until n) refresh(i)
    var clusters = n
    while (clusters > 1) {
      if (k > 0 && clusters <= k) break
      var a = -1; var best = Double.MAX_VALUE
      for (i in 0 until n) if (alive[i] && nd[i] < best) { best = nd[i]; a = i }
      if (a < 0) break
      if (k <= 0 && best > cut) break
      val b = nn[a]
      // merge b into a (Lance-Williams update for average linkage)
      for (j in 0 until n) if (alive[j] && j != a && j != b) {
        val v = (d[a][j] * size[a] + d[b][j] * size[b]) / (size[a] + size[b])
        d[a][j] = v; d[j][a] = v
      }
      size[a] += size[b]; alive[b] = false
      for (j in 0 until n) if (member[j] == b) member[j] = a
      clusters--
      for (i in 0 until n) if (alive[i] && (i == a || nn[i] == a || nn[i] == b)) refresh(i)
      for (i in 0 until n) if (alive[i] && i != a && d[i][a] < nd[i]) { nd[i] = d[i][a]; nn[i] = a }
    }
    val remap = HashMap<Int, Int>()
    return IntArray(n) { remap.getOrPut(member[it]) { remap.size } }
  }

  /** Eigengap estimate of the number of speakers on a p-pruned cosine affinity graph. */
  fun spectralCount(xAll: List<FloatArray>, wAll: DoubleArray, pruning: Double, kmax: Int): Int {
    // Bound the O(n^3) eigen-solver: keep the longest segments (they carry the most reliable embeddings).
    val keep = wAll.indices.sortedByDescending { wAll[it] }.take(400).sorted()
    val x = keep.map { xAll[it] }
    val n = x.size
    if (n < 3) return 1
    val a = Array(n) { i -> DoubleArray(n) { j -> if (i == j) 0.0 else dot(x[i], x[j]) } }
    val keepPerRow = max(1, (pruning * n).roundToInt())
    val p = Array(n) { DoubleArray(n) }
    for (i in 0 until n) {
      val order = (0 until n).sortedByDescending { a[i][it] }.take(keepPerRow)
      for (j in order) p[i][j] = a[i][j]
    }
    val deg = DoubleArray(n)
    val s = Array(n) { i -> DoubleArray(n) { j -> max(0.0, (p[i][j] + p[j][i]) / 2) } }
    for (i in 0 until n) deg[i] = s[i].sum() + 1e-9
    val l = Array(n) { i -> DoubleArray(n) { j -> (if (i == j) 1.0 else 0.0) - s[i][j] / sqrt(deg[i] * deg[j]) } }
    val ev = symmetricEigenvalues(l).sorted()
    val upto = min(kmax, n - 1)
    var bestK = 1; var bestGap = -1.0
    for (i in 0 until upto) {
      val gap = ev[i + 1] - ev[i]
      if (gap > bestGap) { bestGap = gap; bestK = i + 1 }
    }
    return bestK
  }

  /** Householder tridiagonalisation + implicit QL (eigenvalues only). */
  fun symmetricEigenvalues(m: Array<DoubleArray>): DoubleArray {
    val n = m.size
    val a = Array(n) { m[it].copyOf() }
    val d = DoubleArray(n); val e = DoubleArray(n)
    for (i in n - 1 downTo 1) {
      val l = i - 1
      var h = 0.0
      if (l > 0) {
        var scale = 0.0
        for (k in 0..l) scale += abs(a[i][k])
        if (scale == 0.0) { e[i] = a[i][l] } else {
          for (k in 0..l) { a[i][k] /= scale; h += a[i][k] * a[i][k] }
          var f = a[i][l]
          val g = if (f >= 0) -sqrt(h) else sqrt(h)
          e[i] = scale * g; h -= f * g; a[i][l] = f - g
          f = 0.0
          for (j in 0..l) {
            a[j][i] = a[i][j] / h
            var gg = 0.0
            for (k in 0..j) gg += a[j][k] * a[i][k]
            for (k in j + 1..l) gg += a[k][j] * a[i][k]
            e[j] = gg / h
            f += e[j] * a[i][j]
          }
          val hh = f / (h + h)
          for (j in 0..l) {
            val ff = a[i][j]
            val gg = e[j] - hh * ff
            e[j] = gg
            for (k in 0..j) a[j][k] -= (ff * e[k] + gg * a[i][k])
          }
        }
      } else e[i] = a[i][l]
      d[i] = h
    }
    for (i in 0 until n) d[i] = a[i][i]
    for (i in 1 until n) e[i - 1] = e[i]
    e[n - 1] = 0.0
    for (l in 0 until n) {
      var iter = 0
      while (true) {
        var mm = l
        while (mm < n - 1) {
          val dd = abs(d[mm]) + abs(d[mm + 1])
          if (abs(e[mm]) <= 1e-12 * dd) break
          mm++
        }
        if (mm == l) break
        if (iter++ == 60) break
        var g = (d[l + 1] - d[l]) / (2.0 * e[l])
        var r = hypot(g, 1.0)
        g = d[mm] - d[l] + e[l] / (g + if (g >= 0) abs(r) else -abs(r))
        var s = 1.0; var c = 1.0; var p = 0.0
        var i = mm - 1
        var underflow = false
        while (i >= l) {
          var f = s * e[i]
          val b = c * e[i]
          r = hypot(f, g)
          e[i + 1] = r
          if (r == 0.0) { d[i + 1] -= p; e[mm] = 0.0; underflow = true; break }
          s = f / r; c = g / r
          g = d[i + 1] - p
          r = (d[i] - g) * s + 2.0 * c * b
          p = s * r
          d[i + 1] = g + p
          g = c * r - b
          f = 0.0
          i--
        }
        if (underflow) continue
        d[l] -= p; e[l] = g; e[mm] = 0.0
      }
    }
    return d
  }

  private fun hypot(a: Double, b: Double) = sqrt(a * a + b * b)
}
