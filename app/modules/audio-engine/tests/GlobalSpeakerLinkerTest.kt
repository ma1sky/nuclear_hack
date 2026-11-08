package expo.modules.audioengine.audio

fun main() {
  fun voice(x: Float, y: Float, start: Long, end: Long) =
    VoiceEvidence(floatArrayOf(x, y), 3f, listOf(start to end))
  val linker = GlobalSpeakerLinker()
  val returning = linker.assign(listOf(voice(1f, 0f, 0, 1000), voice(0f, 1f, 2000, 3000), voice(100f, 0f, 121000, 122000)))
  check(returning[0] == returning[2] && returning[0] != returning[1])
  println("PASS returning voices across windows and normalized embedding scales")
  val fragmented = linker.assign(listOf(voice(1f, 0f, 0, 1000), voice(1f, 0f, 2000, 3000)))
  check(fragmented[0] == fragmented[1])
  println("PASS disjoint local fragments can share one identity")
  val overlap = linker.assign(listOf(voice(1f, 0f, 0, 2000), voice(1f, 0f, 500, 3000)))
  check(overlap[0] != overlap[1])
  println("PASS overlapping speakers are not collapsed")
  val missing = linker.assign(listOf(VoiceEvidence(null, 3f, listOf(0L to 300L)),
    VoiceEvidence(floatArrayOf(1f, 0f), .3f, listOf(500L to 800L)),
    VoiceEvidence(floatArrayOf(0f, 0f), 5f, listOf(1000L to 2000L)),
    voice(1f, 0f, 3000, 6000)))
  check(missing.toList() == listOf(-1, -1, -1, 0))
  println("PASS missing, short and zero embeddings do not create speaker IDs")
  val distinctLocal = linker.assign(listOf(
    VoiceEvidence(floatArrayOf(1f, 0f), 6f, listOf(0L to 1000L), 0),
    VoiceEvidence(floatArrayOf(.6f, .8f), 6f, listOf(2000L to 3000L), 0),
    VoiceEvidence(floatArrayOf(1f, 0f), 6f, listOf(121000L to 122000L), 1)))
  check(distinctLocal[0] != distinctLocal[1] && distinctLocal[0] == distinctLocal[2])
  println("PASS similar local voices remain distinct while a returning voice matches")
  // Greedy matching gives both new voices their best existing ID and invents another ID.
  // Joint assignment must choose the stronger total pairing instead.
  val joint = GlobalSpeakerLinker(0.2).assign(listOf(
    VoiceEvidence(floatArrayOf(1f, 0f), 6f, listOf(0L to 3000L), 0),
    VoiceEvidence(floatArrayOf(0f, 1f), 6f, listOf(0L to 3000L), 0),
    VoiceEvidence(floatArrayOf(.8f, .6f), 6f, listOf(121000L to 124000L), 1),
    VoiceEvidence(floatArrayOf(.95f, .312f), 6f, listOf(121000L to 124000L), 1)))
  check(joint[2] == joint[1] && joint[3] == joint[0])
  println("PASS joint window matching avoids greedy identity theft")
  val invalid = linker.assign(listOf(VoiceEvidence(floatArrayOf(Float.NaN, 0f), 3f, emptyList()),
    VoiceEvidence(floatArrayOf(1f, 0f), Float.NaN, emptyList())))
  check(invalid.all { it == -1 })
  println("PASS nonfinite voice evidence is rejected")
  val closeVoices = GlobalSpeakerLinker(localMergeThreshold = .9).assign(listOf(
    VoiceEvidence(floatArrayOf(1f, 0f), 6f, listOf(0L to 1000L), 0),
    VoiceEvidence(floatArrayOf(.8f, .6f), 6f, listOf(2000L to 3000L), 0)))
  check(closeVoices[0] != closeVoices[1])
  println("PASS model-specific local threshold keeps similar distinct voices")
  val token = ProcessingCancellation(); token.cancel()
  check(runCatching { linker.assign(listOf(voice(1f, 0f, 0, 1000)), token) }.isFailure)
  println("PASS identity matching supports cancellation")
}
