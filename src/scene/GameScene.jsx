/**
 * The gaming setup: the same fly, in a gaming chair, at a desk in a dark room
 * lit by its own screens and a PC full of RGB.
 *
 * The curved monitor in front of it and the vertical one on its left are
 * canvas textures painted by gamePainters.js; the curved one is also the key
 * light on the fly, in the colours of whatever game is on. The right foreleg
 * is on the mouse — the mouse follows the aim — and leaves it for whatever
 * the gestures (src/game/gamerGestures.js) send it to: the energy drink, the
 * headset, its own eye, the desk. The headset rides in the fly's head slot,
 * so it turns with the head.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { StudioProbe } from './studio.jsx';
import { flyToWorld } from './layout.js';
import { HAND, NECK } from './flyRig.js';
import { MOUTH_LOCAL } from './barLayout.js';
import {
  DESK, SCREEN, SIDE, MAT, KEYBOARD, MOUSE, CAN, CAN_LOGO_AZIMUTH, PC, CHAIR, WALL_X, HEADSET, HEAD_POINTS, HUD_GLANCE,
  SIDE_GAZE, DESK_GAZE, DOWN_GAZE, UP_GAZE, GAME_CAMERA, gameCameraFov, onScreen,
} from './gameLayout.js';
import {
  canPose, keyboardPose, resolveAnchors, handTarget, mouseAnchor, posedToWorld, CRUSHED_HEIGHT,
} from './gameGestures.js';
import { N_ANCHORS } from '../game/gamerGestures.js';
import { drawGame, drawSide, drawFly, MAIN_W, MAIN_H, SIDE_W, SIDE_H } from './gamePainters.js';
import { PHASES, HALF_FOV } from '../game/gamer.js';
import { GAMES } from '../game/games.js';
import { sound } from '../audio/audio.js';

if (import.meta.env.DEV) window.__advance = advance;

const REST_HAND_WORLD = flyToWorld(HAND);
const BG = new THREE.Color('#0e0c16');
const RAGE = new THREE.Color('#ff2a1a');
const DESKTOP = new THREE.Color('#8a5cff');

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const UP = new THREE.Vector3(0, 1, 0);

/** The colour the RGB is showing at a point along the loop, 0..1, at time t. */
function rgbAt(u, t, g, out) {
  if (g.slamImpact > 0.02 || g.phase === PHASES.RAGE_QUIT) {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 9));
    return out.copy(RAGE).multiplyScalar(pulse + g.slamImpact);
  }
  if (g.phase === PHASES.RESULT && g.result?.won) return out.setHSL(0.12 + Math.sin(t * 3 + u * 6) * 0.03, 0.9, 0.55);
  return out.setHSL((u + t * 0.07) % 1, 0.85, 0.55);
}

// ------------------------------------------------------------------ the rig

/**
 * Where the head is aimed. The eyes jump (saccades) and settle rather than
 * slide: a stiff, slightly under-damped spring on the point it looks at, so
 * a new target is reached in a tenth of a second with a small overshoot, and
 * a moving one (the enemy) is followed a hair behind.
 */
const GAZE_W = 24;
const GAZE_ZETA = 0.66;

function gazePoint(g, s, out) {
  const at = g.gestures.gaze.at;
  let p;
  switch (at) {
    case 'enemy': {
      const e = g.enemy;
      p = e ? onScreen(clamp(e.err / HALF_FOV, -0.95, 0.95), -0.05 + clamp(e.elev ?? 0, -0.1, 0.1)) : onScreen(0, -0.08);
      break;
    }
    case 'hud': { const [u, v] = HUD_GLANCE[g.match?.game ?? g.game] ?? [0.8, -0.7]; p = onScreen(u, v); break; }
    case 'chat': p = SIDE_GAZE; break;
    case 'can': p = s.can.top; break;
    case 'desk': p = DESK_GAZE; break;
    case 'down': p = DOWN_GAZE; break;
    case 'up': p = UP_GAZE; break;
    case 'mouse': p = s.mouse; break;
    case 'kb': p = s.kb.center; break;
    default: p = onScreen(g.gestures.gaze.u, g.gestures.gaze.v); break;
  }
  out.set(p[0], p[1], p[2]);
  return out;
}

