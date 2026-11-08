package expo.modules.audioengine.audio

import kotlin.math.sqrt

data class VoiceEvidence(val embedding: FloatArray?, val seconds: Float, val spans: List<Pair<Long, Long>>, val window: Int = -1)

/** Recording-scoped IDs: merge disjoint local fragments first, then match an entire window at once. */
class GlobalSpeakerLinker(private val threshold: Double = 0.55, private val localMergeThreshold: Double = 0.65) {
  private data class Cluster(var vector: FloatArray, var weight: Float,
    val spans: MutableList<Pair<Long, Long>>, val members: MutableList<Int>)

  fun assign(evidence: List<VoiceEvidence>, cancellation: CancellationCheck = CancellationCheck.NONE): IntArray {
    val labels = IntArray(evidence.size) { -1 }
    val identities = mutableListOf<Cluster>()
    val windows = evidence.indices.groupBy { index ->
      evidence[index].window.takeIf { it >= 0 }
        ?: ((evidence[index].spans.minOfOrNull { it.first } ?: 0) / 120000).toInt()
    }.toSortedMap()
    for (indices in windows.values) {
      cancellation.check()
      val local = indices.mapNotNull { index ->
        val item = evidence[index]
        val vector = unit(item.embedding)
        if (vector == null || !item.seconds.isFinite() || item.seconds < 1.5f) null
        else Cluster(vector, item.seconds.coerceAtMost(9f), item.spans.toMutableList(), mutableListOf(index))
      }.toMutableList()
      // Local diarization sometimes fragments one voice. Never join simultaneous voices.
      while (true) {
        cancellation.check()
        var bestA = -1
        var bestB = -1
        var score = localMergeThreshold
        for (a in local.indices) for (b in 0 until a) {
          if (overlaps(local[a].spans, local[b].spans)) continue
          val similarity = cosine(local[a].vector, local[b].vector)
          if (similarity >= score) { score = similarity; bestA = a; bestB = b }
        }
        if (bestA < 0) break
        add(local[bestB], local[bestA])
        local.removeAt(bestA)
      }
      val previousCount = identities.size
      // Extra columns mean "new voice". Snapshot centroids before assigning any local speaker.
      val scores = Array(local.size) { a -> DoubleArray(previousCount + local.size) { b ->
        if (b >= previousCount) threshold
        else if (overlaps(local[a].spans, identities[b].spans)) -1e6
        else cosine(local[a].vector, identities[b].vector).takeIf { it >= threshold } ?: -1e6
      } }
      val assignment = maximumAssignment(scores, cancellation)
      for (a in local.indices) {
        cancellation.check()
        val cluster = local[a]
        val target = assignment[a]
        val id = if (target < previousCount) {
          add(identities[target], cluster)
          target
        } else {
          identities.add(cluster)
          identities.lastIndex
        }
        for (index in cluster.members) labels[index] = id
      }
    }
    return labels
  }

  private fun add(target: Cluster, source: Cluster) {
    target.vector = unit(FloatArray(target.vector.size) { target.vector[it] * target.weight + source.vector[it] * source.weight })!!
    target.weight += source.weight
    target.spans.addAll(source.spans)
    target.members.addAll(source.members)
  }

  /** Rectangular Hungarian algorithm, rows <= columns; no factorial search or greedy claimed IDs. */
  private fun maximumAssignment(scores: Array<DoubleArray>, cancellation: CancellationCheck): IntArray {
    if (scores.isEmpty()) return IntArray(0)
    val n = scores.size
    val m = scores[0].size
    val u = DoubleArray(n + 1)
    val v = DoubleArray(m + 1)
    val p = IntArray(m + 1)
    val way = IntArray(m + 1)
    for (i in 1..n) {
      cancellation.check()
      p[0] = i
      var column = 0
      val distance = DoubleArray(m + 1) { Double.POSITIVE_INFINITY }
      val used = BooleanArray(m + 1)
      do {
        cancellation.check()
        used[column] = true
        val row = p[column]
        var delta = Double.POSITIVE_INFINITY
        var next = 0
        for (j in 1..m) if (!used[j]) {
          val cost = -scores[row - 1][j - 1] - u[row] - v[j]
          if (cost < distance[j]) { distance[j] = cost; way[j] = column }
          if (distance[j] < delta) { delta = distance[j]; next = j }
        }
        for (j in 0..m) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta } else distance[j] -= delta
        }
        column = next
      } while (p[column] != 0)
      do {
        val previous = way[column]
        p[column] = p[previous]
        column = previous
      } while (column != 0)
    }
    return IntArray(n).also { result -> for (j in 1..m) if (p[j] > 0) result[p[j] - 1] = j - 1 }
  }

  private fun cosine(a: FloatArray, b: FloatArray): Double =
    if (a.size != b.size) -1e6 else a.indices.sumOf { a[it].toDouble() * b[it] }
  private fun overlaps(a: List<Pair<Long, Long>>, b: List<Pair<Long, Long>>) =
    a.any { x -> b.any { y -> minOf(x.second, y.second) - maxOf(x.first, y.first) > 200 } }
  private fun unit(value: FloatArray?): FloatArray? {
    if (value == null || value.isEmpty() || value.any { !it.isFinite() }) return null
    val norm = sqrt(value.sumOf { it.toDouble() * it })
    if (norm < 1e-9) return null
    return FloatArray(value.size) { (value[it] / norm).toFloat() }
  }
}
