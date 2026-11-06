package expo.modules.audioengine

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal object CheckWav {
  private const val maxAudioBytes = 10 * 60 * SpeakerDiarizer.sampleRate * 2

  fun read(file: File): FloatArray = RandomAccessFile(file, "r").use { wav ->
    require(wav.length() >= 12 && wav.readInt() == 0x52494646) { "Выберите файл WAV." }
    val end = wav.readUnsignedIntLE() + 8
    require(end in 12..wav.length() && wav.readInt() == 0x57415645) { "Файл WAV повреждён." }

    var validFormat = false
    var dataOffset = 0L
    var dataSize = 0L
    while (wav.filePointer + 8 <= end) {
      val chunk = wav.readInt()
      val size = wav.readUnsignedIntLE()
      val offset = wav.filePointer
      require(offset + size <= end) { "Файл WAV повреждён." }
      when (chunk) {
        0x666D7420 -> {
          require(size >= 16) { "Файл WAV повреждён." }
          val encoding = wav.readShortLE()
          val channels = wav.readShortLE()
          val rate = wav.readUnsignedIntLE()
          wav.skipBytes(6)
          val bits = wav.readShortLE()
          validFormat = encoding == 1 && channels == 1 && rate == SpeakerDiarizer.sampleRate.toLong() && bits == 16
        }
        0x64617461 -> {
          dataOffset = offset
          dataSize = size
        }
      }
      if (validFormat && dataOffset != 0L) break
      wav.seek(offset + size + (size % 2))
    }

    require(validFormat) { "Для проверки нужен WAV PCM 16 бит, моно, 16 кГц." }
    require(dataSize in 2..maxAudioBytes.toLong() && dataSize % 2 == 0L) {
      "Нужен непустой WAV длительностью до 10 минут."
    }
    val bytes = ByteArray(dataSize.toInt())
    wav.seek(dataOffset)
    wav.readFully(bytes)
    val pcm = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    FloatArray(pcm.remaining()) { pcm.get() / 32768f }
  }

  private fun RandomAccessFile.readUnsignedIntLE(): Long = Integer.reverseBytes(readInt()).toLong() and 0xffff_ffffL

  private fun RandomAccessFile.readShortLE(): Int = java.lang.Short.reverseBytes(readShort()).toInt()
}