function Rig({ gamer, gripTargetRef, dopamineRef, lookRef, canRef, kbRef, headPoints, onTick }) {
  const { camera } = useThree();
  const base = useMemo(() => new THREE.Vector3(...GAME_CAMERA.position), []);
  const look = useMemo(() => new THREE.Vector3(...GAME_CAMERA.target), []);
  const uiClock = useRef(0);
  const shake = useRef(0);
  const lastPhase = useRef(gamer.phase);
  // everything the foreleg can be sent to, resolved every frame into one flat array
  const s = useMemo(() => {
    const st = {
      anchors: new Float64Array(N_ANCHORS * 3),
      target: [0, 0, 0],
      mouse: [0, 0, 0],
      can: canRef.current,
      kb: kbRef.current,
      src: { mouse: null, can: null, cup: headPoints.world[0], eye: headPoints.world[1], face: headPoints.world[2], kb: null, body: null },
      gaze: { p: new THREE.Vector3(), v: new THREE.Vector3(), want: new THREE.Vector3(), ready: false },
      neck: [0, 0, 0],
      d: new THREE.Vector3(),
      side: new THREE.Vector3(),
      lift: new THREE.Vector3(),
      out: [0, 0, 0],
      t: 0,
    };
    st.src.mouse = st.mouse;
    st.src.can = st.can.grip;
    st.src.kb = st.kb.corner;
    return st;
  }, [canRef, kbRef, headPoints]);

  // the foreleg's target: the gesture's weighted anchors, plus the shake of a held stretch
  const aim = useMemo(() => () => {
    const g = gamer;
    resolveAnchors(s.src, s.anchors);
    handTarget(g.gestures.hand, s.anchors, s.target);
    const tr = g.gestures.ch.tremble;
    if (tr > 0) {
      s.target[0] += Math.sin(s.t * 47) * 0.004 * tr;
      s.target[1] += Math.sin(s.t * 39 + 1) * 0.005 * tr;
      s.target[2] += Math.sin(s.t * 53 + 2) * 0.003 * tr;
    }
  }, [gamer, s]);
  // Fly calls this once it has turned the head, so the cup, the eye and the face are this frame's
  useEffect(() => { headPoints.after = aim; return () => { headPoints.after = null; }; }, [headPoints, aim]);

  useFrame((state, dt) => {
    const g = gamer;
    g.update(dt);
    const G = g.gestures;
    const t = state.clock.elapsedTime;
    s.t = t;

    // --- where everything the foreleg reaches for is this frame ------------------
    mouseAnchor(g.hand, Math.max(g.pressDepth, G.press), s.mouse);
    canPose({ lift: G.ch.canLift, tilt: G.ch.canTilt, shake: G.ch.canShake, crush: Math.max(G.can.crushed, G.ch.crush), t: G.clock }, s.can);
    keyboardPose(G.kb, s.kb);
    s.src.body = g.body;
    aim();
    gripTargetRef.current = g.grip > 0.01 ? s.target : REST_HAND_WORLD;
    if (import.meta.env.DEV && window.__gameHand) gripTargetRef.current = window.__gameHand;
    dopamineRef.current = g.dopamine;

    // --- the eyes: a spring on the point it looks at -------------------------------
    const z = s.gaze;
    gazePoint(g, s, z.want);
    if (!z.ready) { z.p.copy(z.want); z.ready = true; }
    const h = Math.min(dt, 1 / 30);
    s.d.subVectors(z.want, z.p);
    z.v.addScaledVector(s.d, GAZE_W * GAZE_W * h).addScaledVector(z.v, -2 * GAZE_ZETA * GAZE_W * h);
    z.p.addScaledVector(z.v, h);
    // the head's own moves on top — a shake, a nod — as turns about the neck
    posedToWorld(NECK, g.body, s.neck);
    s.d.set(z.p.x - s.neck[0], z.p.y - s.neck[1], z.p.z - s.neck[2]);
    const dist = s.d.length();
    s.side.crossVectors(s.d, UP).normalize();
    s.lift.crossVectors(s.side, s.d).normalize();
    const yaw = Math.tan(G.headYaw) * dist;
    const pitch = -Math.tan(G.headPitch) * dist;
    s.out[0] = z.p.x + s.side.x * yaw + s.lift.x * pitch;
    s.out[1] = z.p.y + s.side.y * yaw + s.lift.y * pitch;
    s.out[2] = z.p.z + s.side.z * yaw + s.lift.z * pitch;
    lookRef.current = s.out;

    sound.setArousal(g.arousal, g.collapse);

    // --- the camera jolts on a slam, a flinch, an explosion, a knock on the desk --------
    if (g.phase !== lastPhase.current && g.phase === PHASES.RAGE_QUIT) shake.current = 1;
    lastPhase.current = g.phase;
    shake.current = Math.max(0, shake.current - dt * 2.2, g.slamImpact * 0.9, g.startle * 0.25, G.thud * 0.22);
    const k = shake.current;
    camera.position.set(
      base.x + Math.sin(t * 0.21) * 0.04 + Math.sin(t * 31.7) * k * 0.035,
      base.y + Math.sin(t * 0.17) * 0.025 + Math.sin(t * 27.3) * k * 0.03,
      base.z + Math.cos(t * 0.19) * 0.04 + Math.cos(t * 24.1) * k * 0.035,
    );
    camera.lookAt(look);
    // dev only: a fixed viewpoint for visual checks (tools/game-visual-fixture.js)
    if (import.meta.env.DEV && window.__gameCam) {
      camera.position.set(...window.__gameCam.position);
      camera.lookAt(...window.__gameCam.target);
    }

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

/** The screens are the light, and the RGB. */
function Lights({ gamer, dopamineRef }) {
  const glow = useRef();
  const side = useRef();
  const pc = useRef();
  const strip = useRef();
  const key = useRef();
  const color = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const g = gamer;
    const t = state.clock.elapsedTime;
    const game = GAMES[g.match?.game ?? g.game];
    if (g.phase === PHASES.RAGE_QUIT || g.phase === PHASES.SWITCHING) color.copy(DESKTOP);
    else color.set(game.glow);
    if (g.dead) color.lerp(tmp.set('#aa3322'), 0.5);
    if (g.flash > 0.05) color.lerp(tmp.set('#ffffff'), g.flash);
    if (glow.current) {
      glow.current.color.copy(color);
      glow.current.intensity = 5.5 + g.flash * 10 + (g.firing ? Math.random() * 1.5 : 0);
    }
    if (side.current) side.current.intensity = 1.6;
    rgbAt(0.2, t, g, tmp);
    if (pc.current) { pc.current.color.copy(tmp); pc.current.intensity = 0.8 + g.slamImpact * 1.5; }
    rgbAt(0.6, t, g, tmp);
    if (strip.current) { strip.current.color.copy(tmp); strip.current.intensity = 2.2 + g.slamImpact * 3; }
    if (key.current) key.current.intensity = 0.55 + (dopamineRef.current ?? 0) * 0.3;
  });
  return (
    <>
      <ambientLight intensity={0.18} color="#8a86b8" />
      <hemisphereLight args={['#6a6aa8', '#120c10', 0.3]} />
      <directionalLight
        ref={key}
        position={[3.5, 5.5, -2.5]}
        intensity={0.55}
        color="#c9c4ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-far={16}
        shadow-bias={-0.0006}
      />
      {/* the main monitor, lighting the fly's face */}
      <pointLight ref={glow} position={[SCREEN.center[0] + 0.35, SCREEN.center[1], SCREEN.center[2]]} distance={3.2} decay={2} intensity={5} />
      <pointLight ref={side} position={[SIDE.center[0] + 0.25, SIDE.center[1], SIDE.center[2] - 0.1]} distance={1.6} decay={2} color="#6a74ff" intensity={1.6} />
      {/* the PC, from inside its glass */}
      <pointLight ref={pc} position={[PC.center[0] + 0.05, PC.center[1] + PC.size[1] * 0.55, PC.center[2] - PC.size[2] * 0.15]} distance={2.2} decay={2} intensity={0.8} />
      {/* the strip behind the desk, washing the wall */}
      <pointLight ref={strip} position={[WALL_X + 0.15, DESK.top + 0.1, -0.1]} distance={2.4} decay={2} intensity={2.2} />
    </>
  );
}

// ------------------------------------------------------------ the monitors

/** A plane bent round a vertical axis: the edges come towards the viewer (+Z). */
function useBentPlane(width, height, radius) {
  return useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, height, 48, 1);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i) / radius;
      pos.setXYZ(i, radius * Math.sin(a), pos.getY(i), radius * (1 - Math.cos(a)));
    }
    geo.computeVertexNormals();
    return geo;
  }, [width, height, radius]);
}

