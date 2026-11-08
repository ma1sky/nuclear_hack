package expo.modules.audioengine

import expo.modules.audioengine.audio.PreparedAudio

/** Recluster cannot-link rule: two local speakers of one window talking at once are different people. */
fun main() {
  // 0-4 s voice A, 4-6 s silence, 6-10 s voice B. The embedder sees the sign of the slice mean.
  val audio = PreparedAudio(FloatArray(10 * 16000) { i -> when { i < 4 * 16000 -> 0.1f; i < 6 * 16000 -> 0f; else -> -0.1f } })
  val embedder = Recluster.Embedder { s -> val m = s.average().toFloat(); floatArrayOf(m, -m, 0.001f) }
  fun labels(backchannelTrack: Int, cannotLink: Boolean): List<Recluster.Seg> = Recluster.run(audio, listOf(
    Recluster.Seg(0.0, 4.0, 0),                  // window 0, local speaker 0: A
    Recluster.Seg(1.0, 2.0, backchannelTrack),   // overlaps A; its audio is A's (mixture), so it embeds as A
    Recluster.Seg(6.0, 10.0, 3),                 // window 1: B
  ), embedder, Recluster.Params(tau = 0.6, cannotLink = cannotLink))

  val same = labels(1, cannotLink = true)        // same window, other local speaker
  val a = same.first { it.start == 0.0 }.speaker; val back = same.first { it.start == 1.0 }.speaker; val b = same.first { it.start == 6.0 }.speaker
  check(a != b) { "A and B must be different speakers: $same" }
  check(back == b && back != a) { "overlapping local speaker of the same window must not be A: $same" }
  println("PASS cannot-link moves the overlapped local speaker to another voice")

  check(same.size == 3) { "overlap must survive as its own segment: $same" }

  // Without the rule the backchannel gets A's label and is merged into A's 0-4 s turn (previous behaviour).
  val off = labels(1, cannotLink = false)
  check(off.size == 2 && off.any { it.start == 0.0 && it.end == 4.0 }) { "without the rule the backchannel joins A: $off" }
  println("PASS without cannot-link the result is unchanged (previous behaviour)")

  val otherWindow = labels(4, cannotLink = true) // a different window: no constraint
  check(otherWindow.size == 2 && otherWindow.any { it.start == 0.0 && it.end == 4.0 }) { "rule must only apply within one window: $otherWindow" }
  println("PASS rule applies only within one window")
}
