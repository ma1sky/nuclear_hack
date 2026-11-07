package expo.modules.audioengine

import com.k2fsa.sherpa.onnx.FastClusteringConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarization
import com.k2fsa.sherpa.onnx.OfflineSpeakerDiarizationConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeakerSegmentationPyannoteModelConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import expo.modules.audioengine.audio.AudioSource
import kotlin.math.roundToLong

internal data class SpeakerInterval(val startMs: Long, val endMs: Long, val speakerId: String)

internal object SpeakerDiarizer {
  const val sampleRate = 16_000

  /** Recordings up to this length are diarized in one pass, exactly as before. */
  private const val SINGLE_PASS_SAMPLES = 15L * 60 * sampleRate
  /** Longer recordings are segmented in 10-minute chunks: bounded memory regardless of duration. */
  private const val CHUNK_SAMPLES = 10L * 60 * sampleRate

  private fun config(models: Map<String, String>) = OfflineSpeakerDiarizationConfig(
    segmentation = OfflineSpeakerSegmentationModelConfig(
      pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = models.getValue("segmentation")),
      numThreads = 2,
    ),
    embedding = embeddingConfig(models),
    // Calibrated and validated: docs/der-study-2026-11-07.md
    clustering = FastClusteringConfig(numClusters = -1, threshold = 0.8f),
    minDurationOn = 0.2f,
    minDurationOff = 0.3f,
  )

  private fun embeddingConfig(models: Map<String, String>) =
    SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = 2)

  fun process(audio: AudioSource, models: Map<String, String>, check: () -> Unit = {}): List<SpeakerInterval> {
    if (audio.sampleCount == 0L) return emptyList()
    return if (audio.sampleCount <= SINGLE_PASS_SAMPLES) singlePass(audio, models) else chunked(audio, models, check)
  }

  /** Unchanged behaviour for ordinary recordings. */
  private fun singlePass(audio: AudioSource, models: Map<String, String>): List<SpeakerInterval> {
    val samples = audio.read(0, audio.sampleCount)
    val engine = OfflineSpeakerDiarization(config = config(models))
    val segments = try {
      check(engine.sampleRate() == sampleRate) { "Модель ожидает другую частоту дискретизации." }
      engine.process(samples)
    } finally {
      engine.release()
    }
    val durationMs = audio.durationMs
    val speakers = mutableMapOf<Int, String>()
    val raw = segments.sortedWith(compareBy({ it.start }, { it.end }, { it.speaker })).mapNotNull { segment ->
      if (!segment.start.isFinite() || !segment.end.isFinite()) return@mapNotNull null
      val startMs = (segment.start.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      val endMs = (segment.end.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      if (endMs <= startMs) return@mapNotNull null
      SpeakerInterval(startMs, endMs, speakers.getOrPut(segment.speaker) { "speaker_${speakers.size + 1}" })
    }
    return mergeAndFilter(raw)
  }

  /**
   * Long recordings: pyannote segmentation chunk by chunk (each chunk is a small slice read from disk),
   * then one global re-clustering over all segments so the same voice keeps one ID across chunks.
   */
  private fun chunked(audio: AudioSource, models: Map<String, String>, check: () -> Unit): List<SpeakerInterval> {
    val segments = ArrayList<Recluster.Seg>()
    val engine = OfflineSpeakerDiarization(config = config(models))
    try {
      check(engine.sampleRate() == sampleRate) { "Модель ожидает другую частоту дискретизации." }
      var offset = 0L
      while (offset < audio.sampleCount) {
        check()
        val end = minOf(audio.sampleCount, offset + CHUNK_SAMPLES)
        val chunk = audio.read(offset, end)
        val base = offset.toDouble() / sampleRate
        for (s in engine.process(chunk)) {
          if (!s.start.isFinite() || !s.end.isFinite() || s.end <= s.start) continue
          segments.add(Recluster.Seg(base + s.start, base + s.end, s.speaker))
        }
        offset = end
      }
    } finally {
      engine.release()
    }
    check()
    val extractor = SpeakerEmbeddingExtractor(config = embeddingConfig(models))
    val clustered = try {
      Recluster.run(audio, segments, Recluster.Embedder { chunk ->
        val stream = extractor.createStream()
        try {
          stream.acceptWaveform(chunk, sampleRate)
          stream.inputFinished()
          if (extractor.isReady(stream)) extractor.compute(stream) else null
        } finally { stream.release() }
      }, Recluster.Params(), check)
    } finally {
      extractor.release()
    }
    val durationMs = audio.durationMs
    val speakers = mutableMapOf<Int, String>()
    val raw = clustered.sortedWith(compareBy({ it.start }, { it.end })).mapNotNull { segment ->
      val startMs = (segment.start * 1000).roundToLong().coerceIn(0, durationMs)
      val endMs = (segment.end * 1000).roundToLong().coerceIn(0, durationMs)
      if (endMs <= startMs) return@mapNotNull null
      SpeakerInterval(startMs, endMs, speakers.getOrPut(segment.speaker) { "speaker_${speakers.size + 1}" })
    }
    return mergeAndFilter(raw)
  }

  private fun mergeAndFilter(intervals: List<SpeakerInterval>): List<SpeakerInterval> {
    val merged = mutableListOf<SpeakerInterval>()
    for (interval in intervals) {
      val last = merged.lastOrNull()
      if (last != null && last.speakerId == interval.speakerId && (interval.startMs - last.endMs) <= 500L) {
        merged[merged.lastIndex] = SpeakerInterval(last.startMs, maxOf(last.endMs, interval.endMs), last.speakerId)
      } else {
        merged.add(interval)
      }
    }
    return merged.filter { (it.endMs - it.startMs) >= 200L }
  }
}
