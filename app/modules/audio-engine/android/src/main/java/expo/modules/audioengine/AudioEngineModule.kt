package expo.modules.audioengine

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.audioengine.models.BundledModelStore
import expo.modules.audioengine.models.ModelFile
import java.io.File
import org.json.JSONObject

class AudioEngineModule : Module() {
  private val modelPreparationLock = Any()

  override fun definition() = ModuleDefinition {
    Name("AudioEngine")

    Function("getCapabilities") {
      // Model files and working inference are different capabilities.
      mapOf("asr" to false, "diarization" to false, "llm" to false)
    }

    AsyncFunction("prepareModels") {
      synchronized(modelPreparationLock) {
        val context = requireNotNull(appContext.reactContext) { "Android context unavailable" }
        val manifest = try {
          context.assets.open("models/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        } catch (error: Exception) {
          throw IllegalStateException("MODEL_BUNDLE_MISSING: APK does not contain a readable model manifest", error)
        }
        require(manifest.getInt("version") == 1 && manifest.getString("language") == "ru") { "Unsupported model bundle" }
        val entries = manifest.getJSONArray("files")
        val files = (0 until entries.length()).map { index ->
          val entry = entries.getJSONObject(index)
          ModelFile(entry.getString("id"), entry.getString("file"), entry.getLong("size"), entry.getString("sha256"))
        }
        BundledModelStore(File(context.filesDir, "models")) { context.assets.open(it) }.prepare(files)
      }
    }
  }
}
