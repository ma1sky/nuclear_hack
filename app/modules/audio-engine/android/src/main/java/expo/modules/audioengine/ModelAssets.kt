package expo.modules.audioengine

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

internal object ModelAssets {
  val diarizationKeys = listOf("segmentation", "embedding")

  @Synchronized
  fun prepare(context: Context, keys: List<String>? = null): Map<String, String> {
    val manifest = context.assets.open("models/manifest.json").bufferedReader().use {
      JSONObject(it.readText())
    }
    val destination = File(context.noBackupFilesDir, "models").apply { mkdirs() }

    return (keys ?: manifest.keys().asSequence().toList()).associateWith { key ->
      val entry = manifest.getJSONObject(key)
      val name = entry.getString("file")
      val checksum = entry.getString("sha256")
      val target = File(destination, name)
      if (!target.isFile || sha256(target) != checksum) {
        val temporary = File.createTempFile("model-", ".part", destination)
        try {
          context.assets.open("models/$name").use { input ->
            temporary.outputStream().use { output -> input.copyTo(output) }
          }
          check(sha256(temporary) == checksum) { "Нарушена целостность модели $name." }
          check(temporary.renameTo(target)) { "Не удалось сохранить модель $name." }
        } finally {
          temporary.delete()
        }
      }
      target.absolutePath
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val size = input.read(buffer)
        if (size == -1) break
        digest.update(buffer, 0, size)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
