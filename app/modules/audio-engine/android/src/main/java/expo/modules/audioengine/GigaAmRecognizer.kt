package expo.modules.audioengine

import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineNemoEncDecCtcModelConfig
import expo.modules.audioengine.audio.SpeechRecognizer

internal class GigaAmRecognizer(
  private val models: Map<String, String>,
  private val forcedLanguage: String? = null
) : SpeechRecognizer {
  private val hasEnglishModel = models.containsKey("asr_en") && models.containsKey("tokens_en")

  private var activeRecognizer: OfflineRecognizer? = null
  private var detectedLanguage: String? = when (forcedLanguage?.lowercase()) {
    "en", "english" -> "en"
    "ru", "russian" -> "ru"
    else -> null
  }

  init {
    if (detectedLanguage == "en" && hasEnglishModel) {
      activeRecognizer = createRecognizer("asr_en", "tokens_en")
    } else if (detectedLanguage == "ru" || !hasEnglishModel) {
      detectedLanguage = "ru"
      activeRecognizer = createRecognizer("asr", "tokens")
    }
  }

  private fun createRecognizer(modelKey: String, tokensKey: String): OfflineRecognizer {
    return OfflineRecognizer(config = OfflineRecognizerConfig(
      modelConfig = OfflineModelConfig(
        nemo = OfflineNemoEncDecCtcModelConfig(model = models.getValue(modelKey)),
        tokens = models.getValue(tokensKey),
        numThreads = 2,
        provider = "cpu",
      ),
      blankPenalty = 0.0f,
    ))
  }

  private fun isEnglishContent(enText: String, ruText: String): Boolean {
    val commonEnWords = setOf(
      "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
      "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her",
      "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up",
      "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
      "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could",
      "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
      "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
      "new", "want", "because", "any", "these", "give", "day", "most", "us", "are", "is", "was",
      "pencil", "lead", "lamp", "shone", "clothes", "lodging", "free", "glow", "sweet", "girl", "flame",
      "best", "green", "black", "rights", "steady"
    )
    val enWords = enText.lowercase().split("\\s+".toRegex()).filter { it.isNotEmpty() }
    val enMatches = enWords.count { it in commonEnWords }
    val cyrillicCount = ruText.count { it in '\u0400'..'\u04FF' }
    val latinCount = enText.count { it.isLetter() && it.code < 128 }

    return (enMatches >= 1 || (latinCount > 10 && cyrillicCount == 0)) && (latinCount >= cyrillicCount)
  }

  override fun recognize(samples: FloatArray, sampleRate: Int): String {
    if (activeRecognizer == null && hasEnglishModel) {
      val ruEngine = createRecognizer("asr", "tokens")
      val ruText = decodeWith(ruEngine, samples, sampleRate)
      val enEngine = createRecognizer("asr_en", "tokens_en")
      val enText = decodeWith(enEngine, samples, sampleRate)

      return if (isEnglishContent(enText, ruText)) {
        detectedLanguage = "en"
        ruEngine.release()
        activeRecognizer = enEngine
        enText
      } else {
        detectedLanguage = "ru"
        enEngine.release()
        activeRecognizer = ruEngine
        ruText
      }
    }

    val engine = activeRecognizer ?: createRecognizer("asr", "tokens").also { activeRecognizer = it }
    return decodeWith(engine, samples, sampleRate)
  }

  private fun decodeWith(engine: OfflineRecognizer, samples: FloatArray, sampleRate: Int): String {
    val stream = engine.createStream()
    return try {
      stream.acceptWaveform(samples, sampleRate)
      engine.decode(stream)
      engine.getResult(stream).text.trim()
    } finally {
      stream.release()
    }
  }

  override fun close() {
    activeRecognizer?.release()
    activeRecognizer = null
  }
}
