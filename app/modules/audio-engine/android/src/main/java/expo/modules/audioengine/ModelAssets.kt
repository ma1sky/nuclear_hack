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
    }
    val paths = BundledModelStore(File(context.noBackupFilesDir, "models")) { context.assets.open(it) }.prepare(files)
    return if (keys == null) paths else paths.filterKeys { it in keys }
  }
}
