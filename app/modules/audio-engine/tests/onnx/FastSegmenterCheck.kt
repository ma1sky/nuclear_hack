package expo.modules.audioengine

import expo.modules.audioengine.audio.PcmStore
import expo.modules.audioengine.audio.StreamingWav
import java.io.File
import kotlin.math.abs

/**
 * CI cross-check: FastSegmenter.kt (desktop ONNX Runtime) against tools/benchmark/fastseg_reference.py,
 * which is the implementation the DER figures were measured with.
 * Args: <pyannote model.onnx> <audio.wav> <reference.json>
 */
fun main(args: Array<String>) {
  val (model, wav, refPath) = args
  val numbers = Regex("-?[0-9]+(\\.[0-9]+)?([eE]-?[0-9]+)?").findAll(File(refPath).readText()).map { it.value.toDouble() }.toList()
  val reference = numbers.chunked(2).map { it[0] to it[1] }
  val writer = PcmStore.Writer(File.createTempFile("check-", ".pcm"))
  StreamingWav.stream(File(wav), writer)
  val segments = writer.finish().use { store -> FastSegmenter(model, 2).use { it.segment(store) } }
  println("reference ${reference.size} segments, kotlin ${segments.size} segments")
  segments.forEach { println("  %.3f - %.3f  track %d".format(it.start, it.end, it.speaker)) }
  val matched = reference.count { (s, e) -> segments.any { abs(it.start - s) <= 0.05 && abs(it.end - e) <= 0.05 } }
  check(reference.isNotEmpty()) { "empty reference" }
  check(abs(segments.size - reference.size) <= maxOf(1, reference.size / 10)) { "segment count differs" }
  check(matched >= reference.size * 0.9) { "only $matched of ${reference.size} reference segments matched within 50 ms" }
  println("PASS FastSegmenter matches the Python reference ($matched/${reference.size})")
}
