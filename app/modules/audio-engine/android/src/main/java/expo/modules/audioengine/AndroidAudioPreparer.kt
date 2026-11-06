package expo.modules.audioengine

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import expo.modules.audioengine.audio.CancellationCheck
import expo.modules.audioengine.audio.PreparedAudio
import expo.modules.audioengine.audio.WavPreparer
import java.io.File
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal object AndroidAudioPreparer {
  fun prepare(file: File, cancellation: CancellationCheck): PreparedAudio {
    file.inputStream().use { input ->
      val magic = ByteArray(4)
      if (input.read(magic) == 4 && magic.toString(Charsets.US_ASCII) == "RIFF") {
        return WavPreparer.prepare(file, cancellation)
      }
    }
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(file.absolutePath)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME) == "audio/mp4a-latm"
      } ?: throw IllegalArgumentException("Поддерживаются WAV PCM16 и M4A/AAC.")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoder = MediaCodec.createDecoderByType("audio/mp4a-latm")
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()
      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      var inputDone = false
      var outputDone = false
      val info = MediaCodec.BufferInfo()
      val pcm = ByteArrayOutputStream()
      var lastActivity = android.os.SystemClock.elapsedRealtime()
      while (!outputDone) {
        check(android.os.SystemClock.elapsedRealtime() - lastActivity < 30000) { "AAC decoder stalled or file is damaged" }
        cancellation.check()
        if (!inputDone) {
          val slot = decoder.dequeueInputBuffer(10000)
          if (slot >= 0) {
            val input = requireNotNull(decoder.getInputBuffer(slot))
            val size = extractor.readSampleData(input, 0)
            if (size < 0) {
              decoder.queueInputBuffer(slot, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              lastActivity = android.os.SystemClock.elapsedRealtime()
              decoder.queueInputBuffer(slot, 0, size, extractor.sampleTime.coerceAtLeast(0), 0)
              extractor.advance()
            }
          }
        }
        when (val slot = decoder.dequeueOutputBuffer(info, 10000)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            check(pcm.size() == 0) { "Audio format changed during decoding" }
            val outputFormat = decoder.outputFormat
            rate = outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            encoding = if (outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
            require(channels in 1..2 && rate in 8000..192000) { "Unsupported audio format" }
            require(encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_PCM_FLOAT)
          }
          else -> if (slot >= 0) {
            lastActivity = android.os.SystemClock.elapsedRealtime()
            try {
              val output = requireNotNull(decoder.getOutputBuffer(slot))
              output.position(info.offset); output.limit(info.offset + info.size)
              val bytes = ByteArray(info.size); output.get(bytes); pcm.write(bytes)
              outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally { decoder.releaseOutputBuffer(slot, false) }
          }
        }
      }
      val width = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
      val data = pcm.toByteArray()
      require(data.size % (width * channels) == 0) { "Incomplete decoded PCM frame" }
      val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
      val mono = FloatArray(data.size / (width * channels))
      for (i in mono.indices) {
        if (i % 4096 == 0) cancellation.check()
        var sum = 0f
        repeat(channels) { sum += if (width == 4) buffer.float else buffer.short / 32768f }
        mono[i] = (sum / channels).also { require(it.isFinite()) }.coerceIn(-1f, 1f)
      }
      return PreparedAudio(WavPreparer.resample(mono, rate, cancellation))
    } finally {
      codec?.release()
      extractor.release()
    }
  }
}
