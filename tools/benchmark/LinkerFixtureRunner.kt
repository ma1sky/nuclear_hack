package expo.modules.audioengine.audio
import java.io.File

fun main(args: Array<String>) {
  val evidence = File(args[0]).readLines().filter { it.isNotBlank() }.map { line ->
    val fields = line.split(9.toChar())
    VoiceEvidence(if (fields[2] == "null") null else fields[2].split(",").map { it.toFloat() }.toFloatArray(),
      fields[0].toFloat(), fields[1].split(";").map { span ->
        val bounds = span.split(","); bounds[0].toLong() to bounds[1].toLong()
      }, fields[1].split(";").minOf { it.substringBefore(",").toLong() }.div(120000).toInt())
  }
  println(GlobalSpeakerLinker(args[1].toDouble()).assign(evidence).joinToString(","))
}
