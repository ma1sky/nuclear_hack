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

  /** Fallback (ONNX Runtime unavailable): sherpa segmentation in 10-minute chunks, bounded memory. */
  private const val CHUNK_SAMPLES = 10L * 60 * sampleRate

  private fun config(models: Map<String, String>) = OfflineSpeakerDiarizationConfig(
    segmentation = OfflineSpeakerSegmentationModelConfig(
      pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = models.getValue("segmentation")),
      numThreads = threads,
    ),
    embedding = SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = threads),
    clustering = FastClusteringConfig(numClusters = -1, threshold = 0.8f),
    minDurationOn = 0.2f,
    minDurationOff = 0.3f,
  )

  /** Threads for ONNX models: phones have 6-8 cores; 4 keeps the UI responsive. */
  val threads: Int = Runtime.getRuntime().availableProcessors().coerceIn(1, 4)

  /** Final speaker clustering threshold, chosen on the dev set (docs/der-fast-2026-11-08.md). */
  private val reclusterParams = Recluster.Params(tau = 0.6, cannotLink = true)
  /** sherpa fallback: its speaker labels are not window-local tracks, so no cannot-link rule. */
  private val fallbackParams = Recluster.Params(tau = 0.6)

  fun process(audio: AudioSource, models: Map<String, String>, check: () -> Unit = {}, progress: (Int, Int) -> Unit = { _, _ -> }): List<SpeakerInterval> {
    if (audio.sampleCount == 0L) return emptyList()
    val segmenter = try {
      FastSegmenter(models.getValue("segmentation"), threads)
    } catch (e: Throwable) {
      if (e is VirtualMachineError && e !is OutOfMemoryError) throw e
      android.util.Log.w("SpeakerDiarizer", "Fast segmentation unavailable, falling back to sherpa", e)
      null
    }
    if (segmenter == null) {
      return chunked(audio, models, check)
    }
    val started = android.os.SystemClock.elapsedRealtime()
    val segments = segmenter.use { it.segment(audio, check, progress) }
    android.util.Log.i("AudioEngine", "timing segmentation ${android.os.SystemClock.elapsedRealtime() - started} ms, ${segments.size} segments, $threads threads")
    check()
    return assign(audio, segments, models, check, reclusterParams)
  }

  /** Global speaker IDs for local segments: one CAM++ embedding pass per segment + average-linkage AHC. */
  private fun assign(audio: AudioSource, segments: List<Recluster.Seg>, models: Map<String, String>, check: () -> Unit, params: Recluster.Params): List<SpeakerInterval> {
    val extractor = SpeakerEmbeddingExtractor(config = SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = threads))
    val clustered = try {
      Recluster.run(audio, segments, Recluster.Embedder { chunk ->
        val stream = extractor.createStream()
        try {
          stream.acceptWaveform(chunk, sampleRate)
          stream.inputFinished()
          if (extractor.isReady(stream)) extractor.compute(stream) else null
        } finally { stream.release() }
      }, params, check)
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

  /** Fallback: sherpa diarization chunk by chunk (slices read from disk), then the same global re-clustering. */
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
    return assign(audio, segments, models, check, fallbackParams)
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
