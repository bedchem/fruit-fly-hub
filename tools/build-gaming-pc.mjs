/**
 * Prepare Yolala3D's Custom Gaming PC for the gaming scene.
 * node tools/build-gaming-pc.mjs /path/to/custom_gaming_pc.glb
 * npm run models
 *
 * Only this static prop is flattened/joined; the other models' named rigs
 * are untouched. Keep an uncompressed working copy for the existing tools.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, prune, simplify, simplifyPrimitive, textureCompress, weld, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { BufferGeometry, BufferAttribute } from 'three';

const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/build-gaming-pc.mjs /path/to/custom_gaming_pc.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(source);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const triangles = () => root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0), 0);
const before = triangles();

// The presentation plinth isn't part of the PC. The two layered top grilles
// are subpixel detail at this scale (722,840 triangles); bake their pattern.
for (const node of root.listNodes()) {
  if (node.getName() === 'Object_59') node.dispose();
}
for (const mesh of root.listMeshes()) {
  for (const p of mesh.listPrimitives()) {
    if (['Material.039', 'Material.041'].includes(p.getMaterial()?.getName())) p.dispose();
  }
}
await doc.transform(prune());

// Dense bevels on the tiny motherboard components have split normals that
// defeat simplification. Weld their positions and rebuild smooth normals.
await MeshoptSimplifier.ready;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  if (!['Material.010', 'Material.011'].includes(p.getMaterial()?.getName())) continue;
  for (const semantic of p.listSemantics()) if (semantic !== 'POSITION') p.setAttribute(semantic, null);
  const positions = p.getAttribute('POSITION').getArray();
  for (let i = 0; i < positions.length; i++) positions[i] = Math.round(positions[i] * 1e5) / 1e5;
  weldPrimitive(p);
  simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.06, error: 0.01 });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p.getAttribute('POSITION').getArray(), 3));
  geometry.setIndex(new BufferAttribute(p.getIndices().getArray(), 1));
  geometry.computeVertexNormals();
  p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(geometry.getAttribute('normal').array).setBuffer(root.listBuffers()[0]));
  geometry.dispose();
}

const ventSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="512"><defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#22242a"/><circle cx="6" cy="6" r="3" fill="#07080b"/></pattern></defs><rect width="256" height="512" fill="url(#p)"/></svg>';
const ventTexture = doc.createTexture('Baked top vent').setImage(await sharp(Buffer.from(ventSvg)).png().toBuffer()).setMimeType('image/png');
const ventMaterial = doc.createMaterial('Top vent').setBaseColorTexture(ventTexture).setMetallicFactor(0.3).setRoughnessFactor(0.65);
const buffer = root.listBuffers()[0];
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const vent = doc.createPrimitive().setMaterial(ventMaterial)
  .setAttribute('POSITION', accessor('VEC3', new Float32Array([7.565,2.04,-1.13, 7.565,2.04,1.878, 9.24,2.04,1.878, 9.24,2.04,-1.13])))
  .setAttribute('NORMAL', accessor('VEC3', new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0])))
  .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array([0,0, 0,1, 1,1, 1,0])))
  .setIndices(accessor('SCALAR', new Uint16Array([0,1,2, 0,2,3])));
scene.addChild(doc.createNode('Top vent').setMesh(doc.createMesh('Top vent').addPrimitive(vent)));

// Remove costly clearcoat/specular shaders on this small prop. Keep texture
// and emissive identities; consolidate only plain dark interior materials.
const palette = new Map();
for (const material of root.listMaterials()) {
  const name = material.getName();
  for (const ext of material.listExtensions()) {
    if (ext.extensionName !== 'KHR_materials_emissive_strength') material.setExtension(ext.extensionName, null);
  }
  if (name === 'Material.003') {
    material.setName('Case glass').setBaseColorFactor([0.055, 0.065, 0.09, 0.13])
      .setMetallicFactor(0.25).setRoughnessFactor(0.18).setDoubleSided(false);
  } else if (material.getAlphaMode() === 'BLEND' && material.getBaseColorTexture()) {
    // Logo decals need cutouts, not another translucent render pass.
    material.setAlphaMode('MASK').setAlphaCutoff(0.35);
  }
  if (material.getBaseColorTexture() || material.getMetallicRoughnessTexture() || material.getNormalTexture() || material.getOcclusionTexture()
    || material.getAlphaMode() !== 'OPAQUE' || material.getEmissiveFactor().some(v => v > 0)) continue;
  const c = material.getBaseColorFactor();
  if (Math.max(...c.slice(0, 3)) > 0.15) continue;
  const shade = Math.max(...c.slice(0, 3)) < 0.05 ? 0.018 : 0.085;
  const metal = material.getMetallicFactor() > 0.4 ? 0.65 : 0.1;
  const key = `${shade}/${metal}`;
  let shared = palette.get(key);
  if (!shared) {
    shared = doc.createMaterial(`Interior ${key}`).setBaseColorFactor([shade, shade, shade * 1.1, 1])
      .setMetallicFactor(metal).setRoughnessFactor(metal > 0.4 ? 0.34 : 0.55).setDoubleSided(true);
    palette.set(key, shared);
  }
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() === material) p.setMaterial(shared);
}

await doc.transform(
  dedup(), flatten(), join(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.001 }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [512, 512] }),
);

// Y-up, one metre tall, feet on Y=0. Front +Z and glass -X in the source;
// turn 180 degrees so the camera sees the glass (+X) and the front (-Z).
const { min, max } = getBounds(scene);
const k = 1 / (max[1] - min[1]);
const pc = doc.createNode('Custom Gaming PC').setRotation([0, 1, 0, 0]).setScale([k, k, k])
  .setTranslation([(min[0] + max[0]) * k / 2, -min[1] * k, (min[2] + max[2]) * k / 2]);
for (const node of scene.listChildren()) pc.addChild(node);
scene.addChild(pc);
root.getAsset().extras = {
  ...root.getAsset().extras,
  author: 'Yolala3D | Y3D (https://sketchfab.com/Yolala3d)',
  modifications: 'Presentation plinth removed; top grille baked; geometry simplified and batched; materials and glass cleaned; textures resized; normalized and reoriented. Browser copy uses Draco and WebP.',
};
const out = 'assets/models/custom-gaming-pc.glb';
await io.write(out, doc);
console.log(`${out}: ${before.toLocaleString()} → ${triangles().toLocaleString()} triangles, ${root.listMaterials().length} materials, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
console.log('Bounds:', getBounds(scene));
