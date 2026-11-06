const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { definitions, pack, sha256 } = require('./model-bundle.cjs');

test('APK bundle rejects absent and incomplete sets, then hashes all required roles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-pack-'));
  try {
    const source = path.join(root, 'source');
    const dest = path.join(root, 'assets');
    fs.mkdirSync(source);
    await assert.rejects(pack(source, dest), /Missing bundled model/);
    for (const [, file] of definitions) fs.writeFileSync(path.join(source, file), `test fixture: ${file}`);
    fs.writeFileSync(path.join(source, definitions[0][1]), '');
    await assert.rejects(pack(source, dest), /Missing bundled model/);
    fs.writeFileSync(path.join(source, definitions[0][1]), 'test fixture');
    const manifest = await pack(source, dest);
    assert.deepEqual(manifest.files.map(f => f.id), ['asr', 'tokens', 'segmentation', 'embedding', 'llm']);
    for (const entry of manifest.files) {
      assert.equal(await sha256(path.join(dest, entry.file)), entry.sha256);
      assert.equal(fs.statSync(path.join(dest, entry.file)).size, entry.size);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'))).language, 'ru');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
