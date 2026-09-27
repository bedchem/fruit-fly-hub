/**
 * Compresses the working models in assets/models/ into what the site ships,
 * public/models/. Run with `npm run models` (build-all runs it too).
 *
 * The working copies stay plain glTF so the measuring and fitting tools can
 * read their vertices directly. The shipped copies are Draco geometry and
 * WebP textures, a fraction of the size. Draco rather than meshopt: Draco
 * decodes back to float positions in the model's own space, which the fly's
 * leg and head rig (Fly.jsx) is baked from; meshopt's quantization would
 * move the mesh into a normalised space behind a node transform.
 *
 * Node and material names are left alone: SlotMachine.jsx finds its lever and
 * stool by name, OldBar.jsx its opaque and cut-out materials.
 *
 * The Draco decoder is copied to public/draco/ so the page never fetches it
 * from a third-party CDN (see the privacy notice).
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import draco3d from 'draco3d';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, textureCompress, prune, resample } from '@gltf-transform/functions';

const SRC = 'assets/models';
const OUT = 'public/models';
/** Longest texture edge per model: the bar is a backdrop seen from one seat. */
const TEXTURE_SIZE = {
  // the gamer's can: small on screen, close to the camera only in a sip
  'monster-ultra-white.glb': 512,
  'old-bar.glb': 1024, 'slot-machine.glb': 2048,
  // the coder's room (tools/fetch-polyhaven.mjs): props near the camera at 1024, the shelf and the clock at 512
  'ph-desk-lamp.glb': 1024, 'ph-plant-tall.glb': 1024, 'ph-plant-small.glb': 1024,
  'ph-shelf.glb': 512, 'ph-books.glb': 512, 'ph-wall-clock.glb': 512,
};

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

fs.mkdirSync(OUT, { recursive: true });
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(SRC, file));
  const size = TEXTURE_SIZE[file] ?? 2048;
  await doc.transform(
    resample(),
    prune({ keepLeaves: true, keepAttributes: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [size, size] }),
    draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  const out = path.join(OUT, file);
  await io.write(out, doc);
  console.log(`${file}: ${mb(fs.statSync(path.join(SRC, file)).size)} -> ${mb(fs.statSync(out).size)}`);
}

// the decoder three's DRACOLoader asks for, served from this site
const DRACO = 'node_modules/three/examples/jsm/libs/draco/gltf';
fs.mkdirSync('public/draco', { recursive: true });
for (const f of ['draco_decoder.wasm', 'draco_wasm_wrapper.js']) fs.copyFileSync(path.join(DRACO, f), path.join('public/draco', f));
console.log('draco decoder copied to public/draco/');
