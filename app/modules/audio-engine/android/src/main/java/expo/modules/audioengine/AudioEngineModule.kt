package expo.modules.audioengine

import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.audioengine.audio.*
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class AudioEngineModule : Module() {
  private val running = AtomicBoolean(false)
  @Volatile private var cancellation = ProcessingCancellation()

  private fun <T> processing(block: () -> T): T {
    check(running.compareAndSet(false, true)) { "Другая запись ещё обрабатывается." }
    cancellation = ProcessingCancellation()
    return try { block() } finally { running.set(false) }
  }

  /**
   * Decodes the recording into a disk-backed 16 kHz mono store. Memory use no longer grows with the
   * length of the recording: an hour-long or multi-hundred-MB file is processed slice by slice.
   */
  private fun readAudio(fileUri: String): PcmStore {
    val context = requireNotNull(appContext.reactContext)
    val cacheDir = context.cacheDir
    // Leftovers of an interrupted run (process killed mid-way) would otherwise pile up in the cache.
    cacheDir.listFiles { f -> f.name.startsWith("prepared-") && f.name.endsWith(".pcm") }?.forEach { it.delete() }
    val uri = Uri.parse(fileUri)
    try {
      if (uri.scheme == "content") {
        val copy = File.createTempFile("recording-", ".audio", cacheDir)
        try {
          requireNotNull(context.contentResolver.openInputStream(uri)).use { source ->
            copy.outputStream().use { source.copyTo(it, 1 shl 16) }
          }
          return StreamingAudioPreparer.prepare(copy, cacheDir, cancellation)
        } finally { copy.delete() }
      }
      require(uri.scheme == "file" || uri.scheme == null) { "Нужна локальная аудиозапись." }
      return StreamingAudioPreparer.prepare(File(requireNotNull(if (uri.scheme == "file") uri.path else fileUri)), cacheDir, cancellation)
    } catch (e: java.io.IOException) {
      if (cacheDir.usableSpace < 64L * 1024 * 1024) throw IllegalStateException("Недостаточно свободного места на телефоне для обработки записи.", e)
      throw e
    }
  }

  /** 61-bucket RMS envelope for the player, computed by streaming over the store. */
  private fun waveform(audio: AudioSource): List<Double> = (0 until 61).map { bucket ->
    cancellation.check()
    val first = bucket.toLong() * audio.sampleCount / 61
    val last = (bucket + 1L) * audio.sampleCount / 61
    var energy = 0.0
    var position = first
    while (position < last) {
      val block = audio.read(position, minOf(last, position + (1 shl 20)))
      for (v in block) energy += v.toDouble() * v
      position += block.size.coerceAtLeast(1)
    }
    kotlin.math.sqrt(energy / (last - first).coerceAtLeast(1)).coerceIn(0.0, 1.0)
  }

  override fun definition() = ModuleDefinition {
    Name("AudioEngine")
    Events("onProgress")
    Function("getCapabilities") { mapOf("asr" to true, "diarization" to true, "llm" to false) }
    AsyncFunction("prepareModels") { ModelAssets.prepare(requireNotNull(appContext.reactContext)) }
    Function("cancel") { cancellation.cancel(); true }

    AsyncFunction("diarize") { fileUri: String -> processing {
      val start = SystemClock.elapsedRealtime()
      readAudio(fileUri).use { audio ->
        val models = ModelAssets.prepare(requireNotNull(appContext.reactContext))
        cancellation.check()
        val intervals = SpeakerDiarizer.process(audio, models, { cancellation.check() })
        cancellation.check()
        mapOf("durationMs" to audio.durationMs, "elapsedMs" to SystemClock.elapsedRealtime() - start,
          "intervals" to intervals.map { mapOf("startMs" to it.startMs, "endMs" to it.endMs, "speakerId" to it.speakerId) })
      }
    } }

    AsyncFunction("transcribe") { fileUri: String -> processing {
      sendEvent("onProgress", mapOf("stage" to "preparing"))
      val models = ModelAssets.prepare(requireNotNull(appContext.reactContext))
      readAudio(fileUri).use { audio ->
        cancellation.check()
        sendEvent("onProgress", mapOf("stage" to "diarizing", "durationMs" to audio.durationMs, "waveform" to waveform(audio)))
        // SpeakerDiarizer releases native resources before returning; only then create ASR.
        val intervals = SpeakerDiarizer.process(audio, models, { cancellation.check() }) { done, total ->
          if (done % 12 == 0 || done == total) sendEvent("onProgress", mapOf("stage" to "diarizing", "completed" to done, "total" to total))
        }
        cancellation.check()
        val ids = linkedMapOf<String, Int>()
        val mapped = intervals.map {
          expo.modules.audioengine.audio.SpeakerInterval(it.startMs, it.endMs,
            ids.getOrPut(it.speakerId) { ids.size })
        }
        IntervalTranscriber { GigaAmRecognizer(models) }.transcribe(audio, mapped, cancellation) { event ->
          sendEvent("onProgress", mapOf("stage" to event.stage, "completed" to event.completed, "total" to event.total))
        }
      }
    } }
  }
}
