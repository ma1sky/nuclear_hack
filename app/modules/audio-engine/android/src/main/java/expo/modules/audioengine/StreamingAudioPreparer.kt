package expo.modules.audioengine

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import expo.modules.audioengine.audio.CancellationCheck
import expo.modules.audioengine.audio.PcmStore
import expo.modules.audioengine.audio.StreamingResampler
import expo.modules.audioengine.audio.StreamingWav
import java.io.File
import java.nio.ByteOrder

/**
 * Decodes any recording into a disk-backed 16 kHz mono [PcmStore] with constant memory use.
 *
 * The previous preparer kept the whole decoded file in RAM several times over (PCM bytes, a copy,
 * a float array, a resampled copy, a normalized copy): ~1-2 GB for an hour of audio, which crashed or
 * silently failed on phones. Here audio flows decoder -> downmix -> resampler -> file in small blocks.
 */
internal object StreamingAudioPreparer {
  private const val BLOCK = 16 * 1024

  fun prepare(file: File, cacheDir: File, cancellation: CancellationCheck): PcmStore {
    val writer = PcmStore.create(cacheDir)
    try {
      if (StreamingWav.isWav(file)) StreamingWav.stream(file, writer, cancellation) else streamMedia(file, writer, cancellation)
      return writer.finish()
    } catch (t: Throwable) {
      writer.close()
      throw t
    }
  }

  // ---------------------------------------------------------------- everything Android can decode
  private fun streamMedia(file: File, writer: PcmStore.Writer, cancellation: CancellationCheck) {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(file.absolutePath)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw IllegalArgumentException("В файле нет аудиодорожки / No audio track in the file")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val mime = requireNotNull(format.getString(MediaFormat.KEY_MIME))
      val decoder = MediaCodec.createDecoderByType(mime)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      var resampler = StreamingResampler(rate) { s, n -> writer.write(s, n) }
      var produced = false
      var mono = FloatArray(BLOCK)
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      var lastActivity = android.os.SystemClock.elapsedRealtime()
      while (!outputDone) {
        check(android.os.SystemClock.elapsedRealtime() - lastActivity < 30_000) { "Audio decoder stalled or file is damaged" }
        cancellation.check()
        if (!inputDone) {
          val slot = decoder.dequeueInputBuffer(10_000)
          if (slot >= 0) {
            val buffer = requireNotNull(decoder.getInputBuffer(slot))
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              decoder.queueInputBuffer(slot, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(slot, 0, size, extractor.sampleTime.coerceAtLeast(0), 0)
              extractor.advance()
              lastActivity = android.os.SystemClock.elapsedRealtime()
            }
          }
        }
        when (val slot = decoder.dequeueOutputBuffer(info, 10_000)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val f = decoder.outputFormat
            val newRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            encoding = if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) f.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
            require(channels in 1..8 && newRate in 4000..384000) { "Unsupported audio format" }
            require(encoding == AudioFormat.ENCODING_PCM_16BIT || encoding == AudioFormat.ENCODING_PCM_FLOAT) { "Unsupported PCM encoding" }
            if (newRate != rate) {
              if (produced) resampler.finish()
              rate = newRate
              resampler = StreamingResampler(rate) { s, n -> writer.write(s, n) }
            }
          }
          else -> if (slot >= 0) {
            lastActivity = android.os.SystemClock.elapsedRealtime()
            try {
              val out = requireNotNull(decoder.getOutputBuffer(slot))
              out.position(info.offset); out.limit(info.offset + info.size)
              val bb = out.slice().order(ByteOrder.LITTLE_ENDIAN)
              val width = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
              val frames = info.size / (width * channels)
              if (mono.size < frames) mono = FloatArray(frames)
              for (i in 0 until frames) {
                var sum = 0f
                for (c in 0 until channels) sum += if (width == 4) bb.float.let { if (it.isFinite()) it else 0f } else bb.short / 32768f
                mono[i] = (sum / channels).coerceIn(-1f, 1f)
              }
              if (frames > 0) { resampler.push(mono, frames); produced = true }
              outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally {
              decoder.releaseOutputBuffer(slot, false)
            }
          }
        }
      }
      resampler.finish()
    } finally {
      try { codec?.stop() } catch (e: Throwable) {}
      codec?.release()
      extractor.release()
    }
  }
}
