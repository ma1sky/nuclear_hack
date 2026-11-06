package expo.modules.audioengine

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioEngineModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioEngine")

    Function("getCapabilities") {
      mapOf("asr" to false, "diarization" to false, "llm" to false)
    }
  }
}
