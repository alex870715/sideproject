import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { get } from 'node:https';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const ext = join(root, 'extension-boss-defense');

async function fetchFile(url, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        get(res.headers.location, (res2) =>
          pipeline(res2, createWriteStream(dest)).then(resolve).catch(reject)
        ).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> ${res.statusCode}`));
        return;
      }
      pipeline(res, createWriteStream(dest)).then(resolve).catch(reject);
    }).on('error', reject);
  });
}

await mkdir(join(ext, 'vendor', 'mediapipe-wasm'), { recursive: true });
await mkdir(join(ext, 'models'), { recursive: true });

await cp(join(nm, 'vision_bundle.mjs'), join(ext, 'vendor', 'vision_bundle.mjs'));
await cp(join(nm, 'wasm'), join(ext, 'vendor', 'mediapipe-wasm'), { recursive: true });

const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const modelPath = join(ext, 'models', 'blaze_face_short_range.tflite');
await fetchFile(modelUrl, modelPath);

await writeFile(
  join(ext, '.vendored'),
  `${Date.now()}\n`,
  'utf8'
);

console.log('extension-boss-defense vendor + model synced');
