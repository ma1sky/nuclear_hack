package expo.modules.audioengine.audio

import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Long-recording regression tests. Run with a small heap (-Xmx96m): the old pipeline needed
 * ~1-2 GB of heap for an hour of audio; the streaming pipeline must stay bounded.
 */

private fun le16(out: BufferedOutputStream, v: Int) { out.write(v and 255); out.write((v ushr 8) and 255) }
private fun le32(out: BufferedOutputStream, v: Long) { le16(out, (v and 0xFFFF).toInt()); le16(out, ((v ushr 16) and 0xFFFF).toInt()) }

/** Writes a 48 kHz stereo PCM16 WAV without holding it in memory; 1 kHz marker inside [markerFrom, markerTo) seconds. */
private fun writeLongWav(file: File, seconds: Int, rate: Int, markerFrom: Int, markerTo: Int) {
  val channels = 2
  val frames = seconds.toLong() * rate
  val dataBytes = frames * channels * 2
  BufferedOutputStream(FileOutputStream(file), 1 shl 20).use { out ->
    out.write("RIFF".toByteArray()); le32(out, 36 + dataBytes)
    out.write("WAVEfmt ".toByteArray()); le32(out, 16); le16(out, 1); le16(out, channels); le32(out, rate.toLong())
    le32(out, rate.toLong() * channels * 2); le16(out, channels * 2); le16(out, 16)
    out.write("data".toByteArray()); le32(out, dataBytes)
    for (i in 0 until frames) {
      val t = i.toDouble() / rate
      val f = if (t >= markerFrom && t < markerTo) 1000.0 else 440.0
      val v = (0.1 * sin(2 * PI * f * t) * 32767).toInt()
      le16(out, v); le16(out, v)
    }
  }
}

/** Goertzel power of [freq] in [x] at 16 kHz, normalized by length. */
private fun power(x: FloatArray, freq: Double): Double {
  val k = 2 * cos(2 * PI * freq / 16000)
  var s1 = 0.0; var s2 = 0.0
  for (v in x) { val s0 = v + k * s1 - s2; s2 = s1; s1 = s0 }
  return (s1 * s1 + s2 * s2 - k * s1 * s2) / (x.size.toDouble() * x.size)
}

fun main() {
  val dir = kotlin.io.path.createTempDirectory("long-audio").toFile()
  var passed = 0
  fun test(name: String, block: () -> Unit) { block(); passed++; println("PASS $name") }
  try {
    test("streaming resampler equals WavPreparer.resample") {
      val rnd = java.util.Random(7)
      for (rate in intArrayOf(8000, 11025, 22050, 44100, 48000, 96000)) {
        val src = FloatArray(rate / 3) { (rnd.nextFloat() - 0.5f) * 0.8f }
        val reference = WavPreparer.resample(src, rate, CancellationCheck.NONE)
        val got = ArrayList<Float>()
        val r = StreamingResampler(rate) { s, n -> for (i in 0 until n) got.add(s[i]) }
        var i = 0
        while (i < src.size) { val n = minOf(1000 + i % 777, src.size - i); r.push(src.copyOfRange(i, i + n)); i += n }
        r.finish()
        check(got.size == reference.size) { "$rate: ${got.size} vs ${reference.size}" }
        var maxDiff = 0f
        for (j in reference.indices) maxDiff = maxOf(maxDiff, abs(reference[j] - got[j]))
        check(maxDiff < 1e-4f) { "$rate: max diff $maxDiff" }
      }
    }

    test("disk store applies the same normalization as AudioNormalizer") {
      val quiet = FloatArray(16000 * 5) { (0.05 * sin(2 * PI * 300 * it / 16000.0)).toFloat() }
      val expected = AudioNormalizer.normalize(quiet)
      PcmStore.Writer(File(dir, "n.pcm")).let { w -> w.write(quiet); w.finish() }.use { store ->
        check(store.sampleCount == quiet.size.toLong())
        val got = store.read(0, store.sampleCount)
        var maxDiff = 0f
        for (j in got.indices) maxDiff = maxOf(maxDiff, abs(got[j] - expected[j]))
        check(maxDiff < 0.01f) { "max diff $maxDiff" }
      }
    }

    test("65-minute 48 kHz stereo WAV (> 700 MB) streams with a small heap") {
      val seconds = 65 * 60
      val wav = File(dir, "long.wav")
      writeLongWav(wav, seconds, 48000, 3720, 3730) // 1 kHz marker at 62:00-62:10
      check(wav.length() > 192L * 1024 * 1024) { "fixture must exceed 192 MB" }
      println("  fixture ${wav.length() / (1024 * 1024)} MB")
      val started = System.nanoTime()
      val writer = PcmStore.Writer(File(dir, "long.pcm"))
      StreamingWav.stream(wav, writer)
      writer.finish().use { store ->
        println("  prepared in ${(System.nanoTime() - started) / 1_000_000_000} s, heap max ${Runtime.getRuntime().maxMemory() / (1024 * 1024)} MB")
        check(abs(store.durationMs - seconds * 1000L) <= 1) { "duration ${store.durationMs}" }
        check(store.gain > 5f) { "quiet audio must be boosted, gain ${store.gain}" }
        val early = store.readMs(60_000, 62_000)
        val marker = store.readMs(3_722_000, 3_724_000)
        val late = store.readMs(3_800_000, 3_802_000)
        check(power(early, 440.0) > 100 * power(early, 1000.0)) { "440 Hz expected at 1:00" }
        check(power(marker, 1000.0) > 100 * power(marker, 440.0)) { "1 kHz marker expected at 62:02" }
        check(power(late, 440.0) > 100 * power(late, 1000.0)) { "440 Hz expected at 63:20" }
        val rms = sqrt(early.sumOf { it.toDouble() * it } / early.size)
        check(rms in 0.3..0.6) { "normalized level $rms" }

        // ASR stage reads only what it needs: 20 s slices, also at the very end of the recording.
        val sizes = ArrayList<Int>()
        val pipeline = IntervalTranscriber { object : SpeechRecognizer {
          override fun recognize(samples: FloatArray, sampleRate: Int): String { sizes.add(samples.size); return "ok" }
          override fun close() {}
        } }
        val result = pipeline.transcribe(store, listOf(
          SpeakerInterval(3_600_000, 3_650_000, 0),
          SpeakerInterval(seconds * 1000L - 5_000, seconds * 1000L, 1),
        ))
        check(result.getValue("transcript").size == 2)
        check(sizes == listOf(320000, 320000, 160000, 80000)) { "slices $sizes" }
      }
      check(!File(dir, "long.pcm").exists()) { "temporary PCM must be deleted on close" }
    }

    test("WAV header size 0 / 0xFFFFFFFF (streamed recorders) uses the real file length") {
      val f = File(dir, "open.wav")
      writeLongWav(f, 3, 16000, 0, 0)
      java.io.RandomAccessFile(f, "rw").use { it.seek(40); it.write(byteArrayOf(-1, -1, -1, -1)) }
      val w = PcmStore.Writer(File(dir, "open.pcm"))
      StreamingWav.stream(f, w)
      w.finish().use { check(abs(it.durationMs - 3000) <= 1) { "duration ${it.durationMs}" } }
    }
  } finally {
    dir.deleteRecursively()
  }
  println("$passed long-audio tests passed")
}
