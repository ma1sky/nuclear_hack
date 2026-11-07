const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function library() {
  const files = new Map([['file:///cache/record.m4a', 'real audio']]);
  const disk = {
    documentDirectory: 'file:///documents/',
    makeDirectoryAsync: async () => {},
    copyAsync: async ({ from, to }) => { assert.ok(files.has(from)); files.set(to, files.get(from)); },
    writeAsStringAsync: async (p, s) => { files.set(p, s); },
    getInfoAsync: async p => ({ exists: p.endsWith('/') || files.has(p) }),
    readDirectoryAsync: async p => [...files.keys()].filter(k => k.startsWith(p)).map(k => k.slice(p.length)),
    readAsStringAsync: async p => files.get(p),
    deleteAsync: async p => { files.delete(p); },
  };
  const moduleObject = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/libraryService.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: moduleObject.exports, module: moduleObject, require: name => { assert.equal(name, 'expo-file-system/legacy'); return disk; } });
  return { ...moduleObject.exports, files };
}
test('saved recording survives re-read and rename without replacing audio', async () => {
  const api = library();
  const kept = await api.retainAudio('file:///cache/record.m4a');
  const record = { ...kept, title: 'Разговор', durationMs: 42000, createdAt: '2026-11-07T08:00:00Z' };
  await api.saveAudio(record);
  api.files.delete('file:///cache/record.m4a');
  assert.equal((await api.listAudio())[0].title, 'Разговор');
  await api.saveAudio({ ...record, title: 'Интервью' });
  const [renamed] = await api.listAudio();
  assert.equal(renamed.title, 'Интервью');
  assert.equal(renamed.uri, kept.uri);
  assert.equal(api.files.get(kept.uri), 'real audio');
  await api.removeAudio(renamed);
  assert.equal((await api.listAudio()).length, 0);
});
test('recording deletion cannot delete an imported external file', async () => {
  const api = library();
  await assert.rejects(api.removeAudio({ id: 'audio_1', uri: 'file:///cache/record.m4a' }));
  assert.equal(api.files.get('file:///cache/record.m4a'), 'real audio');
});
