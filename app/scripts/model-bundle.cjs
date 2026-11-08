const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const embeddingProfile = process.env.STENOGRAPHER_EMBEDDING || 'titanet';
if (!['titanet', 'eres2net'].includes(embeddingProfile)) throw new Error('Unknown STENOGRAPHER_EMBEDDING profile');
const embeddingFile = embeddingProfile === 'eres2net' ? '3dspeaker.onnx' : 'nemo_en_titanet_small.onnx';
const definitions = [
  ['asr', 'gigaam-v2.int8.onnx'],
  ['tokens', 'gigaam-tokens.txt'],
  ['segmentation', 'pyannote-segmentation.int8.onnx'],
  ['embedding', embeddingFile],
  ['llm', 'qwen2.5-0.5b-instruct-q4_k_m.gguf'],
];

const optionalFiles = [
  'en-conformer.int8.onnx',
  'en-conformer-tokens.txt',
];

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function pack(source, destination) {
  // Validate the complete input before publishing a manifest. No downloads or substitutes.
  for (const [, file] of definitions) {
    const input = path.join(source, file);
    if (!fs.existsSync(input) || !fs.statSync(input).isFile() || !fs.statSync(input).size) {
      throw new Error(`Missing bundled model: ${input}. See docs/model-bundle.md; the checking APK must contain every model.`);
    }
  }
  fs.mkdirSync(destination, { recursive: true });
  // An interrupted rebuild must not leave an old manifest advertising a valid new bundle.
  fs.rmSync(path.join(destination, 'manifest.json'), { force: true });
  const files = [];
  for (const [id, file] of definitions) {
    const input = path.join(source, file);
    const output = path.join(destination, file);
    fs.copyFileSync(input, output);
    const hash = await sha256(input);
    if (await sha256(output) !== hash) throw new Error(`Model copy failed: ${file}`);
    files.push({ id, file, size: fs.statSync(output).size, sha256: hash });
  }
  for (const file of optionalFiles) {
    const input = path.join(source, file);
    if (fs.existsSync(input) && fs.statSync(input).isFile() && fs.statSync(input).size > 0) {
      const output = path.join(destination, file);
      fs.copyFileSync(input, output);
    }
  }
  for (const name of fs.readdirSync(source).filter(name => name.startsWith('LICENSE'))) {
    fs.copyFileSync(path.join(source, name), path.join(destination, name));
  }
  fs.copyFileSync(path.resolve(__dirname, '../../docs/licenses/titanet-small.txt'), path.join(destination, 'LICENSE.titanet'));
  // Remove only the retired generated asset; the developer's baseline weights remain in source.
  fs.rmSync(path.join(destination, embeddingProfile === 'titanet' ? '3dspeaker.onnx' : 'nemo_en_titanet_small.onnx'), { force: true });
  const manifest = { version: 1, language: 'ru', files };
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function sourceDirectory(root) {
  const full = path.join(root, 'models/bundles/full/models');
  return fs.existsSync(path.join(full, definitions[0][1])) ? full : path.join(root, 'models');
}

module.exports = { definitions, pack, sha256, sourceDirectory };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  pack(sourceDirectory(root), path.join(root, 'modules/audio-engine/android/src/main/assets/models'))
    .then((m) => console.log(`All ${m.files.length} bundled model files verified.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
