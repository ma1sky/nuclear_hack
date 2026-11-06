package expo.modules.audioengine.audio

import expo.modules.audioengine.models.BundledModelStore
import expo.modules.audioengine.models.ModelFile
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest

fun testBundledModels() {
  val root = kotlin.io.path.createTempDirectory("offline-models-").toFile()
  val bytes = "unit-test-model-fixture".toByteArray()
  val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  val files = listOf("asr", "tokens", "segmentation", "embedding", "llm").map {
    ModelFile(it, "$it.bin", bytes.size.toLong(), hash)
  }
  var reads = 0
  try {
    val store = BundledModelStore(root) { reads++; ByteArrayInputStream(bytes) }
    val installed = store.prepare(files)
    check(installed.size == 5 && reads == 5)
    store.prepare(files)
    check(reads == 5) // reuse verified local files without opening assets again
    File(installed.getValue("asr")).writeText("corrupted")
    store.prepare(files)
    check(reads == 6 && File(installed.getValue("asr")).readBytes().contentEquals(bytes))
    check(runCatching { store.prepare(files.dropLast(1)) }.isFailure)
    check(runCatching { store.prepare(files.map { it.copy(file = "../escape") }) }.isFailure)
    val failed = File(root, "failed")
    check(runCatching { BundledModelStore(failed) { ByteArrayInputStream("bad".toByteArray()) }.prepare(files) }.isFailure)
    check(failed.listFiles()!!.isEmpty()) // corrupt/incomplete bytes never become installed models
    check(runCatching { BundledModelStore(File(root, "missing")) { error("missing asset") }.prepare(files) }.isFailure)
    println("PASS offline bundle: install, cache, repair, incomplete set, path validation, checksum and missing assets")
  } finally { root.deleteRecursively() }
}
