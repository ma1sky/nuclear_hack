package expo.modules.audioengine.audio

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sin

/** Reads RIFF PCM16 (including unknown/padded chunks), mixes channels and resamples on JVM/Android. */
object WavPreparer {
  fun prepare(file: File, cancellation: CancellationCheck = CancellationCheck.NONE): PreparedAudio {
    cancellation.check()
    return RandomAccessFile(file, "r").use { input ->
      require(input.length() >= 12) { "Truncated WAV header" }
      require(tag(input) == "RIFF") { "Only RIFF WAV PCM16 is supported" }
      val riffEnd = uint32(input) + 8
      require(riffEnd in 12..input.length()) { "Invalid RIFF size" }
      require(tag(input) == "WAVE") { "Not a WAVE file" }
      var channels = 0
      var rate = 0
      var alignment = 0
      var dataOffset = -1L
      var dataLength = 0L
      var hasFormat = false
      while (input.filePointer + 8 <= riffEnd) {
        cancellation.check()
        val chunk = tag(input)
        val size = uint32(input)
        val start = input.filePointer
        require(size <= riffEnd - start) { "Truncated WAV chunk: $chunk" }
        when (chunk) {
          "fmt " -> {
            require(!hasFormat && size >= 16) { "Invalid or duplicate WAV format" }
            val encoding = uint16(input)
            channels = uint16(input)
            rate = uint32(input).also { require(it in 8000..192000) { "Unsupported sample rate" } }.toInt()
            val byteRate = uint32(input)
            alignment = uint16(input)
            val bits = uint16(input)
            require(encoding == 1 && bits == 16) { "Only uncompressed WAV PCM16 is supported" }
            require(channels in 1..2 && alignment == channels * 2) { "Unsupported channel layout" }
            require(byteRate == rate.toLong() * alignment) { "Invalid WAV byte rate" }
            hasFormat = true
          }
          "data" -> {
            require(dataOffset < 0) { "Multiple WAV data chunks are unsupported" }
            dataOffset = start
            dataLength = size
          }
        }
        val next = start + size + (size and 1)
        require(next <= riffEnd) { "Missing WAV chunk padding" }
        input.seek(next)
      }
      require(input.filePointer == riffEnd) { "Invalid trailing WAV chunk" }
      require(hasFormat && dataOffset >= 0) { "Missing WAV format or data" }
      require(dataLength % alignment == 0L) { "Incomplete PCM frame" }
      val frames = dataLength / alignment
      require(frames <= Int.MAX_VALUE) { "WAV is too large" }
      input.seek(dataOffset)
      val mono = FloatArray(frames.toInt())
      // Buffer IO: avoid a system call per sample on long recordings.
      val buffer = ByteArray(8192 * alignment)
      var frame = 0
      while (frame < mono.size) {
        cancellation.check()
        val count = min(8192, mono.size - frame)
        input.readFully(buffer, 0, count * alignment)
        for (i in 0 until count) {
          var sum = 0
          for (channel in 0 until channels) {
            val p = i * alignment + channel * 2
            sum += ((buffer[p].toInt() and 255) or (buffer[p + 1].toInt() shl 8)).toShort().toInt()
          }
          mono[frame + i] = sum / (32768f * channels)
        }
        frame += count
      }
      val resampled = resample(mono, rate, cancellation)
      PreparedAudio(AudioNormalizer.normalize(resampled, cancellation))
    }
  }

  fun prepareDisk(file: File, directory: File, cancellation: CancellationCheck): DiskAudio {
    return parseToDisk(file, directory, cancellation)
  }

