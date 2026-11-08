package expo.modules.audioengine.audio

import java.io.*
import kotlin.math.*

/** Big-endian float PCM on disk. Java buffers are limited to one processing window. */
class DiskAudio private constructor(private val file: File, override val sampleCount: Int) : AudioSource {
  private val input = RandomAccessFile(file, "r")
  private var gain = 1f
  override fun readSamples(start: Int, end: Int): FloatArray {
    require(start >= 0 && end >= start && end <= sampleCount)
    require(end - start <= 120 * 16000) { "Audio window exceeds memory budget" }
    val bytes = ByteArray((end - start) * 4)
    input.seek(start.toLong() * 4)
    input.readFully(bytes)
    val buffer = java.nio.ByteBuffer.wrap(bytes)
    return FloatArray(end - start) {
      val value = buffer.float * gain
      when {
        gain != 1f && value > .92f -> (.92 + .08 * tanh((value - .92) / .08)).toFloat().coerceIn(-1f, 1f)
        gain != 1f && value < -.92f -> (-.92 - .08 * tanh((-value - .92) / .08)).toFloat().coerceIn(-1f, 1f)
        else -> value
      }
    }
  }
  private fun normalize(cancellation: CancellationCheck) {
    if (sampleCount < 100) return
    val count = min(10000, sampleCount)
    val probes = FloatArray(count)
    for (i in probes.indices) {
      if (i % 256 == 0) cancellation.check()
      input.seek(i.toLong() * sampleCount / count * 4)
      probes[i] = abs(input.readFloat())
    }
    probes.sort()
    val p98 = probes[(count * .98).toInt()]
    if (p98 in .001f.. .35f) gain = (.65f / p98).coerceIn(1f, 8f)
  }
  override fun close() { try { input.close() } finally { file.delete() } }

  companion object {
    fun newFile(directory: File) = File.createTempFile("audio-pcm-", ".f32", directory)
    /** Fixed one-second cores with neighbouring context preserve filter continuity and clock offsets. */
    fun resample(raw: File, rate: Int, directory: File, cancellation: CancellationCheck): DiskAudio {
      var output = raw
      try {
        require(rate in 8000..192000 && raw.length() % 4 == 0L)
        val frames = raw.length() / 4
        val targetFrames = frames * 16000 / rate
        require(targetFrames <= Int.MAX_VALUE) { "Recording too long" }
        if (rate != 16000) {
          output = newFile(directory)
          RandomAccessFile(raw, "r").use { source ->
            DataOutputStream(BufferedOutputStream(output.outputStream())).use { sink ->
              var first = 0L
              while (first < frames) {
                cancellation.check()
                val last = min(frames, first + rate)
                val contextStart = max(0, first - rate)
                val contextEnd = min(frames, last + rate)
                source.seek(contextStart * 4)
                val bytes = ByteArray(((contextEnd - contextStart) * 4).toInt())
                source.readFully(bytes)
                val buffer = java.nio.ByteBuffer.wrap(bytes)
                val samples = FloatArray((contextEnd - contextStart).toInt()) { buffer.float }
                val result = WavPreparer.resample(samples, rate, cancellation)
                val offset = ((first - contextStart) * 16000 / rate).toInt()
                val length = (last * 16000 / rate - first * 16000 / rate).toInt()
                for (i in offset until offset + length) sink.writeFloat(result[i])
                first = last
              }
            }
          }
          raw.delete()
        }
        val audio = DiskAudio(output, targetFrames.toInt())
        try { audio.normalize(cancellation); return audio }
        catch (error: Throwable) { audio.close(); throw error }
      } catch (error: Throwable) {
        raw.delete()
        if (output != raw) output.delete()
        throw error
      }
    }
  }
}
