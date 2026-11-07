package expo.modules.audioengine.audio

import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.tanh

/**
 * Disk-backed mono 16 kHz PCM16 audio.
 *
 * Long recordings (1 h+, hundreds of MB) never live in the Java heap as a whole: the decoder streams
 * into this file and diarization / ASR read only the slices they need. Loudness normalization
 * (same rule as [AudioNormalizer]) is applied on read, from a histogram collected while writing.
 */
class PcmStore private constructor(
  private val file: File,
  override val sampleCount: Long,
  val gain: Float,
) : AudioSource, Closeable {
  private val raf = RandomAccessFile(file, "r")
  val sampleRate: Int get() = SAMPLE_RATE
  override val durationMs: Long get() = sampleCount * 1000 / SAMPLE_RATE

  /** Samples [from, to) as normalized floats; out-of-range parts are clipped away. */
  @Synchronized
  override fun read(from: Long, to: Long): FloatArray {
    val a = from.coerceIn(0, sampleCount)
    val b = to.coerceIn(a, sampleCount)
    val n = (b - a).toInt()
    val out = FloatArray(n)
    if (n == 0) return out
    val bytes = ByteBuffer.allocate(minOf(n, CHUNK) * 2).order(ByteOrder.LITTLE_ENDIAN)
    val channel = raf.channel
    var done = 0
    while (done < n) {
      val count = minOf(CHUNK, n - done)
      bytes.clear(); bytes.limit(count * 2)
      var pos = (a + done) * 2
      while (bytes.hasRemaining()) {
        val r = channel.read(bytes, pos)
        if (r < 0) break
        pos += r
      }
      bytes.flip()
      val shorts = bytes.asShortBuffer()
      for (i in 0 until shorts.remaining()) out[done + i] = shape(shorts.get(i) / 32768f)
      done += count
    }
    return out
  }

  fun readMs(startMs: Long, endMs: Long): FloatArray = read(startMs * SAMPLE_RATE / 1000, endMs * SAMPLE_RATE / 1000)

  private fun shape(x: Float): Float {
    if (gain == 1f) return x
    val boosted = x * gain
    return when {
      boosted > 0.92f -> (0.92f + 0.08f * tanh((boosted - 0.92f) / 0.08f)).coerceIn(-1f, 1f)
      boosted < -0.92f -> (-0.92f - 0.08f * tanh((-boosted - 0.92f) / 0.08f)).coerceIn(-1f, 1f)
      else -> boosted
    }
  }

  override fun close() {
    try { raf.close() } finally { file.delete() }
  }

  /** Streaming writer: accepts 16 kHz mono floats, keeps an amplitude histogram for normalization. */
  class Writer(private val file: File) : Closeable {
    private val out = RandomAccessFile(file, "rw").also { it.setLength(0) }
    private val buffer = ByteBuffer.allocate(CHUNK * 2).order(ByteOrder.LITTLE_ENDIAN)
    private val histogram = LongArray(BINS)
    private var count = 0L
    private var finished = false

    fun write(samples: FloatArray, length: Int = samples.size) {
      var i = 0
      while (i < length) {
        if (!buffer.hasRemaining()) flush()
        val v = samples[i].let { if (it.isFinite()) it.coerceIn(-1f, 1f) else 0f }
        histogram[minOf(BINS - 1, (abs(v) * BINS).toInt())]++
        buffer.putShort((v * 32767f).toInt().toShort())
        i++
      }
      count += length
    }

    private fun flush() {
      buffer.flip()
      out.channel.write(buffer)
      buffer.clear()
    }

    fun finish(): PcmStore {
      check(!finished)
      flush()
      out.close()
      finished = true
      return PcmStore(file, count, gainFor(histogram, count))
    }

    override fun close() {
      if (!finished) { try { out.close() } finally { file.delete() } }
    }
  }

  companion object {
    const val SAMPLE_RATE = 16_000
    private const val CHUNK = 64 * 1024
    private const val BINS = 4096

    /** Same rule as [AudioNormalizer]: boost quiet audio so its 98th percentile reaches 0.65 (max +18 dB). */
    internal fun gainFor(histogram: LongArray, count: Long): Float {
      if (count < 100) return 1f
      val target = (count * 0.98).toLong()
      var acc = 0L
      var bin = 0
      while (bin < histogram.size) { acc += histogram[bin]; if (acc > target) break; bin++ }
      val p98 = (bin + 0.5f) / histogram.size
      return if (p98 in 0.001f..0.35f) (0.65f / p98).coerceIn(1f, 8f) else 1f
    }

    fun create(cacheDir: File): Writer = Writer(File.createTempFile("prepared-", ".pcm", cacheDir))
  }
}
