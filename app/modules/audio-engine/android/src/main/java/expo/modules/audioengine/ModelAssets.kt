package expo.modules.audioengine

import android.content.Context
import expo.modules.audioengine.models.BundledModelStore
import expo.modules.audioengine.models.ModelFile
import org.json.JSONObject
import java.io.File

internal object ModelAssets {
  val diarizationKeys = listOf("segmentation", "embedding")
  @Synchronized
  fun prepare(context: Context, keys: List<String>? = null): Map<String, String> {
    val manifest = context.assets.open("models/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
    require(manifest.getInt("version") == 1 && manifest.getString("language") == "ru") { "Unsupported model bundle" }
    val entries = manifest.getJSONArray("files")
    val files = (0 until entries.length()).map { index ->
      val item = entries.getJSONObject(index)
      ModelFile(item.getString("id"), item.getString("file"), item.getLong("size"), item.getString("sha256"))
    }.toMutableList()

    val assetList = try { context.assets.list("models")?.toSet() ?: emptySet() } catch (_: Exception) { emptySet() }
    if ("en-conformer.int8.onnx" in assetList && "en-conformer-tokens.txt" in assetList) {
      files.add(ModelFile("asr_en", "en-conformer.int8.onnx", 46419854L, "66cfde4ce0b6da9e1a4352e58f0c968f87da23070cf229c81ae0d520cddad2a2"))
      files.add(ModelFile("tokens_en", "en-conformer-tokens.txt", 11611L, "1adce7866285e6a4aac6208b120d5b8e4302b7cae5f2ae541c343097773fd988"))
    }

    val paths = BundledModelStore(File(context.noBackupFilesDir, "models")) { context.assets.open(it) }.prepare(files)
    return if (keys == null) paths else paths.filterKeys { it in keys }
  }
}
