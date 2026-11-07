package expo.modules.audioengine.audio

import kotlin.math.abs
import kotlin.math.tanh

/**
 * Adaptive gain normalization and soft limiting.
 * Boosts quiet speech and distant voices to optimal ASR levels
 * while protecting against harsh digital clipping on sudden sound spikes.
 */
object AudioNormalizer {
  fun normalize(samples: FloatArray, cancellation: CancellationCheck = CancellationCheck.NONE): FloatArray {
    if (samples.size < 100) return samples

    // 1. Probe 98th percentile amplitude across up to 10,000 evenly spaced points
    val step = maxOf(1, samples.size / 10000)
    val probeCount = samples.size / step
    val probes = FloatArray(probeCount)
    var pIdx = 0
    var sIdx = 0
    while (sIdx < samples.size && pIdx < probeCount) {
      probes[pIdx++] = abs(samples[sIdx])
      sIdx += step
    }
    probes.sort()
    val p98 = probes[(probeCount * 0.98).toInt()]

    // 2. If the audio is quiet (p98 < 0.35) and not complete silence (p98 > 0.001)
    if (p98 in 0.001f..0.35f) {
      val target = 0.65f
      val gain = (target / p98).coerceIn(1.0f, 8.0f) // Up to +18 dB boost for quiet speech
      val output = FloatArray(samples.size)
      for (i in samples.indices) {
        if (i % 4096 == 0) cancellation.check()
        val boosted = samples[i] * gain
        // Soft-knee limiter at 0.92 to prevent harsh digital clipping
        output[i] = if (boosted > 0.92f) {
          (0.92f + 0.08f * tanh((boosted - 0.92f) / 0.08f)).toFloat().coerceIn(-1f, 1f)
        } else if (boosted < -0.92f) {
          (-0.92f - 0.08f * tanh((-boosted - 0.92f) / 0.08f)).toFloat().coerceIn(-1f, 1f)
        } else {
          boosted
        }
      }
      return output
    }
    return samples
  }
}