function useCanvasTexture(w, h) {
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, [w, h]);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  return [canvas, texture];
}

function MainMonitor({ gamer }) {
  const [canvas, texture] = useCanvasTexture(MAIN_W, MAIN_H);
  useEffect(() => {
    gamer.monitorCanvas = canvas;
    return () => { if (gamer.monitorCanvas === canvas) gamer.monitorCanvas = null; };
  }, [gamer, canvas]);
  const screen = useBentPlane(SCREEN.width, SCREEN.height, SCREEN.radius);
  const shell = useBentPlane(SCREEN.width + 0.026, SCREEN.height + 0.026, SCREEN.radius);
  const group = useRef();
  const clock = useRef(0);
  useFrame((state, dt) => {
    clock.current += dt;
    if (clock.current >= 1 / 24) {
      clock.current = 0;
      drawGame(canvas.getContext('2d'), gamer, state.clock.elapsedTime);
      texture.needsUpdate = true;
    }
    // the desk takes the slam, and the monitor wobbles on its stand
    if (group.current) group.current.rotation.z = Math.sin(state.clock.elapsedTime * 38) * gamer.slamImpact * 0.012;
  });
  const [x, y, z] = SCREEN.center;
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2, 0]}>
      <group ref={group}>
        <group rotation={[SCREEN.tilt, 0, 0]}>
          <mesh geometry={shell} position={[0, 0, -0.012]} castShadow>
            <meshStandardMaterial color="#0b0b0e" roughness={0.45} metalness={0.3} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={screen} position={[0, 0, 0.001]}>
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
          {/* a thin chin with a tiny status LED */}
          <mesh position={[0, -SCREEN.height / 2 - 0.018, 0.002]}>
            <boxGeometry args={[0.22, 0.012, 0.012]} />
            <meshStandardMaterial color="#141418" roughness={0.4} />
          </mesh>
        </group>
      </group>
      {/* the stand: a neck and a wide foot */}
      <mesh position={[0, -SCREEN.height / 2 - 0.05, -0.07]} castShadow>
        <boxGeometry args={[0.07, SCREEN.center[1] - DESK.top - SCREEN.height / 2 + 0.04, 0.03]} />
        <meshStandardMaterial color="#1a1a20" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, DESK.top - SCREEN.center[1] + 0.006, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.012, 0.2]} />
        <meshStandardMaterial color="#1a1a20" roughness={0.35} metalness={0.6} />
      </mesh>
    </group>
  );
}

