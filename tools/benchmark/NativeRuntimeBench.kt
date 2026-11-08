package expo.modules.audioengine

import android.os.SystemClock
import expo.modules.audioengine.audio.*
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

fun main(args: Array<String>) {
  val mode = args[0]
  val root = File(args[1])
  val source = File(args[2])
  val model = args[3]
  val threads = args[4].toInt()
  val threshold = args.getOrNull(5)?.toFloat() ?: 0.8f
  val localMerge = args.getOrNull(6)?.toDouble() ?: 0.65
  val models = mapOf("segmentation" to File(root, "models/pyannote-segmentation.int8.onnx").path,
    "embedding" to File(root, if (model == "titanet") "models/nemo_en_titanet_small.onnx" else "models/3dspeaker.onnx").path,
    "asr" to File(root, "models/gigaam-v2.int8.onnx").path,
    "tokens" to File(root, "models/gigaam-tokens.txt").path)
  val preparation = SystemClock.elapsedRealtime()
  val cache = File(root, "cache").apply { mkdirs() }
  WavPreparer.prepareDisk(source, cache, CancellationCheck.NONE).use { audio ->
    val output = JSONObject().put("mode", mode).put("model", model).put("threads", threads)
      .put("threshold", threshold).put("local_merge_threshold", localMerge).put("duration_ms", audio.durationMs)
      .put("prepare_ms", SystemClock.elapsedRealtime() - preparation)
      .put("available_processors", Runtime.getRuntime().availableProcessors())
      .put("heap_max_bytes", Runtime.getRuntime().maxMemory())
    if (mode == "diar") {
      val started = SystemClock.elapsedRealtime()
      val turns = SpeakerDiarizer.process(audio, models, CancellationCheck.NONE,
        settings = DiarizationSettings(threads, threshold, localMerge))
      output.put("elapsed_ms", SystemClock.elapsedRealtime() - started)
      output.put("turns", JSONArray().also { list -> for (turn in turns) list.put(JSONObject()
        .put("speaker_id", turn.speakerId).put("start_ms", turn.startMs).put("end_ms", turn.endMs)) })
    } else {
      val samples = audio.readSamples(0, minOf(audio.sampleCount, 20 * 16000))
      val started = SystemClock.elapsedRealtime()
      GigaAmRecognizer(models, "ru", cpuThreads = threads).use { recognizer ->
        output.put("load_ms", SystemClock.elapsedRealtime() - started)
        output.put("iterations", JSONArray().also { iterations -> repeat(3) {
          val start = SystemClock.elapsedRealtime()
          val text = recognizer.recognize(samples, 16000)
          iterations.put(JSONObject().put("elapsed_ms", SystemClock.elapsedRealtime() - start).put("text", text))
        } })
      }
    }
    println("BENCH_JSON " + output.toString())
  }
}
