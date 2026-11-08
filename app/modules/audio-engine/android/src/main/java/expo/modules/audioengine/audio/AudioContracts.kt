package expo.modules.audioengine.audio

import java.util.concurrent.CancellationException

fun interface CancellationCheck {
  fun check()
  companion object { val NONE = CancellationCheck {} }
}

class ProcessingCancellation : CancellationCheck {
  @Volatile private var cancelled = false
  fun cancel() { cancelled = true }
  override fun check() { if (cancelled) throw CancellationException("Audio processing cancelled") }
}

interface AudioSource : AutoCloseable {
  val sampleRate: Int get() = 16000
  val sampleCount: Int
  val durationMs: Long get() = sampleCount.toLong() * 1000 / sampleRate
  fun readSamples(start: Int, end: Int): FloatArray
  override fun close() {}
}
data class PreparedAudio(val samples: FloatArray, override val sampleRate: Int = 16000) : AudioSource {
  override val sampleCount: Int get() = samples.size
  override fun readSamples(start: Int, end: Int) = samples.copyOfRange(start, end)
  init { require(sampleRate == 16000) { "Pipeline requires mono 16 kHz" } }
}

/** Milliseconds relative to the original recording; speakerId is the diarizer's cluster ID. */
data class SpeakerInterval(val startMs: Long, val endMs: Long, val speakerId: Int)

data class TranscriptEntry(val speakerId: String, val startMs: Long, val endMs: Long, val text: String) {
  fun toExport(): Map<String, Any> = mapOf(
    "speaker_id" to speakerId, "start_ms" to startMs, "end_ms" to endMs, "text" to text,
  )
}

fun interface DiarizationProvider {
  fun segment(audio: PreparedAudio, cancellation: CancellationCheck): List<SpeakerInterval>
}

/** Factory must create a real GigaAM recognizer after diarization resources are released. */
interface SpeechRecognizer : AutoCloseable {
  fun recognize(samples: FloatArray, sampleRate: Int): String
}

data class AudioProgress(val stage: String, val completed: Int, val total: Int)