function SideMonitor({ gamer }) {
  const [canvas, texture] = useCanvasTexture(SIDE_W, SIDE_H);
  const clock = useRef(0.07);
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 1 / 8) return;
    clock.current = 0;
    drawSide(canvas.getContext('2d'), gamer);
    texture.needsUpdate = true;
  });
  const [x, y, z] = SIDE.center;
  const armLen = x - DESK.back + 0.02;
  return (
    <group>
      <group position={[x, y, z]} rotation={[0, Math.PI / 2 + SIDE.yaw, 0]}>
        <group rotation={[SIDE.tilt, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[SIDE.width + 0.022, SIDE.height + 0.022, 0.02]} />
            <meshStandardMaterial color="#0b0b0e" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.0105]}>
            <planeGeometry args={[SIDE.width, SIDE.height]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* a monitor arm, clamped to the back of the desk */}
      <mesh position={[DESK.back + 0.03, (DESK.top + y) / 2, z]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, y - DESK.top, 12]} />
        <meshStandardMaterial color="#202026" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[(DESK.back + 0.03 + x) / 2 - 0.02, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, armLen, 12]} />
        <meshStandardMaterial color="#202026" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}

// --------------------------------------------------------------- the desk

function Desk({ gamer }) {
  const { top, thickness, front, back, zMin, zMax } = DESK;
  const len = zMax - zMin;
  const zMid = (zMin + zMax) / 2;
  const depth = front - back;
  const edge = useRef();
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    if (edge.current) edge.current.color.copy(rgbAt(0.4, state.clock.elapsedTime, gamer, c));
  });
  return (
    <group>
      <mesh position={[(front + back) / 2, top - thickness / 2, zMid]} castShadow receiveShadow>
        <boxGeometry args={[depth, thickness, len]} />
        <meshStandardMaterial color="#17161c" roughness={0.55} metalness={0.15} />
      </mesh>
      {/* an RGB strip along the front edge, under the lip */}
      <mesh position={[front + 0.001, top - thickness - 0.004, zMid]}>
        <boxGeometry args={[0.006, 0.008, len - 0.04]} />
        <meshBasicMaterial ref={edge} toneMapped={false} />
      </mesh>
      {[zMin + 0.1, zMax - 0.1].map((z) => (
        <mesh key={z} position={[(front + back) / 2, (top - thickness) / 2, z]} castShadow>
          <boxGeometry args={[depth - 0.1, top - thickness, 0.05]} />
          <meshStandardMaterial color="#111016" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The desk mat: dark cloth with a glowing RGB rim. */
function Mat({ gamer }) {
  const rim = useRef();
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state) => { if (rim.current) rim.current.color.copy(rgbAt(0.8, state.clock.elapsedTime, gamer, c)); });
  const [x, y, z] = MAT.center;
  return (
    <group position={[x, y, z]}>
      <mesh receiveShadow position={[0, 0.001, 0]}>
        <boxGeometry args={[MAT.size[0], 0.003, MAT.size[1]]} />
        <meshStandardMaterial color="#121218" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[MAT.size[0] + 0.008, 0.002, MAT.size[1] + 0.008]} />
        <meshBasicMaterial ref={rim} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A tenkeyless board: the keys painted with a moving RGB wave; it jumps when the desk is hit. */
function Keyboard({ gamer, kbRef }) {
  const [canvas, texture] = useCanvasTexture(512, 160);
  const group = useRef();
  const clock = useRef(0);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    clock.current += dt;
    if (group.current) {
      // where a shove has sent it (gameGestures.js), jumping when the desk is hit
      const kbp = kbRef.current;
      const k = Math.max(gamer.slamImpact, gamer.gestures.thud * 0.35);
      group.current.position.set(kbp.center[0], KEYBOARD.center[1] + Math.abs(Math.sin(t * 30)) * k * 0.025, kbp.center[2]);
      group.current.rotation.set(Math.sin(t * 23) * k * 0.05, kbp.yaw, 0);
    }
    if (clock.current < 1 / 12) return;
    clock.current = 0;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#08080b'; ctx.fillRect(0, 0, 512, 160);
    const rage = gamer.slamImpact > 0.02 || gamer.phase === PHASES.RAGE_QUIT;
    const rows = [15, 15, 14, 13, 12, 8];
    rows.forEach((n, r) => {
      for (let k = 0; k < n; k++) {
        const x = 6 + k * (512 - 12) / n, y = 6 + r * 25;
        const hue = rage ? 0 : ((k / 15 + r * 0.03 - t * 0.12) % 1 + 1) % 1;
        // WASD glow brighter
        const wasd = (r === 2 && (k === 1)) || (r === 3 && k >= 1 && k <= 3);
        ctx.fillStyle = `hsl(${hue * 360}, 90%, ${wasd ? 62 : rage ? 45 + Math.random() * 15 : 48}%)`;
        ctx.fillRect(x, y, (512 - 12) / n - 5, 20);
        ctx.fillStyle = 'rgba(8,8,11,0.55)';
        ctx.fillRect(x + 3, y + 3, (512 - 12) / n - 11, 14);
      }
    });
    texture.needsUpdate = true;
  });
  const [x, y, z] = KEYBOARD.center;
  const [sx, sy, sz] = KEYBOARD.size;
  return (
    <group ref={group} position={[x, y, z]}>
      <mesh position={[0, sy / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color="#141419" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, sy + 0.0005, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <planeGeometry args={[sz * 0.96, sx * 0.9]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The mouse, following the aim under the foreleg. */
function Mouse({ gamer }) {
  const ref = useRef();
  const glow = useRef();
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    if (ref.current) {
      const h = gamer.hand;
      // picked up and put back nearer the middle, tipped on its way; turned with the sweep
      ref.current.position.set(MOUSE.home[0] + h.dx, MOUSE.home[1] + (h.lift ?? 0), MOUSE.home[2] + h.dz);
      ref.current.rotation.set(0, h.yaw ?? h.dz * 1.5, h.tilt ?? 0);
    }
    if (glow.current) glow.current.color.copy(rgbAt(0.1, state.clock.elapsedTime, gamer, c));
  });
  const [sx, sy, sz] = MOUSE.size;
  return (
    <group ref={ref}>
      <RoundedBox args={[sx, sy, sz]} radius={0.018} smoothness={4} position={[0, sy / 2, 0]} castShadow>
        <meshStandardMaterial color="#16161c" roughness={0.35} metalness={0.2} />
      </RoundedBox>
      <mesh position={[sx * 0.18, sy + 0.001, 0]}>
        <boxGeometry args={[0.024, 0.004, 0.006]} />
        <meshBasicMaterial ref={glow} toneMapped={false} />
      </mesh>
      {/* the cable, back to the PC */}
      <mesh position={[-sx / 2 - 0.08, 0.004, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0025, 0.0025, 0.16, 6]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

/**
 * The energy drink — a Monster Ultra White (the model by prajwalk12 on
 * Sketchfab) — on the desk past the mouse, or wherever the foreleg is
 * holding it: lifted to the mouthparts, tipped, shaken, crushed when it is
 * empty (gameGestures.js poses it). Inside its group the model is turned
 * every frame so the logo faces the camera, whichever way the can is held.
 */
function Can({ gamer, canRef }) {
  const { scene } = useGLTF('/models/monster-ultra-white.glb', '/draco/');
  const { camera } = useThree();
  const ref = useRef();
  const spin = useRef();
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // fit it to CAN: the bottom on the group's origin, centred, the right height
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const k = CAN.height / size.y;
    const holder = new THREE.Group();
    root.scale.multiplyScalar(k);
    root.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k, -(box.min.z + size.z / 2) * k);
    holder.add(root);
    return holder;
  }, [scene]);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const p = canRef.current;
    const held = gamer.gestures.ch.canLift > 0.001;
    // standing on the desk it still jumps when the desk is hit
    const k = held ? 0 : Math.max(gamer.slamImpact, gamer.gestures.thud * 0.5);
    const t = state.clock.elapsedTime;
    g.position.set(p.base[0], p.base[1] + Math.abs(Math.sin(t * 26)) * k * 0.03, p.base[2]);
    g.rotation.set(Math.cos(t * 17) * k * 0.15, p.yaw, -p.tilt + Math.sin(t * 19) * k * 0.2, 'YZX');
    const crushed = p.height / CAN.height;
    g.scale.set(1 + (1 - crushed) * 0.25, crushed, 1 + (1 - crushed) * 0.18);
    // the logo to the camera: a turn of α about Y moves azimuth φ to φ − α
    if (spin.current) {
      const toCam = Math.atan2(camera.position.z - p.base[2], camera.position.x - p.base[0]);
      spin.current.rotation.y = CAN_LOGO_AZIMUTH - p.yaw - toCam;
    }
  });
  return (
    <group ref={ref}>
      <group ref={spin}>
        <primitive object={model} />
      </group>
    </group>
  );
}

/**
 * The proboscis, as at the bar and the coder's desk: out of the mouthparts,
 * wherever the turned head has put them, down into the can's opening.
 */
function Proboscis({ gamer, mouthRef, canRef }) {
  const stalk = useRef();
  const tip = useRef();
  const v = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const m = mouthRef.current;
    const G = gamer.gestures;
    const e = G.ch.proboscis;
    const on = !!m && e > 0.02 && G.ch.canLift > 0.6;
    if (stalk.current) stalk.current.visible = on;
    if (tip.current) tip.current.visible = on;
    if (!on) return;
    const o = canRef.current.opening;
    v.from.set(m[0], m[1], m[2]);
    v.to.set(o[0], o[1] - 0.004, o[2]);
    v.dir.subVectors(v.to, v.from);
    const len = Math.max(0.001, v.dir.length() * e);
    v.dir.normalize();
    stalk.current.position.copy(v.from).addScaledVector(v.dir, len / 2);
    stalk.current.quaternion.setFromUnitVectors(v.up, v.dir);
    stalk.current.scale.set(1, len, 1);
    tip.current.position.copy(v.from).addScaledVector(v.dir, len);
  });
  return (
    <group>
      <mesh ref={stalk} visible={false}>
        <cylinderGeometry args={[0.0045, 0.0075, 1, 12]} />
        <meshStandardMaterial color="#b0621c" roughness={0.45} />
      </mesh>
      <mesh ref={tip} visible={false} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.008, 16, 12]} />
        <meshStandardMaterial color="#c47327" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------- the PC

