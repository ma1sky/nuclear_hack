package expo.modules.audioengine.audio
import java.io.File
import java.io.RandomAccessFile
import kotlin.math.*

fun main() {
  val directory = kotlin.io.path.createTempDirectory("disk-audio-tests").toFile()
  fun wav(name: String, seconds: Int, rate: Int, signal: Boolean): File {
    val file = File(directory, name)
    RandomAccessFile(file, "rw").use { out ->
      fun word(n: Int) { out.write(n and 255); out.write((n ushr 8) and 255) }
      fun integer(n: Int) { word(n); word(n ushr 16) }
      val size = seconds * rate * 2
      out.writeBytes("RIFF"); integer(size + 36); out.writeBytes("WAVEfmt ")
      integer(16); word(1); word(1); integer(rate); integer(rate * 2); word(2); word(16)
      out.writeBytes("data"); integer(size)
      if (signal) for (i in 0 until seconds * rate) word((sin(2 * PI * 440 * i / rate) * 24000).toInt())
      else out.setLength(44L + size)
    }
    return file
  }
  try {
    val hour = wav("hour.wav", 3600, 16000, false)
    WavPreparer.prepareDisk(hour, directory, CancellationCheck.NONE).use { audio ->
      check(audio.durationMs == 3600000L && audio.sampleCount == 57600000)
      check(audio.readSamples(57584000, 57600000).all { it == 0f })
      check(runCatching { audio.readSamples(0, audio.sampleCount) }.isFailure)
      val result = IntervalTranscriber { object : SpeechRecognizer {
        override fun recognize(samples: FloatArray, sampleRate: Int): String {
          check(samples.size <= 20 * 16000)
          return "bounded"
        }
        override fun close() {}
      } }.transcribe(audio, listOf(SpeakerInterval(3590000, 3600000, 0)))
      check(result.getValue("transcript").single()["start_ms"] == 3590000L)
    }
    check(directory.listFiles()!!.none { it.extension == "f32" })
    println("PASS hour preparation and end-of-file ASR slice under 64 MiB heap")
    val input = wav("44k.wav", 3, 44100, true)
    val reference = WavPreparer.prepare(input).samples
    WavPreparer.prepareDisk(input, directory, CancellationCheck.NONE).use { audio ->
      check(audio.sampleCount == 48000)
      val actual = audio.readSamples(0, audio.sampleCount)
      for (i in actual.indices step 64) check(abs(actual[i] - reference[i]) < .00001f)
    }
    println("PASS 44.1 kHz streaming resampling, duration and filter continuity")
    var checks = 0
    check(runCatching { WavPreparer.prepareDisk(hour, directory, CancellationCheck {
      if (++checks > 20) throw java.util.concurrent.CancellationException()
    }) }.isFailure)
    check(directory.listFiles()!!.none { it.extension == "f32" })
    println("PASS cancellation deletes temporary PCM")
  } finally { directory.deleteRecursively() }
}