  private fun parseToDisk(file: File, directory: File, cancellation: CancellationCheck): DiskAudio {
    cancellation.check()
    return RandomAccessFile(file, "r").use { input ->
      require(input.length() >= 12) { "Truncated WAV header" }
      require(tag(input) == "RIFF") { "Only RIFF WAV PCM16 is supported" }
      val riffEnd = uint32(input) + 8
      require(riffEnd in 12..input.length()) { "Invalid RIFF size" }
      require(tag(input) == "WAVE") { "Not a WAVE file" }
      var channels = 0
      var rate = 0
      var alignment = 0
      var dataOffset = -1L
      var dataLength = 0L
      var hasFormat = false
      while (input.filePointer + 8 <= riffEnd) {
        cancellation.check()
        val chunk = tag(input)
        val size = uint32(input)
        val start = input.filePointer
        require(size <= riffEnd - start) { "Truncated WAV chunk: $chunk" }
        when (chunk) {
          "fmt " -> {
            require(!hasFormat && size >= 16) { "Invalid or duplicate WAV format" }
            val encoding = uint16(input)
            channels = uint16(input)
            rate = uint32(input).also { require(it in 8000..192000) { "Unsupported sample rate" } }.toInt()
            val byteRate = uint32(input)
            alignment = uint16(input)
            val bits = uint16(input)
            require(encoding == 1 && bits == 16) { "Only uncompressed WAV PCM16 is supported" }
            require(channels in 1..2 && alignment == channels * 2) { "Unsupported channel layout" }
            require(byteRate == rate.toLong() * alignment) { "Invalid WAV byte rate" }
            hasFormat = true
          }
          "data" -> {
            require(dataOffset < 0) { "Multiple WAV data chunks are unsupported" }
            dataOffset = start
            dataLength = size
          }
        }
        val next = start + size + (size and 1)
        require(next <= riffEnd) { "Missing WAV chunk padding" }
        input.seek(next)
      }
      require(input.filePointer == riffEnd) { "Invalid trailing WAV chunk" }
      require(hasFormat && dataOffset >= 0) { "Missing WAV format or data" }
      require(dataLength % alignment == 0L) { "Incomplete PCM frame" }
      val frames = dataLength / alignment
      require(frames <= Int.MAX_VALUE) { "WAV is too large" }
      input.seek(dataOffset)
      val raw = DiskAudio.newFile(directory)
      try {
      java.io.DataOutputStream(java.io.BufferedOutputStream(raw.outputStream())).use { sink ->
      // Buffer IO: avoid a system call per sample on long recordings.
      val buffer = ByteArray(8192 * alignment)
      var frame = 0
      while (frame < frames) {
        cancellation.check()
        val count = min(8192L, frames - frame).toInt()
        input.readFully(buffer, 0, count * alignment)
        for (i in 0 until count) {
          var sum = 0
          for (channel in 0 until channels) {
            val p = i * alignment + channel * 2
            sum += ((buffer[p].toInt() and 255) or (buffer[p + 1].toInt() shl 8)).toShort().toInt()
          }
          sink.writeFloat(sum / (32768f * channels))
        }
        frame += count
      }
      }
      DiskAudio.resample(raw, rate, directory, cancellation)
      } catch (error: Throwable) { raw.delete(); throw error }
    }
  }


  /** Windowed-sinc low-pass interpolation, with anti-aliasing when downsampling. */
  internal fun resample(source: FloatArray, rate: Int, cancellation: CancellationCheck): FloatArray {
    if (rate == 16000 || source.isEmpty()) return source
    val length = source.size.toLong() * 16000 / rate
    require(length <= Int.MAX_VALUE) { "Resampled audio is too large" }
    val output = FloatArray(length.toInt())
    val cutoff = min(1.0, 16000.0 / rate) * 0.94
    val radius = kotlin.math.ceil(16 / cutoff).toInt()
    for (i in output.indices) {
      if (i % 1024 == 0) cancellation.check()
      val center = i.toDouble() * rate / 16000
      val base = floor(center).toInt()
      var sum = 0.0
      var weightSum = 0.0
      for (j in base - radius..base + radius) {
        if (j !in source.indices) continue
        val distance = center - j
        val x = PI * distance * cutoff
        val sinc = if (kotlin.math.abs(x) < 1e-12) 1.0 else sin(x) / x
        val weight = cutoff * sinc * (0.5 + 0.5 * cos(PI * distance / (radius + 1)))
        sum += source[j] * weight
        weightSum += weight
      }
      output[i] = if (weightSum == 0.0) 0f else (sum / weightSum).toFloat().coerceIn(-1f, 1f)
    }
    return output
  }

  private fun tag(input: RandomAccessFile): String {
    val bytes = ByteArray(4)
    input.readFully(bytes)
    return bytes.toString(Charsets.US_ASCII)
  }
  private fun uint16(input: RandomAccessFile): Int = input.readUnsignedByte() or (input.readUnsignedByte() shl 8)
  private fun uint32(input: RandomAccessFile): Long = uint16(input).toLong() or (uint16(input).toLong() shl 16)
}