/** The optimized Sketchfab PC; all geometry/material cleanup happens at build time. */
function PCTower({ gamer }) {
  const { scene } = useGLTF('/models/custom-gaming-pc.glb', '/draco/');
  const { model, materials, lights } = useMemo(() => {
    const model = scene.clone(true);
    const materials = new Map();
    const lights = [];
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const source = mesh.material;
      if (!materials.has(source)) {
        const material = source.clone();
        if (material.transparent) {
          material.depthWrite = false;
          material.forceSinglePass = true;
        }
        if (material.emissiveMap) {
          material.emissiveIntensity = 0.85;
          lights.push(material);
        }
        materials.set(source, material);
      }
      mesh.material = materials.get(source);
      mesh.castShadow = !mesh.material.transparent;
      mesh.receiveShadow = !mesh.material.transparent;
      if (mesh.material.name === 'Case glass') mesh.renderOrder = 1;
    });
    return { model, materials: [...materials.values()], lights };
  }, [scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useFrame(({ clock }) => {
    const impact = Math.min(1, gamer.slamImpact + (gamer.phase === PHASES.RAGE_QUIT ? 0.7 : 0));
    lights.forEach((material, i) => {
      // Preserve the model's RGB gradients; a small pulse still reacts to play.
      material.emissive.set('#ffffff').lerp(RAGE, impact);
      material.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 0.7 + i) * 0.08 + impact * 0.4;
    });
  });
  return <primitive object={model} position={PC.center} scale={PC.size[1]} dispose={null} />;
}

