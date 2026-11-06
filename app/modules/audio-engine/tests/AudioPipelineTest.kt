package expo.modules.audioengine.audio

import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.PI
import kotlin.math.sin

private fun wave(channels: Int, rate: Int, samples: ShortArray): ByteArray {
  val body = ByteArrayOutputStream()
  fun word(value: Int) { body.write(value and 255); body.write((value ushr 8) and 255) }
  fun integer(value: Int) { word(value); word(value ushr 16) }
  body.write("WAVEJUNK".toByteArray()); integer(1); body.write(42); body.write(0)
  body.write("fmt ".toByteArray()); integer(16); word(1); word(channels); integer(rate)
  integer(rate * channels * 2); word(channels * 2); word(16)
  body.write("data".toByteArray()); integer(samples.size * 2); samples.forEach { word(it.toInt()) }
  val out = ByteArrayOutputStream()
  out.write("RIFF".toByteArray())
  val size = body.size()
  repeat(4) { out.write((size ushr (8 * it)) and 255) }
  out.write(body.toByteArray()); return out.toByteArray()
}

fun main() {
  val directory = kotlin.io.path.createTempDirectory("audio-tests").toFile()
  var passed = 0
  fun test(name: String, block: () -> Unit) { block(); passed++; println("PASS $name") }
  fun read(bytes: ByteArray): PreparedAudio { val f = File(directory, "input.wav"); f.writeBytes(bytes); return WavPreparer.prepare(f) }
  fun rejected(block: () -> Unit) { check(runCatching(block).isFailure) }
  try {
    test("PCM16 and odd ancillary chunk") {
      val a = read(wave(1, 16000, shortArrayOf(-32768, 0, 32767)))
      check(a.samples[0] == -1f && a.samples[1] == 0f && a.samples[2] > .99f)
    }
    test("stereo mix and 48k duration") {
      val a = read(wave(2, 48000, ShortArray(96000) { if (it % 2 == 0) 10000 else -10000 }))
      check(a.samples.size == 16000 && a.durationMs == 1000L && a.samples.all { it == 0f })
    }
    test("anti-alias filter rejects 12kHz when downsampling") {
      val a = read(wave(1, 48000, ShortArray(48000) { (sin(2 * PI * 12000 * it / 48000) * 16000).toInt().toShort() }))
      check(a.samples.sliceArray(200..15000).map { it * it }.average() < .001)
    }
    test("truncated input rejected") { rejected { read(wave(1, 16000, shortArrayOf(1)).dropLast(1).toByteArray()) } }
    test("unsupported format rejected") { rejected { read("not a WAV file".toByteArray()) } }
    test("empty PCM is silence") { check(read(wave(1, 16000, shortArrayOf())).samples.isEmpty()) }
    var closed = false
    var calls = 0
    val pipeline = IntervalTranscriber {
      object : SpeechRecognizer {
        override fun recognize(samples: FloatArray, sampleRate: Int): String { calls++; return "text" }
        override fun close() { closed = true }
      }
    }
    test("A B A stable IDs and absolute integer timestamps") {
      val result = pipeline.transcribe(PreparedAudio(FloatArray(48000)), listOf(
        SpeakerInterval(2000, 3000, 7), SpeakerInterval(0, 1000, 7), SpeakerInterval(1000, 2000, 3),
      )).getValue("transcript")
      check(result.map { it["speaker_id"] } == listOf("speaker_1", "speaker_2", "speaker_1"))
      check(result.last()["start_ms"] == 2000L && result.last()["end_ms"] == 3000L && closed)
      check(result.first().keys == setOf("speaker_id", "start_ms", "end_ms", "text"))
    }
    test("long turn split without new speaker or resetting timestamps") {
      calls = 0
      val r = pipeline.transcribe(PreparedAudio(FloatArray(45 * 16000)), listOf(SpeakerInterval(1000, 45000, 1)))
      check(calls == 3 && r.getValue("transcript").single()["start_ms"] == 1000L)
    }
    test("invalid boundary rejected") { rejected { pipeline.transcribe(PreparedAudio(FloatArray(16000)), listOf(SpeakerInterval(0, 1001, 0))) } }
    test("cancel releases recognizer") {
      val token = ProcessingCancellation(); closed = false
      val p = IntervalTranscriber { object : SpeechRecognizer {
        override fun recognize(samples: FloatArray, sampleRate: Int): String { token.cancel(); return "discard" }
        override fun close() { closed = true }
      } }
      rejected { p.transcribe(PreparedAudio(FloatArray(16000)), listOf(SpeakerInterval(0, 1000, 0)), token) }
      check(closed)
    }
    test("failure releases recognizer") {
      closed = false
      val p = IntervalTranscriber { object : SpeechRecognizer {
        override fun recognize(samples: FloatArray, sampleRate: Int): String = error("inference failed")
        override fun close() { closed = true }
      } }
      rejected { p.transcribe(PreparedAudio(FloatArray(16000)), listOf(SpeakerInterval(0, 1000, 0))) }
      check(closed)
    }
    testBundledModels()
    println("$passed audio checks and offline model-store checks passed")
  } finally { directory.deleteRecursively() }
}
