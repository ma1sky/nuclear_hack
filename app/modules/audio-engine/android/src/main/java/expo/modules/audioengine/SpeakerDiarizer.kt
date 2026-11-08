package expo.modules.audioengine

import com.k2fsa.sherpa.onnx.*
import expo.modules.audioengine.audio.*
import kotlin.math.roundToLong

internal data class SpeakerInterval(val startMs: Long, val endMs: Long, val speakerId: String)

internal data class DiarizationSettings(val numThreads: Int = 2, val clusteringThreshold: Float = 0.8f,
  val localMergeThreshold: Double = 0.65) {
  init { require(numThreads in 1..4); require(clusteringThreshold in 0f..2f); require(localMergeThreshold in 0.0..1.01) }
  companion object {
    fun forModel(path: String) = if (java.io.File(path).name == "nemo_en_titanet_small.onnx")
      DiarizationSettings(clusteringThreshold = 0.75f, localMergeThreshold = 0.85) else DiarizationSettings()
  }
}

internal object SpeakerDiarizer {
  const val sampleRate = 16_000
  private const val windowSamples = 120 * sampleRate
  private data class Group(val turns: List<SpeakerInterval>, val evidence: VoiceEvidence)
  private fun config(models: Map<String, String>, settings: DiarizationSettings) = OfflineSpeakerDiarizationConfig(
    segmentation = OfflineSpeakerSegmentationModelConfig(
      pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = models.getValue("segmentation")),
      numThreads = settings.numThreads,
    ),
    embedding = SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = settings.numThreads),
    clustering = FastClusteringConfig(numClusters = -1, threshold = settings.clusteringThreshold),
    minDurationOn = 0.2f, minDurationOff = 0.3f,
  )

  fun process(audio: AudioSource, models: Map<String, String>, cancellation: CancellationCheck,
    settings: DiarizationSettings? = null,
    onWindow: (Int, Int) -> Unit = { _, _ -> }): List<SpeakerInterval> {
    if (audio.sampleCount == 0) return emptyList()
    val total = ((audio.sampleCount.toLong() + windowSamples - 1) / windowSamples).toInt()
    val loadStart = android.os.SystemClock.elapsedRealtime()
    val activeSettings = settings ?: DiarizationSettings.forModel(models.getValue("embedding"))
    val engine = OfflineSpeakerDiarization(config = config(models, activeSettings))
    try {
      check(engine.sampleRate() == sampleRate) { "Модель ожидает другую частоту дискретизации." }
      val extractor = if (total > 1) SpeakerEmbeddingExtractor(
        config = SpeakerEmbeddingExtractorConfig(model = models.getValue("embedding"), numThreads = activeSettings.numThreads),
      ) else null
      try {
        android.util.Log.i("AudioEngine", "diarization sessions=1 extractor=" + (if (extractor == null) 0 else 1) +
          " loadMs=" + (android.os.SystemClock.elapsedRealtime() - loadStart) +
          " threads=" + activeSettings.numThreads + " distance=" + activeSettings.clusteringThreshold +
          " localMerge=" + activeSettings.localMergeThreshold)
        val groups = mutableListOf<Group>()
        var first = 0
        var window = 0
        onWindow(0, total)
        while (first < audio.sampleCount) {
          cancellation.check()
          val started = android.os.SystemClock.elapsedRealtime()
          val end = minOf(audio.sampleCount, first + windowSamples)
          val local = convert(engine.process(audio.readSamples(first, end)), (end - first) * 1000L / sampleRate)
          cancellation.check()
          if (extractor == null) { onWindow(1, total); return local }
          val offset = first * 1000L / sampleRate
          for (turns in local.groupBy { it.speakerId }.values) {
            cancellation.check()
            val chosen = turns.sortedByDescending { it.endMs - it.startMs }.take(3)
            val parts = mutableListOf<FloatArray>()
            val perTurn = 6 * sampleRate / chosen.size
            var remaining = 6 * sampleRate
            for (turn in chosen) {
              if (remaining <= 0) break
              val from = first + (turn.startMs * 16).toInt()
              val until = minOf(end, from + minOf(remaining, perTurn, ((turn.endMs - turn.startMs) * 16).toInt()))
              if (until > from) { val samples = audio.readSamples(from, until); parts.add(samples); remaining -= samples.size }
            }
            val count = parts.sumOf { it.size }
            val seconds = count.toFloat() / sampleRate
            val embedding = if (seconds >= 1.5f) {
              val samples = FloatArray(count)
              var cursor = 0
              for (part in parts) { part.copyInto(samples, cursor); cursor += part.size }
              val stream = extractor.createStream()
              try {
                stream.acceptWaveform(samples, sampleRate)
                stream.inputFinished()
                if (extractor.isReady(stream)) extractor.compute(stream) else null
              } finally { stream.release() }
            } else null
            val absolute = turns.map { SpeakerInterval(it.startMs + offset, it.endMs + offset, it.speakerId) }
            groups.add(Group(absolute, VoiceEvidence(embedding, seconds, absolute.map { it.startMs to it.endMs }, window)))
          }
          first = end
          window++
          onWindow(window, total)
          android.util.Log.i("AudioEngine", "diarization window=" + window + "/" + total +
            " elapsedMs=" + (android.os.SystemClock.elapsedRealtime() - started))
        }
        cancellation.check()
        val identities = GlobalSpeakerLinker(localMergeThreshold = activeSettings.localMergeThreshold).assign(groups.map { it.evidence }, cancellation)
        val ids = linkedMapOf<Int, String>()
        val ordered = groups.flatMapIndexed { index, group -> group.turns.map { it to identities[index] } }
          .sortedWith(compareBy({ it.first.startMs }, { it.first.endMs }))
        return merge(ordered.map { (turn, identity) ->
          val id = if (identity < 0) "speaker_unknown" else ids.getOrPut(identity) { "speaker_" + (ids.size + 1) }
          SpeakerInterval(turn.startMs, turn.endMs, id)
        })
      } finally { extractor?.release() }
    } finally { engine.release() }
  }
  fun process(samples: FloatArray, models: Map<String, String>): List<SpeakerInterval> =
    process(PreparedAudio(samples), models, CancellationCheck.NONE)

  private fun convert(segments: Array<OfflineSpeakerDiarizationSegment>, durationMs: Long): List<SpeakerInterval> {
    val speakers = linkedMapOf<Int, String>()
    val turns = segments.sortedWith(compareBy({ it.start }, { it.end }, { it.speaker })).mapNotNull { segment ->
      if (!segment.start.isFinite() || !segment.end.isFinite()) return@mapNotNull null
      val start = (segment.start.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      val end = (segment.end.toDouble() * 1000).roundToLong().coerceIn(0, durationMs)
      if (end <= start) return@mapNotNull null
      SpeakerInterval(start, end, speakers.getOrPut(segment.speaker) { "speaker_" + (speakers.size + 1) })
    }
    return merge(turns)
  }
  private fun merge(turns: List<SpeakerInterval>): List<SpeakerInterval> {
    val merged = mutableListOf<SpeakerInterval>()
    for (turn in turns) {
      val last = merged.lastOrNull()
      if (last != null && last.speakerId == turn.speakerId && turn.startMs - last.endMs <= 500L)
        merged[merged.lastIndex] = SpeakerInterval(last.startMs, maxOf(last.endMs, turn.endMs), last.speakerId)
      else merged.add(turn)
    }
    return merged.filter { it.endMs - it.startMs >= 200L }
  }
}