// ----------------------------------------------------------------- the chair

/**
 * A racing-style gaming chair built round the seat the fly is fitted to:
 * the cushion top where the stool's was, a tall bucket back behind the wings
 * and abdomen, arms, a gas lift and a five-star base.
 */
function Chair() {
  const [cx, seatY, cz] = CHAIR.seat;
  const w = CHAIR.width;
  const black = <meshStandardMaterial color="#141418" roughness={0.7} />;
  const accent = <meshStandardMaterial color="#de7a22" roughness={0.6} />;
  const seatFront = cx - 0.27;
  const seatBack = CHAIR.backX - 0.02;
  const seatD = seatBack - seatFront;
  const recline = 0.13;
  return (
    <group>
      {/* the cushion and its raised side bolsters */}
      <RoundedBox args={[seatD, 0.09, w]} radius={0.03} smoothness={3} position={[(seatFront + seatBack) / 2, seatY - 0.045, cz]} castShadow receiveShadow>
        {black}
      </RoundedBox>
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[seatD * 0.9, 0.05, 0.07]} radius={0.02} smoothness={3} position={[(seatFront + seatBack) / 2 + 0.02, seatY + 0.005, cz + s * (w / 2 - 0.035)]} castShadow>
          {accent}
        </RoundedBox>
      ))}
      {/* the back, leaning back a little from its foot */}
      <group position={[CHAIR.backX + 0.05, seatY - 0.02, cz]} rotation={[0, 0, recline]}>
        <RoundedBox args={[0.1, 0.98, w]} radius={0.04} smoothness={3} position={[0, 0.49, 0]} castShadow receiveShadow>
          {black}
        </RoundedBox>
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.12, 0.7, 0.075]} radius={0.03} smoothness={3} position={[-0.02, 0.4, s * (w / 2 - 0.02)]} castShadow>
            {accent}
          </RoundedBox>
        ))}
        {/* the headrest pillow, with the fly on it */}
        <RoundedBox args={[0.07, 0.13, 0.24]} radius={0.04} smoothness={3} position={[-0.075, 0.86, 0]} castShadow>
          <meshStandardMaterial color="#202027" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[0.06, 0.18, 0.2]} radius={0.04} smoothness={3} position={[-0.07, 0.18, 0]} castShadow>
          <meshStandardMaterial color="#202027" roughness={0.9} />
        </RoundedBox>
      </group>
      {/* arms */}
      {[-1, 1].map((s) => (
        <group key={s} position={[cx + 0.08, seatY, cz + s * (w / 2 + 0.05)]}>
          <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[0.03, 0.2, 0.03]} />{black}</mesh>
          <RoundedBox args={[0.32, 0.03, 0.07]} radius={0.012} smoothness={3} position={[0, 0.21, 0]} castShadow>{black}</RoundedBox>
        </group>
      ))}
      {/* the mechanism, the gas lift, the base */}
      <mesh position={[cx + 0.05, seatY - 0.12, cz]} castShadow><boxGeometry args={[0.22, 0.05, 0.22]} />{black}</mesh>
      <mesh position={[cx + 0.05, (seatY - 0.14) / 2 + 0.06, cz]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, seatY - 0.2, 16]} />
        <meshStandardMaterial color="#8a8a92" roughness={0.25} metalness={0.9} />
      </mesh>
      {Array.from({ length: 5 }, (_, k) => {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        return (
          <group key={k} position={[cx + 0.05, 0.075, cz]} rotation={[0, a, 0]}>
            <mesh position={[0.17, 0, 0]} castShadow><boxGeometry args={[0.34, 0.035, 0.05]} />{black}</mesh>
            <mesh position={[0.33, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.03, 16]} />{black}</mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------- the headset

/** Worn in Fly's head slot, so every coordinate here is the fly's own model space. */
function Headset({ gamer }) {
  const rings = useRef([]);
  const c = useMemo(() => new THREE.Color(), []);
  const mic = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(HEADSET.mic.map((p) => new THREE.Vector3(...p))), 24, 0.011, 8), []);
  useEffect(() => () => mic.dispose(), [mic]);
  useFrame((state) => {
    rings.current.forEach((m, k) => { if (m) m.color.copy(rgbAt(k * 0.5, state.clock.elapsedTime, gamer, c)); });
  });
  const [hx, hy, hz] = HEADSET.center;
  const plastic = <meshStandardMaterial color="#17171c" roughness={0.45} metalness={0.2} />;
  return (
    <group>
      {/* the band, over the top of the head */}
      <mesh position={[hx, hy, hz]} scale={[1, HEADSET.bandStretch, 1]} castShadow>
        <torusGeometry args={[HEADSET.bandRadius, HEADSET.tube, 12, 48, Math.PI]} />
        {plastic}
      </mesh>
      <mesh position={[hx, hy, hz]} scale={[1, HEADSET.bandStretch, 1]}>
        <torusGeometry args={[HEADSET.bandRadius - HEADSET.tube * 0.9, HEADSET.tube * 0.55, 8, 48, Math.PI]} />
        <meshStandardMaterial color="#de7a22" roughness={0.6} />
      </mesh>
      {HEADSET.cupX.map((x, k) => {
        const out = x < hx ? -1 : 1;
        return (
          <group key={x} position={[x, HEADSET.cupY, hz]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[HEADSET.cupRadius, HEADSET.cupRadius * 0.92, HEADSET.cupDepth, 32]} />
              {plastic}
            </mesh>
            {/* the cushion against the head */}
            <mesh position={[0, -out * HEADSET.cupDepth * 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[HEADSET.cupRadius * 0.72, HEADSET.cupRadius * 0.2, 10, 32]} />
              <meshStandardMaterial color="#26262e" roughness={0.95} />
            </mesh>
            {/* the RGB ring on the outside */}
            <mesh position={[0, out * (HEADSET.cupDepth / 2 + 0.001), 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[HEADSET.cupRadius * 0.7, 0.008, 8, 32]} />
              <meshBasicMaterial ref={(m) => { rings.current[k] = m; }} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {/* the boom mic, round to the mouthparts */}
      <mesh geometry={mic} castShadow>{plastic}</mesh>
      <mesh position={HEADSET.mic[HEADSET.mic.length - 1]}>
        <sphereGeometry args={[0.026, 16, 12]} />
        <meshStandardMaterial color="#0e0e12" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ the room

/** Hexagon light panels on the wall, a strip behind the desk, a neon sign, a shelf. */
function Room({ gamer }) {
  const hexes = useRef();
  // on a portrait screen the camera frames the wall where the page title sits
  const portrait = useThree((s) => s.size.width < s.size.height);
  const c = useMemo(() => new THREE.Color(), []);
  const HEX = useMemo(() => {
    // a small honeycomb on the wall above the monitors
    const r = 0.064;
    const cells = [[0, 0], [1, 0], [2, 0], [3, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2]];
    return cells.map(([q, row]) => [WALL_X + 0.012, 2.1 + row * r * 1.55, -0.18 + q * r * Math.sqrt(3) * 1.06]);
  }, []);
  useLayoutEffect(() => {
    const m = hexes.current;
    if (!m) return;
    const o = new THREE.Object3D();
    HEX.forEach((p, k) => { o.position.set(...p); o.rotation.set(0, 0, Math.PI / 2); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, c.set('#ff00ff')); });
    m.instanceMatrix.needsUpdate = true;
    // the per-panel colour is new to the material: recompile it with instancing colours
    m.material.needsUpdate = true;
    m.computeBoundingSphere();
  }, [HEX, c]);
  useFrame((state) => {
    const m = hexes.current;
    if (!m) return;
    // softer than the rest of the RGB: panels on a wall, not a light show
    HEX.forEach((_, k) => m.setColorAt(k, rgbAt(k / HEX.length * 0.5, state.clock.elapsedTime * 0.8, gamer, c).multiplyScalar(0.55)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  const neon = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.font = 'italic 800 128px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff3df2'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#ffb3f7';
    ctx.fillText('one more game', 512, 128);
    ctx.shadowBlur = 12;
    ctx.fillText('one more game', 512, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const poster = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 360; cv.height = 512;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#2a0f4a'); g.addColorStop(1, '#0d1a3a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 512);
    ctx.globalAlpha = 0.9; drawFly(ctx, 180, 210, 260); ctx.globalAlpha = 1;
    ctx.fillStyle = '#f6ead6'; ctx.font = '900 64px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GG', 180, 420);
    ctx.font = '600 20px Inter, system-ui, sans-serif'; ctx.fillStyle = '#b8a8e8';
    ctx.fillText('FLY LAB · ESPORTS', 180, 460);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      {/* the wall */}
      <mesh position={[WALL_X, 1.9, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[7, 3.8]} />
        <meshStandardMaterial color="#1c1928" roughness={0.92} />
      </mesh>
      <instancedMesh ref={hexes} args={[null, null, HEX.length]}>
        <cylinderGeometry args={[0.06, 0.06, 0.012, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* the neon sign, over the vertical monitor */}
      <mesh position={[WALL_X + 0.01, 2.3, 0.72]} rotation={[0, Math.PI / 2, 0]} visible={!portrait}>
        <planeGeometry args={[0.72, 0.18]} />
        <meshBasicMaterial map={neon} transparent toneMapped={false} />
      </mesh>
      <pointLight position={[WALL_X + 0.3, 2.3, 0.72]} color="#ff3df2" intensity={1.2} distance={1.6} decay={2} />
      {/* a poster over the PC */}
      <mesh position={[WALL_X + 0.01, 2.2, -1.25]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.36, 0.51]} />
        <meshStandardMaterial map={poster} roughness={0.8} />
      </mesh>
      {/* a shelf with a trophy and a blocky green figure */}
      <group position={[WALL_X + 0.1, 1.98, 1.1]}>
        <mesh castShadow receiveShadow><boxGeometry args={[0.18, 0.02, 0.5]} /><meshStandardMaterial color="#2a2530" roughness={0.7} /></mesh>
        <group position={[0, 0.01, -0.12]}>
          <mesh position={[0, 0.04, 0]} castShadow><cylinderGeometry args={[0.025, 0.035, 0.08, 16]} /><meshStandardMaterial color="#d8a93a" metalness={0.9} roughness={0.25} /></mesh>
          <mesh position={[0, 0.11, 0]} castShadow><sphereGeometry args={[0.045, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /><meshStandardMaterial color="#d8a93a" metalness={0.9} roughness={0.25} side={THREE.DoubleSide} /></mesh>
        </group>
        <group position={[0, 0.01, 0.1]}>
          <mesh position={[0, 0.07, 0]} castShadow><boxGeometry args={[0.04, 0.1, 0.03]} /><meshStandardMaterial color="#4fae3c" roughness={0.8} /></mesh>
          <mesh position={[0, 0.145, 0]} castShadow><boxGeometry args={[0.05, 0.05, 0.05]} /><meshStandardMaterial color="#5dbb46" roughness={0.8} /></mesh>
        </group>
      </group>
      {/* the strip behind the desk */}
      <StripGlow gamer={gamer} />
      {/* the floor and a rug under the chair */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color="#141219" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.35, 0.004, -0.05]} receiveShadow>
        <circleGeometry args={[0.95, 48]} />
        <meshStandardMaterial color="#231d2e" roughness={1} />
      </mesh>
    </group>
  );
}

function StripGlow({ gamer }) {
  const ref = useRef();
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state) => { if (ref.current) ref.current.color.copy(rgbAt(0.55, state.clock.elapsedTime, gamer, c)); });
  return (
    <mesh position={[WALL_X + 0.02, DESK.top + 0.03, -0.15]}>
      <boxGeometry args={[0.01, 0.012, 2.3]} />
      <meshBasicMaterial ref={ref} toneMapped={false} />
    </mesh>
  );
}

// ----------------------------------------------------------------- scene

function World({ gamer, onTick }) {
  const gripTargetRef = useRef(REST_HAND_WORLD);
  const dopamineRef = useRef(0);
  const lookRef = useRef(null);
  const mouthRef = useRef(null);
  // where the can and the keyboard are this frame: the rig fills them, the props read them
  const canRef = useRef(canPose({}));
  const kbRef = useRef(keyboardPose(null));
  // the points on the head the foreleg goes to; Fly writes where the turned head has put them
  const headPoints = useMemo(() => ({
    local: [HEAD_POINTS.cup, HEAD_POINTS.eye, HEAD_POINTS.face],
    world: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    after: null,
  }), []);
  return (
    <>
      <Lights gamer={gamer} dopamineRef={dopamineRef} />
      <Rig gamer={gamer} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} canRef={canRef} kbRef={kbRef} headPoints={headPoints} onTick={onTick} />
      <Room gamer={gamer} />
      <Desk gamer={gamer} />
      <Mat gamer={gamer} />
      <MainMonitor gamer={gamer} />
      <SideMonitor gamer={gamer} />
      <Keyboard gamer={gamer} kbRef={kbRef} />
      <Mouse gamer={gamer} />
      <Can gamer={gamer} canRef={canRef} />
      <PCTower gamer={gamer} />
      <Chair />
      <Fly
        machine={gamer}
        gripTargetRef={gripTargetRef}
        dopamineRef={dopamineRef}
        lookRef={lookRef}
        mouthRef={mouthRef}
        mouthLocal={MOUTH_LOCAL}
        headPoints={headPoints}
        headSlot={<Headset gamer={gamer} />}
      />
      <Proboscis gamer={gamer} mouthRef={mouthRef} canRef={canRef} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.55} scale={10} blur={2.4} far={4} resolution={1024} color="#030306" />
      <StudioProbe />
    </>
  );
}

export function GameScene({ gamer, onTick }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 5, 14);
      }}
    >
      <GameCamera />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World gamer={gamer} onTick={onTick} />
      </Suspense>
    </Canvas>
  );
}

function GameCamera() {
  const { width, height } = useThree((state) => state.size);
  return <PerspectiveCamera makeDefault fov={gameCameraFov(width / height)} position={GAME_CAMERA.position} near={0.05} far={60} />;
}

useGLTF.preload('/models/monster-ultra-white.glb', '/draco/');

useGLTF.preload('/models/custom-gaming-pc.glb', '/draco/');
