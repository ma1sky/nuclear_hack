package expo.modules.audioengine.audio

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Streaming windowed-sinc resampler to 16 kHz (same filter as [WavPreparer.resample]).
 *
 * Works block by block with constant memory, and uses a precomputed polyphase table instead of
 * evaluating sin/cos for every tap: an hour of 44.1/48 kHz audio resamples in seconds, not minutes.
 */
class StreamingResampler(private val inRate: Int, private val emit: (FloatArray, Int) -> Unit) {
  private val outRate = 16_000
  private val passthrough = inRate == outRate
  private val cutoff = min(1.0, outRate.toDouble() / inRate) * 0.94
  private val radius = ceil(16 / cutoff).toInt()
  private val taps = 2 * radius + 1
  // Phases: exact for rational ratios with a small denominator, otherwise quantized to 2048 steps.
  private val g = gcd(inRate, outRate)
  private val phaseCount = (outRate / g).let { if (it <= 2048) it else 2048 }
  private val exactPhases = outRate / g <= 2048
  private val table: Array<FloatArray> = if (passthrough) emptyArray() else Array(phaseCount) { p ->
    val frac = p.toDouble() / phaseCount
    FloatArray(taps) { t ->
      val distance = frac - (t - radius) // center - j, with j = base + (t - radius)
      val x = PI * distance * cutoff
      val sinc = if (kotlin.math.abs(x) < 1e-12) 1.0 else sin(x) / x
      (cutoff * sinc * (0.5 + 0.5 * cos(PI * distance / (radius + 1)))).toFloat()
    }
  }

  // Pending input: absolute index of buf[0] is bufStart.
  private var buf = FloatArray(1 shl 16)
  private var bufLen = 0
  private var bufStart = 0L
  private var totalIn = 0L
  private var nextOut = 0L
  private val out = FloatArray(4096)
  private var outLen = 0

  fun push(samples: FloatArray, length: Int = samples.size) {
    if (length <= 0) return
    if (passthrough) { emit(samples, length); return }
    if (bufLen + length > buf.size) {
      var cap = buf.size
      while (cap < bufLen + length) cap *= 2
      buf = buf.copyOf(cap)
    }
    System.arraycopy(samples, 0, buf, bufLen, length)
    bufLen += length
    totalIn += length
    produce(final = false)
  }

  fun finish() {
    if (passthrough) return
    produce(final = true)
    flushOut()
  }

  private fun produce(final: Boolean) {
    val totalOut = if (final) totalIn * outRate / inRate else Long.MAX_VALUE
    while (nextOut < totalOut) {
      val num = nextOut * inRate
      val base = num / outRate
      if (!final && base + radius >= bufStart + bufLen) break
      val phase = if (exactPhases) ((num % outRate) / g).toInt()
      else (((num % outRate).toDouble() / outRate) * phaseCount).toInt().coerceAtMost(phaseCount - 1)
      val w = table[phase]
      var sum = 0.0
      var weightSum = 0.0
      val first = base - radius
      for (t in 0 until taps) {
        val j = first + t
        if (j < 0 || j >= totalIn && final || j >= bufStart + bufLen) continue
        val k = (j - bufStart).toInt()
        if (k < 0) continue
        sum += buf[k] * w[t]
        weightSum += w[t]
      }
      out[outLen++] = if (weightSum == 0.0) 0f else (sum / weightSum).toFloat().coerceIn(-1f, 1f)
      if (outLen == out.size) flushOut()
      nextOut++
    }
    // Drop input no longer needed by future outputs.
    val keepFrom = (nextOut * inRate / outRate) - radius - 1
    val drop = (keepFrom - bufStart).coerceIn(0, bufLen.toLong()).toInt()
    if (drop > 0) {
      System.arraycopy(buf, drop, buf, 0, bufLen - drop)
      bufLen -= drop
      bufStart += drop
    }
  }

  private fun flushOut() {
    if (outLen > 0) { emit(out, outLen); outLen = 0 }
  }

  private companion object {
    fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)
  }
}
