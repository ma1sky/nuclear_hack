package expo.modules.audioengine.audio

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Streams a RIFF/WAVE file of any length (PCM 8/16/24/32-bit, float32, 1-8 channels) into a [PcmStore]. */
object StreamingWav {
  private const val BLOCK = 16 * 1024

  fun isWav(file: File): Boolean = file.inputStream().use { input ->
    val magic = ByteArray(12)
    input.read(magic) == 12 && String(magic, 0, 4, Charsets.US_ASCII) == "RIFF" && String(magic, 8, 4, Charsets.US_ASCII) == "WAVE"
  }

  fun stream(file: File, writer: PcmStore.Writer, cancellation: CancellationCheck = CancellationCheck.NONE) {
    RandomAccessFile(file, "r").use { input ->
      input.seek(12)
      var channels = 0; var rate = 0; var bits = 0; var format = 0; var align = 0
      var dataOffset = -1L; var dataLength = 0L
      val fileEnd = input.length()
      while (input.filePointer + 8 <= fileEnd) {
        val tag = ByteArray(4).also { input.readFully(it) }.toString(Charsets.US_ASCII)
        val size = u32(input)
        val start = input.filePointer
        when (tag) {
          "fmt " -> {
            format = u16(input); channels = u16(input); rate = u32(input).toInt()
            u32(input); align = u16(input); bits = u16(input)
            if (format == 0xFFFE && size >= 40) { // WAVE_FORMAT_EXTENSIBLE: real format in the sub-GUID
              u16(input); u16(input); u32(input); format = u16(input)
            }
          }
          "data" -> {
            dataOffset = start
            // Recorders that stream WAV often leave 0 / 0xFFFFFFFF here, and files > 4 GB overflow it.
            dataLength = if (size == 0L || size == 0xFFFFFFFFL || start + size > fileEnd) fileEnd - start else size
          }
        }
        if (dataOffset >= 0 && format != 0) break
        input.seek(start + size + (size and 1))
      }
      require(dataOffset >= 0 && channels in 1..8 && rate in 4000..384000 && align > 0) { "Unsupported WAV file" }
      val pcm = format == 1 && bits in intArrayOf(8, 16, 24, 32)
      val float = format == 3 && bits == 32
      require(pcm || float) { "Unsupported WAV encoding" }
      val width = bits / 8
      require(align == width * channels) { "Unsupported WAV layout" }

      val resampler = StreamingResampler(rate) { s, n -> writer.write(s, n) }
      val frames = dataLength / align
      val bytes = ByteArray(BLOCK * align)
      val mono = FloatArray(BLOCK)
      input.seek(dataOffset)
      var done = 0L
      while (done < frames) {
        cancellation.check()
        val count = minOf(BLOCK.toLong(), frames - done).toInt()
        val got = readUpTo(input, bytes, count * align) / align
        if (got <= 0) break
        val bb = ByteBuffer.wrap(bytes, 0, got * align).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until got) {
          var sum = 0f
          for (c in 0 until channels) sum += sample(bb, width, float)
          mono[i] = sum / channels
        }
        resampler.push(mono, got)
        done += got
        if (got < count) break // truncated file: keep what we have
      }
      resampler.finish()
    }
  }

  private fun sample(bb: ByteBuffer, width: Int, float: Boolean): Float = when {
    float -> bb.float.let { if (it.isFinite()) it else 0f }
    width == 1 -> ((bb.get().toInt() and 0xFF) - 128) / 128f
    width == 2 -> bb.short / 32768f
    width == 3 -> {
      val b0 = bb.get().toInt() and 0xFF; val b1 = bb.get().toInt() and 0xFF; val b2 = bb.get().toInt()
      ((b2 shl 16) or (b1 shl 8) or b0) / 8388608f
    }
    else -> bb.int / 2147483648f
  }

  private fun readUpTo(input: RandomAccessFile, buf: ByteArray, len: Int): Int {
    var total = 0
    while (total < len) {
      val r = input.read(buf, total, len - total)
      if (r < 0) break
      total += r
    }
    return total
  }

  private fun u16(input: RandomAccessFile) = input.readUnsignedByte() or (input.readUnsignedByte() shl 8)
  private fun u32(input: RandomAccessFile) = u16(input).toLong() or (u16(input).toLong() shl 16)
}
