package expo.modules.audioengine

import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineNemoEncDecCtcModelConfig
import expo.modules.audioengine.audio.SpeechRecognizer

internal class GigaAmRecognizer(models: Map<String, String>) : SpeechRecognizer {
  private val recognizer = OfflineRecognizer(config = OfflineRecognizerConfig(
    modelConfig = OfflineModelConfig(
      nemo = OfflineNemoEncDecCtcModelConfig(model = models.getValue("asr")),
      tokens = models.getValue("tokens"), numThreads = 2, provider = "cpu",
    ),
    // Keep the verified ASR baseline until insertion/deletion WER is measured.
    blankPenalty = 0.0f,
  ))

  override fun recognize(samples: FloatArray, sampleRate: Int): String {
    val stream = recognizer.createStream()
    return try {
      stream.acceptWaveform(samples, sampleRate)
      recognizer.decode(stream)
      recognizer.getResult(stream).text
    } finally { stream.release() }
  }
  override fun close() { recognizer.release() }
}
