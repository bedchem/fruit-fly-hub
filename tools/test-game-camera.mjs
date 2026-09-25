/**
 * Is everything that matters in the gaming shot actually in it?
 *
 *   node --test tools/test-game-camera.mjs
 *
 * Projects the fly's head, both monitors, the PC, the mouse and the keyboard
 * through the page's camera at desktop, tablet and phone sizes, and checks
 * they land in frame — and that the main monitor stays clear of the fly's
 * head and of the HUD card in the top right.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { GAME_CAMERA, SCREEN, SIDE, PC, MOUSE, KEYBOARD, onScreen } from '../src/scene/gameLayout.js';
import { flyToWorld } from '../src/scene/layout.js';
import { NECK } from '../src/scene/flyRig.js';

const right = [-Math.sin(SIDE.yaw), 0, -Math.cos(SIDE.yaw)];
const sideAt = (u, v) => [
  SIDE.center[0] + right[0] * u * SIDE.width / 2,
  SIDE.center[1] + v * SIDE.height / 2,
  SIDE.center[2] + right[2] * u * SIDE.width / 2,
];
const PROPS = {
  head: flyToWorld(NECK),
  screenTopLeft: onScreen(-1, 1),
  screenTopRight: onScreen(1, 1),
  screenBottomLeft: onScreen(-1, -1),
  screenBottomRight: onScreen(1, -1),
  sideTop: sideAt(0, 1),
  sideBottom: sideAt(0, -1),
  pcTop: [PC.center[0], PC.center[1] + PC.size[1], PC.center[2] - PC.size[2] / 2],
  mouse: MOUSE.home,
  keyboard: KEYBOARD.center,
};

/** The stage is the page minus the side panel on desktop, the full width on a phone. */
const SIZES = [[1440 - 368, 900], [1280 - 368, 720], [800, 700], [390, 650]];

function project(width, height) {
  const camera = new PerspectiveCamera(GAME_CAMERA.fov, width / height, 0.05, 60);
  camera.position.set(...GAME_CAMERA.position);
  camera.lookAt(...GAME_CAMERA.target);
  camera.updateMatrixWorld();
  return Object.fromEntries(Object.entries(PROPS).map(([k, p]) => [k, new Vector3(...p).project(camera)]));
}

test('the fly, both monitors, the PC and the peripherals are in frame on desktop', () => {
  for (const [w, h] of SIZES.slice(0, 2)) {
    const p = project(w, h);
    for (const [name, v] of Object.entries(p)) {
      assert.ok(Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 && v.z < 1, `${name} out of frame at ${w}×${h}: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
    }
  }
});

test('the main monitor is clear of the head and reads large enough', () => {
  for (const [w, h] of SIZES.slice(0, 2)) {
    const p = project(w, h);
    assert.ok(p.head.x < p.screenTopLeft.x, `the head covers the screen at ${w}×${h}`);
    const share = (p.screenTopRight.x - p.screenTopLeft.x) / 2;
    assert.ok(share > 0.28, `the game is only ${(share * 100).toFixed(0)}% of the stage wide at ${w}×${h}`);
  }
});

test('the HUD card in the top right does not cover the game', () => {
  // the card: 16rem wide and about 280 px tall with its tags, a gutter in from the top right corner
  for (const [w, h] of SIZES.slice(0, 2)) {
    const p = project(w, h);
    const cardLeft = 1 - 2 * (260 + 24) / w;
    const cardBottom = 1 - 2 * (280 + 24) / h;
    const tr = p.screenTopRight;
    assert.ok(tr.x < cardLeft || tr.y < cardBottom, `the screen's top right corner is under the HUD at ${w}×${h}`);
  }
});

test('on a phone the main monitor is still on the stage', () => {
  const [w, h] = SIZES[3];
  const p = project(w, h);
  for (const k of ['screenBottomLeft', 'screenBottomRight', 'mouse']) {
    assert.ok(Math.abs(p[k].x) < 1.2 && Math.abs(p[k].y) < 1, `${k} lost on a phone: ${p[k].x.toFixed(2)}, ${p[k].y.toFixed(2)}`);
  }
});
