const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = fs.readFileSync(path.join(root, 'src/utils/transcriptValidation.ts'), 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleObject.exports, module: moduleObject });
const { sanitizeTranscriptExport } = moduleObject.exports;
test('strict export preserves real text and IDs, strips metadata, accepts empty transcript', () => {
  const entry = { speaker_id: 'speaker_9', start_ms: 1, end_ms: 25, text: 'Привет', summary: 'remove' };
  assert.equal(JSON.stringify(sanitizeTranscriptExport({ transcript: [entry] })), JSON.stringify({ transcript: [{ speaker_id: 'speaker_9', start_ms: 1, end_ms: 25, text: 'Привет' }] }));
  assert.equal(JSON.stringify(sanitizeTranscriptExport({ transcript: [] })), '{"transcript":[]}');
});
test('invalid export cannot be coerced into fabricated values', () => {
  for (const patch of [{ speaker_id: 1 }, { start_ms: NaN }, { end_ms: Infinity }, { start_ms: -1 }, { end_ms: 1 }, { start_ms: 1.5 }, { text: null }]) {
    assert.throws(() => sanitizeTranscriptExport({ transcript: [{ speaker_id: 's', start_ms: 1, end_ms: 20, text: 'x', ...patch }] }));
  }
});
test('production ASR and LLM paths have no mock/simulation fallback', () => {
  for (const relative of ['modules/audio-engine/index.ts', 'src/services/llmService.ts', 'App.tsx', 'modules/audio-engine/android/src/main/java/expo/modules/audioengine/AudioEngineModule.kt']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /MOCK_TRANSCRIPT|MOCK_SUMMARY|mock:\/\/|generateFallbackSummary|\[Реплика \$/);
  }
});
