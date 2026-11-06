import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const models = fileURLToPath(new URL('../models/', import.meta.url));
const onlyDiarization = process.argv.includes('--diarization-only');
const downloads = join(models, 'downloads');
const bundle = join(models, 'bundles', onlyDiarization ? 'diarization' : 'full', 'models');
const releases = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';
const pyannote = 'sherpa-onnx-pyannote-segmentation-3-0';
const gigaam = 'sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19';
const embedding = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx';
const qwen = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
const testWav = '1-two-speakers-en.wav';

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function run(command, args, stdio = 'inherit') {
  const result = spawnSync(command, args, { stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function download(url, checksum) {
  const path = join(downloads, url.split('/').at(-1));
  if (existsSync(path) && await sha256(path) === checksum) return path;
  const partial = `${path}.part`;
  run('curl', ['--fail', '--location', '--retry', '2', '--output', partial, url]);
  if (await sha256(partial) !== checksum) throw new Error(`SHA-256 mismatch: ${path}`);
  renameSync(partial, path);
  return path;
}

function extract(archive, entry, target) {
  const descriptor = openSync(target, 'w');
  try {
    run('tar', ['-xOf', archive, entry], ['ignore', descriptor, 'inherit']);
  } finally {
    closeSync(descriptor);
  }
}

const manifest = {};
async function addModel(key, name, source, entry) {
  const target = join(bundle, name);
  const partial = `${target}.part`;
  if (entry) extract(source, entry, partial);
  else await copyFile(source, partial);
  const checksum = await sha256(partial);
  renameSync(partial, target);
  manifest[key] = { file: name, sha256: checksum };
}

mkdirSync(downloads, { recursive: true });
mkdirSync(bundle, { recursive: true });
await download(`${releases}/v2.0.1/sherpa-onnx-2.0.1.aar`, 'a8d09d1d32f3eb8520482c6d3d43fae674681c5b050385967c70a3c2c9bf0ee7');
const segmentation = await download(`${releases}/speaker-segmentation-models/${pyannote}.tar.bz2`, '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488');
await addModel('segmentation', 'pyannote-segmentation.int8.onnx', segmentation, `${pyannote}/model.int8.onnx`);
extract(segmentation, `${pyannote}/LICENSE`, join(bundle, 'LICENSE.pyannote'));
const speakerModel = await download(`${releases}/speaker-recongition-models/${embedding}`, '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b');
await addModel('embedding', embedding, speakerModel);
await download(`${releases}/speaker-segmentation-models/${testWav}`, 'f1c877dc01595e28be7147bf2fe38e5268147a868bf3fdb5c37b97f5940e21f3');

if (!onlyDiarization) {
  const asr = await download(`${releases}/asr-models/${gigaam}.tar.bz2`, '777be8717d8aaf04861823671290f7687f7579fd9ac63a2124955573f920caf5');
  await addModel('asrModel', 'gigaam-v2-ctc.int8.onnx', asr, `${gigaam}/model.int8.onnx`);
  await addModel('asrTokens', 'gigaam-tokens.txt', asr, `${gigaam}/tokens.txt`);
  extract(asr, `${gigaam}/LICENSE`, join(bundle, 'LICENSE.gigaam'));
  const llm = await download(`https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/${qwen}`, '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db');
  await addModel('llm', qwen, llm);
}

const manifestFile = join(bundle, 'manifest.json');
writeFileSync(`${manifestFile}.part`, JSON.stringify(manifest, null, 2) + '\n');
renameSync(`${manifestFile}.part`, manifestFile);
console.log(`Model bundle: ${dirname(bundle)}`);
console.log(`Test WAV: ${join(downloads, testWav)}`);
