package expo.modules.audioengine

import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AudioEngineModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioEngine")

    Function("getCapabilities") {
      mapOf("asr" to false, "diarization" to true, "llm" to false)
    }

    AsyncFunction("prepareModels") {
      ModelAssets.prepare(requireNotNull(appContext.reactContext))
    }

    AsyncFunction("diarize") { fileUri: String ->
      val start = SystemClock.elapsedRealtime()
      val uri = Uri.parse(fileUri)
      require(uri.scheme == "file") { "Нужна локальная копия файла WAV." }
      val samples = CheckWav.read(File(requireNotNull(uri.path)))
      val models = ModelAssets.prepare(requireNotNull(appContext.reactContext), ModelAssets.diarizationKeys)
      val intervals = SpeakerDiarizer.process(samples, models)
      mapOf(
        "durationMs" to samples.size * 1000L / SpeakerDiarizer.sampleRate,
        "elapsedMs" to SystemClock.elapsedRealtime() - start,
        "intervals" to intervals.map { interval ->
          mapOf("startMs" to interval.startMs, "endMs" to interval.endMs, "speakerId" to interval.speakerId)
        },
      )
    }
  }
}
