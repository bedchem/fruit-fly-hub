/**
 * The coder fly's room is furnished with a few CC0 models from Poly Haven
 * (polyhaven.com). This downloads the 1k glTF of each at BUILD time and packs
 * it into a single .glb working copy in assets/models/; `npm run models` then
 * writes the compressed copy the site ships (public/models/). The page never
 * talks to Poly Haven.
 *
 *   node tools/fetch-polyhaven.mjs              # every asset below
 *   node tools/fetch-polyhaven.mjs --only wall_clock,Shelf_01
 *   node tools/fetch-polyhaven.mjs --out <dir>  # somewhere else, e.g. to compare sizes
 *
 * Node and material names are kept exactly as authored (CodeScene.jsx looks
 * some of them up), nothing is joined or deduplicated.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/** Poly Haven id -> the working copy's name. All CC0. */
export const ASSETS = {
  desk_lamp_arm_01: 'ph-desk-lamp.glb',
  potted_plant_02: 'ph-plant-tall.glb',
  potted_plant_04: 'ph-plant-small.glb',
  Shelf_01: 'ph-shelf.glb',
  book_encyclopedia_set_01: 'ph-books.glb',
  wall_clock: 'ph-wall-clock.glb',
};

const API = 'https://api.polyhaven.com/files/';
/** Poly Haven asks API users to say who they are. */
const HEADERS = { 'User-Agent': 'FlyLab-build/1.0 (github.com/bedchem/fruit-fly-slot-machine)' };

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const OUT = arg('out') ?? 'assets/models';
const only = arg('only')?.split(',');

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

for (const [id, file] of Object.entries(ASSETS)) {
  if (only && !only.includes(id)) continue;
  const files = JSON.parse((await get(API + id)).toString('utf8'));
  const gltf = files.gltf?.['1k']?.gltf;
  if (!gltf) { console.warn(`${id}: no 1k glTF`); continue; }
  // the .gltf, its .bin and its textures, at the relative paths it names them by
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ph-${id}-`));
  const main = path.join(dir, path.basename(new URL(gltf.url).pathname));
  fs.writeFileSync(main, await get(gltf.url));
  for (const [rel, f] of Object.entries(gltf.include ?? {})) {
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, await get(f.url));
  }
  const doc = await io.read(main);
  doc.getRoot().getAsset().extras = { source: `https://polyhaven.com/a/${id}`, license: 'CC0 1.0' };
  const out = path.join(OUT, file);
  await io.write(out, doc);
  fs.rmSync(dir, { recursive: true, force: true });
  const meshes = doc.getRoot().listMeshes().length;
  const textures = doc.getRoot().listTextures().length;
  console.log(`${id} -> ${out}: ${mb(fs.statSync(out).size)}, ${meshes} meshes, ${textures} textures`);
}
