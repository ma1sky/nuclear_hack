package expo.modules.audioengine

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import expo.modules.audioengine.audio.AudioSource
import java.nio.FloatBuffer

/**
 * pyannote segmentation-3.0 without sherpa's per-window speaker embeddings.
 *
 * sherpa-onnx slides the 10 s segmentation window with a 1 s step and computes a speaker embedding for
 * every (window, local speaker): ~10x the recording length of audio goes through the embedding model,
 * which made an hour of audio take 15-20+ minutes. Here windows advance by 5 s, every frame is decided
 * by the window whose centre is nearest (no averaging), and each window's local speakers become
 * separate segments. Speaker identity is assigned afterwards by [Recluster], which embeds every segment
 * once. Holdout (57 RU+EN files): DER 9.3% vs 16.6% for the previous sherpa configuration.
 * Reference implementation and evaluation: tools/benchmark/fastseg_reference.py, docs/der-fast-2026-11-08.md.
 */
internal class FastSegmenter(modelPath: String, threads: Int) : AutoCloseable {
  private val env = OrtEnvironment.getEnvironment()
  private val session: OrtSession
  private val inputName: String

  init {
    val options = OrtSession.SessionOptions()
    options.setIntraOpNumThreads(threads)
    options.setInterOpNumThreads(1)
    session = env.createSession(modelPath, options)
    options.close()
    inputName = session.inputNames.first()
  }

  /** Segments in seconds; `speaker` is a per-window local track (window * 3 + k), not a global ID. */
  fun segment(audio: AudioSource, check: () -> Unit = {}, progress: (Int, Int) -> Unit = { _, _ -> }): List<Recluster.Seg> {
    val n = audio.sampleCount
    if (n == 0L) return emptyList()
    val starts = windowStarts(n)
    val total = n.toDouble() / SR
    val out = ArrayList<Recluster.Seg>()
    val buffer = FloatArray(WIN)
    for ((w, start) in starts.withIndex()) {
      check()
      val chunk = audio.read(start, start + WIN)
      java.util.Arrays.fill(buffer, 0f)
      System.arraycopy(chunk, 0, buffer, 0, chunk.size)
      val logits = infer(buffer)
      val t0 = start.toDouble() / SR
      val lo = if (w == 0) 0.0 else (t0 + starts[w - 1].toDouble() / SR) / 2 + HALF
      val hi = if (w == starts.lastIndex) total else (t0 + starts[w + 1].toDouble() / SR) / 2 + HALF
      out.addAll(windowSegments(logits, t0, lo, hi, total, w))
      progress(w + 1, starts.size)
    }
    return out.sortedWith(compareBy({ it.start }, { it.end }, { it.speaker }))
  }

  private fun infer(window: FloatArray): Array<FloatArray> {
    OnnxTensor.createTensor(env, FloatBuffer.wrap(window), longArrayOf(1, 1, WIN.toLong())).use { tensor ->
      session.run(mapOf(inputName to tensor)).use { result ->
        @Suppress("UNCHECKED_CAST")
        return (result[0].value as Array<Array<FloatArray>>)[0]
      }
    }
  }

  override fun close() {
    session.close()
  }

  companion object {
    const val SR = 16_000
    const val WIN = 160_000
    private const val HOP = 80_000L // 5 s
    private const val HALF = 5.0    // half a window, seconds
    private const val SHIFT = 270
    private const val RF = 991
    private const val MIN_ON = 0.2
    private const val MIN_OFF = 0.3
    private val POWERSET = arrayOf(intArrayOf(), intArrayOf(0), intArrayOf(1), intArrayOf(2), intArrayOf(0, 1), intArrayOf(0, 2), intArrayOf(1, 2))

    /** Same window schedule as the Python reference. */
    fun windowStarts(n: Long): List<Long> {
      val starts = ArrayList<Long>()
      val limit = maxOf(1L, n - WIN + HOP)
      var s = 0L
      while (s < limit) { starts.add(s); s += HOP }
      if (starts.last() + WIN < n) starts.add(if (n > WIN) n - WIN else 0L)
      return starts
    }

    /** Powerset log-probs (T x 7) of one window -> segments of its 3 local speakers inside [lo, hi). */
    fun windowSegments(logits: Array<FloatArray>, t0: Double, lo: Double, hi: Double, total: Double, window: Int): List<Recluster.Seg> {
      val frames = logits.size
      val fdur = SHIFT.toDouble() / SR
      val foff = RF / 2.0 / SR
      val active = Array(3) { BooleanArray(frames) }
      for (j in 0 until frames) {
        val row = logits[j]
        var best = 0
        for (c in 1 until row.size) if (row[c] > row[best]) best = c
        val time = t0 + foff + j * fdur
        if (time < lo || time >= hi || time >= total) continue
        for (k in POWERSET[best]) active[k][j] = true
      }
      val result = ArrayList<Recluster.Seg>()
      for (k in 0 until 3) {
        val pieces = ArrayList<DoubleArray>()
        var j = 0
        while (j < frames) {
          if (!active[k][j]) { j++; continue }
          val b = j
          while (j < frames && active[k][j]) j++
          val start = t0 + foff + b * fdur - fdur / 2
          val end = minOf(total, t0 + foff + (j - 1) * fdur + fdur / 2)
          val last = pieces.lastOrNull()
          if (last != null && start - last[1] <= MIN_OFF) last[1] = maxOf(last[1], end) else pieces.add(doubleArrayOf(start, end))
        }
        for (p in pieces) if (p[1] - p[0] >= MIN_ON) result.add(Recluster.Seg(p[0], p[1], window * 3 + k))
      }
      return result
    }
  }
}
