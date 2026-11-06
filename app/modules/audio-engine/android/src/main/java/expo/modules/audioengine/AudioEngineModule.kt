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

  private fun readAudio(fileUri: String): PreparedAudio {
    val context = requireNotNull(appContext.reactContext)
    val uri = Uri.parse(fileUri)
    if (uri.scheme == "content") {
      val copy = File.createTempFile("recording-", ".audio", context.cacheDir)
      try {
        requireNotNull(context.contentResolver.openInputStream(uri)).use { source ->
          copy.outputStream().use { source.copyTo(it) }
        }
        return AndroidAudioPreparer.prepare(copy, cancellation)
      } finally { copy.delete() }
    }
    require(uri.scheme == "file" || uri.scheme == null) { "Нужна локальная аудиозапись." }
    return AndroidAudioPreparer.prepare(File(requireNotNull(if (uri.scheme == "file") uri.path else fileUri)), cancellation)
  }

  override fun definition() = ModuleDefinition {
    Name("AudioEngine")
    Events("onProgress")
    Function("getCapabilities") { mapOf("asr" to true, "diarization" to true, "llm" to false) }
    AsyncFunction("prepareModels") { ModelAssets.prepare(requireNotNull(appContext.reactContext)) }
    Function("cancel") { cancellation.cancel(); true }

    AsyncFunction("diarize") { fileUri: String -> processing {
      val start = SystemClock.elapsedRealtime()
      val audio = readAudio(fileUri)
      val models = ModelAssets.prepare(requireNotNull(appContext.reactContext))
      cancellation.check()
      val intervals = SpeakerDiarizer.process(audio.samples, models)
      cancellation.check()
      mapOf("durationMs" to audio.durationMs, "elapsedMs" to SystemClock.elapsedRealtime() - start,
        "intervals" to intervals.map { mapOf("startMs" to it.startMs, "endMs" to it.endMs, "speakerId" to it.speakerId) })
    } }

    AsyncFunction("transcribe") { fileUri: String -> processing {
      sendEvent("onProgress", mapOf("stage" to "preparing"))
      val models = ModelAssets.prepare(requireNotNull(appContext.reactContext))
      val audio = readAudio(fileUri)
      cancellation.check()
      sendEvent("onProgress", mapOf("stage" to "diarizing"))
      // SpeakerDiarizer releases native resources before returning; only then create ASR.
      val intervals = SpeakerDiarizer.process(audio.samples, models)
      cancellation.check()
      val ids = linkedMapOf<String, Int>()
      val mapped = intervals.map {
        expo.modules.audioengine.audio.SpeakerInterval(it.startMs, it.endMs,
          ids.getOrPut(it.speakerId) { ids.size })
      }
      IntervalTranscriber { GigaAmRecognizer(models) }.transcribe(audio, mapped, cancellation) { event ->
        sendEvent("onProgress", mapOf("stage" to event.stage, "completed" to event.completed, "total" to event.total))
      }
    } }
  }
}
