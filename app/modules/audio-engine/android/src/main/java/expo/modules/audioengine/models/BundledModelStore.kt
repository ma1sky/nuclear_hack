package expo.modules.audioengine.models

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

data class ModelFile(val id: String, val file: String, val size: Long, val sha256: String)

/** Uses only APK assets and private storage; deliberately has no network dependency. */
class BundledModelStore(private val directory: File, private val openAsset: (String) -> InputStream) {
  @Synchronized
  fun prepare(files: List<ModelFile>): Map<String, String> {
    require(files.map { it.id }.toSet() == setOf("asr", "tokens", "segmentation", "embedding", "llm") && files.size == 5) {
      "Incomplete built-in model bundle"
    }
    require(files.map { it.file }.distinct().size == files.size) { "Duplicate model filename" }
    files.forEach {
      require(it.file.matches(Regex("[a-zA-Z0-9_.-]+")) && it.file != "." && it.file != "..") { "Invalid model filename" }
      require(it.size > 0 && it.sha256.matches(Regex("[0-9a-f]{64}"))) { "Invalid model checksum or size" }
    }
    check(directory.isDirectory || directory.mkdirs()) { "Cannot create model directory" }
    return files.associate { entry ->
      val target = File(directory, entry.file)
      if (!valid(target, entry)) {
        check(directory.usableSpace >= entry.size) { "Not enough storage for built-in models" }
        val temporary = File.createTempFile("model-", ".part", directory)
        try {
          openAsset("models/${entry.file}").use { source ->
            temporary.outputStream().use { output ->
              val buffer = ByteArray(64 * 1024)
              var written = 0L
              while (true) {
                val count = source.read(buffer)
                if (count < 0) break
                written += count
                check(written <= entry.size) { "Built-in model exceeds declared size" }
                output.write(buffer, 0, count)
              }
            }
          }
          check(valid(temporary, entry)) { "Built-in model checksum mismatch: ${entry.id}" }
          // rename replaces the old file atomically on Android's Linux filesystem.
          check(temporary.renameTo(target)) { "Cannot install built-in model: ${entry.id}" }
        } finally { temporary.delete() }
      }
      entry.id to target.absolutePath
    }
  }

  private fun valid(file: File, entry: ModelFile): Boolean {
    if (!file.isFile || file.length() != entry.size) return false
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        hash.update(buffer, 0, count)
      }
    }
    return hash.digest().joinToString("") { "%02x".format(it) } == entry.sha256
  }
}
