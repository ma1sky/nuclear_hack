package expo.modules.audioengine

import com.k2fsa.sherpa.onnx.FastClusteringConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarization
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarizationConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationPyannoteModelConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import kotlin.math.roundToLong

internal data class SpeakerInterval(val startMs: Long, val endMs: Long, val speakerId: String)

internal object SpeakerDiarizer {
  const val sampleRate = 16_000

  fun process(samples: FloatArray, models: Map<String, String>): List<SpeakerInterval> {
    if (samples.isEmpty()) return emptyList()

    val config = OfflineSpeakerDiarizationConfig(
      segmentation = OfflineSpeakerSegmentationModelConfig(
        pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = models.getValue("segmentation")),
        numThreads = 2,
      ),
      embedding = SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = 2),
      // Calibrated and validated: docs/der-study-2026-11-07.md
      clustering = FastClusteringConfig(numClusters = -1, threshold = 0.8f),
      minDurationOn = 0.2f,
      minDurationOff = 0.3f,
    )
    val engine = OfflineSpeakerDiarization(config = config)
    val segments = try {
      check(engine.sampleRate() == sampleRate) { "Модель ожидает другую частоту дискретизации." }
      engine.process(samples)
    } finally {
      engine.release()
    }

    val durationMs = samples.size * 1000L / sampleRate
    val speakers = mutableMapOf<Int, String>()
    val rawIntervals = segments.sortedWith(compareBy({ it.start }, { it.end }, { it.speaker })).mapNotNull { segment ->
      if (!segment.start.isFinite() || !segment.end.isFinite()) return@mapNotNull null
      val startMs = (segment.start.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      val endMs = (segment.end.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      if (endMs <= startMs) return@mapNotNull null
      val speakerId = speakers.getOrPut(segment.speaker) { "speaker_${speakers.size + 1}" }
      SpeakerInterval(startMs, endMs, speakerId)
    }

    val merged = mutableListOf<SpeakerInterval>()
    for (interval in rawIntervals) {
      if (merged.isEmpty()) {
        merged.add(interval)
      } else {
        val last = merged.last()
        if (last.speakerId == interval.speakerId && (interval.startMs - last.endMs) <= 500L) {
          merged[merged.lastIndex] = SpeakerInterval(last.startMs, maxOf(last.endMs, interval.endMs), last.speakerId)
        } else {
          merged.add(interval)
        }
      }
    }
    return merged
  }
}
