/**
 * Is everything that matters in the coder's shot actually in it?
 *
 *   node --test tools/test-code-camera.mjs
 *
 * Projects the fly's head, the MacBook's screen, the external monitor, the
 * mug and the window through the page's camera — with the wider lens a
 * portrait canvas gets — and checks they land in frame, and that the
 * monitor stays clear of the HUD card in the top right.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { CODE_CAMERA, codeCameraFov, MONITOR, MUG, ROOM, MBP, macToWorld } from '../src/scene/codeLayout.js';
import { flyToWorld } from '../src/scene/layout.js';
import { NECK } from '../src/scene/flyRig.js';

const monitorAt = (u, v) => {
  const [x, y, z] = MONITOR.center;
  const c = Math.cos(MONITOR.yaw), s = Math.sin(MONITOR.yaw);
  return [x + s * u * MONITOR.width / 2, y + v * MONITOR.height / 2, z + c * u * MONITOR.width / 2];
};
const PROPS = {
  head: flyToWorld(NECK),
  laptopScreen: macToWorld([-MBP.depth / 2 - Math.sin(MBP.lidTilt) * 0.1, MBP.base + Math.cos(MBP.lidTilt) * 0.1, 0]),
  monitorLeft: monitorAt(1, 1),
  monitorRight: monitorAt(-1, 1),
  monitorBottom: monitorAt(0, -1),
  mug: [MUG.base[0], MUG.base[1] + MUG.height, MUG.base[2]],
  window: [ROOM.back, (ROOM.window.y0 + ROOM.window.y1) / 2, (ROOM.window.z0 + ROOM.window.z1) / 2],
};

/** The stage: the page minus the side panel on desktop; the full width on a tablet or phone. */
const SIZES = [[1440 - 368, 900], [1280 - 368, 720], [800, 700], [390, 650]];

function project(width, height) {
  const camera = new PerspectiveCamera(codeCameraFov(width, height), width / height, 0.03, 40);
  camera.position.set(...CODE_CAMERA.position);
  camera.lookAt(...CODE_CAMERA.target);
  camera.updateMatrixWorld();
  return Object.fromEntries(Object.entries(PROPS).map(([k, p]) => [k, new Vector3(...p).project(camera)]));
}

test('the fly, the laptop, the monitor, the mug and the window are in frame', () => {
  for (const [w, h] of SIZES.slice(0, 3)) {
    const p = project(w, h);
    for (const [name, v] of Object.entries(p)) {
      assert.ok(Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 && v.z < 1, `${name} out of frame at ${w}×${h}: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
    }
  }
});

test('the head does not cover the screens', () => {
  for (const [w, h] of SIZES.slice(0, 2)) {
    const p = project(w, h);
    assert.ok(p.head.x < p.laptopScreen.x && p.head.x < p.monitorLeft.x, `the head is over a screen at ${w}×${h}`);
  }
});

test('the HUD card in the top right does not cover the monitor', () => {
  for (const [w, h] of SIZES.slice(0, 2)) {
    const p = project(w, h);
    const cardLeft = 1 - 2 * (260 + 24) / w;
    const cardBottom = 1 - 2 * (320 + 24) / h;
    const tr = p.monitorRight;
    assert.ok(tr.x < cardLeft || tr.y < cardBottom, `the monitor's top right corner is under the HUD at ${w}×${h}`);
  }
});

test('on a phone the laptop and the mug stay on the stage', () => {
  const [w, h] = SIZES[3];
  const p = project(w, h);
  for (const k of ['laptopScreen', 'mug']) {
    assert.ok(Math.abs(p[k].x) < 1 && Math.abs(p[k].y) < 1, `${k} lost on a phone: ${p[k].x.toFixed(2)}, ${p[k].y.toFixed(2)}`);
  }
});
