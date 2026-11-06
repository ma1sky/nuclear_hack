package expo.modules.audioengine.audio

/** Shared seam for Alexander's diarizer and Artem's GigaAM adapter; never substitutes model output. */
class IntervalTranscriber(private val createRecognizer: () -> SpeechRecognizer) {
  fun transcribe(
    audio: PreparedAudio,
    intervals: List<SpeakerInterval>,
    cancellation: CancellationCheck = CancellationCheck.NONE,
    progress: (AudioProgress) -> Unit = {},
  ): Map<String, List<Map<String, Any>>> {
    val sorted = intervals.sortedWith(compareBy({ it.startMs }, { it.endMs }))
    sorted.forEach {
      require(it.startMs >= 0 && it.endMs > it.startMs && it.endMs <= audio.durationMs) { "Interval outside recording" }
      require(it.speakerId >= 0) { "Invalid speaker ID" }
    }
    cancellation.check()
    val speakers = linkedMapOf<Int, String>()
    val entries = mutableListOf<TranscriptEntry>()
    progress(AudioProgress("transcribing", 0, sorted.size))
    if (sorted.isEmpty()) return mapOf("transcript" to emptyList())
    createRecognizer().use { recognizer ->
      sorted.forEachIndexed { index, interval ->
        cancellation.check()
        val speaker = speakers.getOrPut(interval.speakerId) { "speaker_${speakers.size + 1}" }
        val start = (interval.startMs * 16).toInt()
        val end = (interval.endMs * 16).toInt()
        val words = mutableListOf<String>()
        var position = start
        // Split long turns for bounded ASR memory; retain original speaker and interval in export.
        while (position < end) {
          cancellation.check()
          val next = minOf(end, position + 20 * 16000)
          val text = recognizer.recognize(audio.samples.copyOfRange(position, next), 16000).trim()
          cancellation.check()
          if (text.isNotEmpty()) words.add(text)
          position = next
        }
        if (words.isNotEmpty()) entries.add(TranscriptEntry(speaker, interval.startMs, interval.endMs, words.joinToString(" ")))
        progress(AudioProgress("transcribing", index + 1, sorted.size))
      }
    }
    return mapOf("transcript" to entries.map { it.toExport() })
  }

  fun process(audio: PreparedAudio, diarizer: DiarizationProvider, cancellation: CancellationCheck = CancellationCheck.NONE): Map<String, List<Map<String, Any>>> {
    val intervals = diarizer.segment(audio, cancellation)
    // DiarizationProvider must release its resources before returning.
    return transcribe(audio, intervals, cancellation)
  }
}
