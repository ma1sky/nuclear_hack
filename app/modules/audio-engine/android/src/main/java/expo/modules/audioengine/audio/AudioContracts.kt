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

/** Mono 16 kHz audio readable by slices; long recordings are backed by a file, not by the heap. */
interface AudioSource {
  val sampleCount: Long
  val durationMs: Long get() = sampleCount * 1000 / 16000
  /** Samples [from, to), clipped to the recording. */
  fun read(from: Long, to: Long): FloatArray
}

data class PreparedAudio(val samples: FloatArray, val sampleRate: Int = 16000) : AudioSource {
  init { require(sampleRate == 16000) { "Pipeline requires mono 16 kHz" } }
  override val sampleCount: Long get() = samples.size.toLong()
  override val durationMs: Long get() = samples.size.toLong() * 1000 / sampleRate
  override fun read(from: Long, to: Long): FloatArray {
    val a = from.coerceIn(0, sampleCount).toInt()
    return samples.copyOfRange(a, to.coerceIn(a.toLong(), sampleCount).toInt())
  }
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
