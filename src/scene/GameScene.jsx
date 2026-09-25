/**
 * The gaming setup: the same fly, in a gaming chair, at a desk in a dark room
 * lit by its own screens and a PC full of RGB.
 *
 * The curved monitor in front of it and the vertical one on its left are
 * canvas textures painted by gamePainters.js; the curved one is also the key
 * light on the fly, in the colours of whatever game is on. The right foreleg
 * is on the mouse — the mouse follows the aim — and it comes up off it to
 * slam the desk. The headset rides in the fly's head slot, so it turns with
 * the head.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { StudioProbe } from './BarScene.jsx';
import { flyToWorld } from './layout.js';
import { HAND } from './flyRig.js';
import {
  DESK, SCREEN, SIDE, MAT, KEYBOARD, MOUSE, CAN, PC, CHAIR, WALL_X, HEADSET,
  SLAM_TOP, SLAM_DESK, SIDE_GAZE, DESK_GAZE, GAME_CAMERA, mousePoint, onScreen,
} from './gameLayout.js';
import { drawGame, drawSide, drawFly, MAIN_W, MAIN_H, SIDE_W, SIDE_H } from './gamePainters.js';
import { PHASES, HALF_FOV, SLAM_HIT } from '../game/gamer.js';
import { GAMES } from '../game/games.js';
import { sound } from '../audio/audio.js';

if (import.meta.env.DEV) window.__advance = advance;

const REST_HAND_WORLD = flyToWorld(HAND);
const BG = new THREE.Color('#0e0c16');
const RAGE = new THREE.Color('#ff2a1a');
const DESKTOP = new THREE.Color('#8a5cff');

const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t * t;

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

function Rig({ gamer, gripTargetRef, dopamineRef, lookRef, onTick }) {
  const { camera } = useThree();
  const base = useMemo(() => new THREE.Vector3(...GAME_CAMERA.position), []);
  const look = useMemo(() => new THREE.Vector3(...GAME_CAMERA.target), []);
  const uiClock = useRef(0);
  const glance = useRef({ until: 0, chat: 0 });
  const shake = useRef(0);
  const lastPhase = useRef(gamer.phase);

  useFrame((state, dt) => {
    const g = gamer;
    g.update(dt);
    const t = state.clock.elapsedTime;

    // --- the foreleg: on the mouse, or up and down onto the desk -------------
    const onMouse = mousePoint(g.hand.dx, g.hand.dz, g.pressDepth);
    if (g.slamPhase !== null) {
      const p = g.slamPhase;
      const wind = 0.28;
      if (p < wind) gripTargetRef.current = lerp3(onMouse, SLAM_TOP, easeOut(p / wind));
      else if (p < SLAM_HIT) gripTargetRef.current = lerp3(SLAM_TOP, SLAM_DESK, easeIn((p - wind) / (SLAM_HIT - wind)));
      else if (p < 0.7) gripTargetRef.current = SLAM_DESK;
      else gripTargetRef.current = lerp3(SLAM_DESK, onMouse, easeOut((p - 0.7) / 0.3));
    } else {
      gripTargetRef.current = g.grip > 0.01 ? onMouse : REST_HAND_WORLD;
    }
    dopamineRef.current = g.dopamine;

    // --- the eyes: the enemy on the screen, the chat when it pings, the desk it hits
    const newest = g.chat[g.chat.length - 1];
    if (newest && newest !== glance.current.chat) {
      glance.current.chat = newest;
      if (!g.enemy && newest.kind !== 'me') glance.current.until = t + 0.9;
    }
    let at;
    if (g.slamPhase !== null && g.slamPhase < 0.75) at = DESK_GAZE;
    else if (g.enemy && g.phase === PHASES.PLAYING) {
      const u = Math.max(-0.95, Math.min(0.95, g.enemy.err / HALF_FOV));
      at = onScreen(u, -0.05);
    } else if (t < glance.current.until || g.phase === PHASES.RAGE_QUIT) at = SIDE_GAZE;
    else at = onScreen(Math.sin(t * 0.4) * 0.15, -0.1 + Math.sin(t * 0.7) * 0.05);
    lookRef.current = at;

    sound.setArousal(g.arousal, g.collapse);

    // --- the camera jolts on a slam, a flinch, an explosion ---------------------
    if (g.phase !== lastPhase.current && g.phase === PHASES.RAGE_QUIT) shake.current = 1;
    lastPhase.current = g.phase;
    shake.current = Math.max(0, shake.current - dt * 2.2, g.slamImpact * 0.9, g.startle * 0.25);
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
    if (pc.current) { pc.current.color.copy(tmp); pc.current.intensity = 3 + g.slamImpact * 4; }
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
      <pointLight ref={pc} position={[PC.center[0] + 0.05, PC.center[1] + PC.size[1] * 0.55, PC.center[2] - PC.size[2] * 0.8]} distance={2.2} decay={2} intensity={3} />
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
function Keyboard({ gamer }) {
  const [canvas, texture] = useCanvasTexture(512, 160);
  const group = useRef();
  const clock = useRef(0);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    clock.current += dt;
    if (group.current) {
      const k = gamer.slamImpact;
      group.current.position.y = KEYBOARD.center[1] + Math.abs(Math.sin(t * 30)) * k * 0.025;
      group.current.rotation.x = Math.sin(t * 23) * k * 0.05;
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
      ref.current.position.set(MOUSE.home[0] + gamer.hand.dx, MOUSE.home[1], MOUSE.home[2] + gamer.hand.dz);
      ref.current.rotation.y = gamer.hand.dz * 1.5;
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

/** BUZZ, the energy drink of flies. */
function Can({ gamer }) {
  const ref = useRef();
  const label = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#131313'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#b6ff2a'; ctx.font = '900 54px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BUZZ', 128, 60);
    ctx.fillStyle = '#b6ff2a'; ctx.fillRect(0, 100, 256, 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    const k = gamer.slamImpact;
    const t = state.clock.elapsedTime;
    ref.current.position.y = CAN.base[1] + Math.abs(Math.sin(t * 26)) * k * 0.03;
    ref.current.rotation.z = Math.sin(t * 19) * k * 0.2;
    ref.current.rotation.x = Math.cos(t * 17) * k * 0.15;
  });
  return (
    <group ref={ref} position={CAN.base}>
      <mesh position={[0, CAN.height / 2, 0]} castShadow>
        <cylinderGeometry args={[CAN.radius, CAN.radius, CAN.height, 24, 1, true]} />
        <meshStandardMaterial map={label} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, CAN.height, 0]}>
        <cylinderGeometry args={[CAN.radius * 0.9, CAN.radius, 0.008, 24]} />
        <meshStandardMaterial color="#b8b8c0" roughness={0.25} metalness={0.9} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------- the PC

/** A spinning fan: an RGB ring and a hub of blades. */
function Fan({ position, rotation, size, gamer, phase }) {
  const blades = useRef();
  const ring = useRef();
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state, dt) => {
    if (blades.current) blades.current.rotation.z -= dt * (18 + gamer.heartRate * 0.02);
    if (ring.current) ring.current.color.copy(rgbAt(phase, state.clock.elapsedTime, gamer, c));
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <torusGeometry args={[size * 0.44, size * 0.04, 8, 32]} />
        <meshBasicMaterial ref={ring} toneMapped={false} />
      </mesh>
      <group ref={blades}>
        {Array.from({ length: 7 }, (_, k) => (
          <mesh key={k} rotation={[0, 0.35, (k / 7) * Math.PI * 2]} position={[Math.cos((k / 7) * Math.PI * 2) * size * 0.2, Math.sin((k / 7) * Math.PI * 2) * size * 0.2, 0]}>
            <boxGeometry args={[size * 0.3, size * 0.1, 0.003]} />
            <meshStandardMaterial color="#1a1a22" roughness={0.5} transparent opacity={0.85} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size * 0.1, size * 0.1, 0.01, 16]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
    </group>
  );
}

function PCTower({ gamer }) {
  const [sx, sy, sz] = PC.size;
  const [x, y0, z] = PC.center;
  const cy = y0 + sy / 2;
  const rgb = useRef([]);
  const c = useMemo(() => new THREE.Color(), []);
  const pump = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0a0e'; ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill();
    drawFly(ctx, 64, 60, 96);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame((state) => {
    rgb.current.forEach((m, k) => { if (m) m.color.copy(rgbAt(k * 0.13, state.clock.elapsedTime, gamer, c)); });
  });
  const rgbMat = (k) => <meshBasicMaterial ref={(m) => { rgb.current[k] = m; }} toneMapped={false} />;
  const metal = <meshStandardMaterial color="#0f0f13" roughness={0.35} metalness={0.6} />;
  return (
    <group position={[x, cy, z]}>
      {/* the case: top, bottom, back, far side; the near side and front are glass */}
      <mesh position={[0, sy / 2 - 0.006, 0]} castShadow><boxGeometry args={[sx, 0.012, sz]} />{metal}</mesh>
      <mesh position={[0, -sy / 2 + 0.006, 0]} castShadow receiveShadow><boxGeometry args={[sx, 0.012, sz]} />{metal}</mesh>
      <mesh position={[-sx / 2 + 0.006, 0, 0]} castShadow><boxGeometry args={[0.012, sy, sz]} />{metal}</mesh>
      <mesh position={[0, 0, sz / 2 - 0.006]} castShadow><boxGeometry args={[sx, sy, 0.012]} />{metal}</mesh>
      {/* motherboard on the far wall */}
      <mesh position={[-0.02, 0.03, sz / 2 - 0.02]}>
        <boxGeometry args={[sx * 0.62, sy * 0.62, 0.006]} />
        <meshStandardMaterial color="#101418" roughness={0.6} />
      </mesh>
      {/* GPU, long, with its light bar */}
      <mesh position={[-0.02, -0.04, 0.01]} castShadow>
        <boxGeometry args={[sx * 0.7, 0.055, sz * 0.5]} />
        <meshStandardMaterial color="#1c1c24" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[-0.02, -0.04 + 0.028, 0.01 - sz * 0.25 - 0.001]}><boxGeometry args={[sx * 0.6, 0.006, 0.002]} />{rgbMat(0)}</mesh>
      <mesh position={[-0.02, -0.04, 0.01 - sz * 0.25 - 0.002]}><boxGeometry args={[sx * 0.5, 0.01, 0.002]} />{rgbMat(1)}</mesh>
      {/* four sticks of RAM, lit on top */}
      {[0, 1, 2, 3].map((k) => (
        <group key={k} position={[0.03 + k * 0.016, 0.12, sz / 2 - 0.06]}>
          <mesh><boxGeometry args={[0.006, 0.06, 0.04]} /><meshStandardMaterial color="#15151a" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, 0.034, 0]}><boxGeometry args={[0.007, 0.01, 0.04]} />{rgbMat(2 + k)}</mesh>
        </group>
      ))}
      {/* the AIO pump, with the Fly Lab mark on its screen */}
      <group position={[-0.05, 0.1, sz / 2 - 0.05]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 32]} />
          <meshStandardMaterial color="#141418" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0, -0.0155]} rotation={[0, Math.PI, 0]}>
          <circleGeometry args={[0.034, 32]} />
          <meshBasicMaterial map={pump} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.016]}>
          <torusGeometry args={[0.037, 0.003, 8, 32]} />
          {rgbMat(6)}
        </mesh>
      </group>
      {/* the PSU shroud */}
      <mesh position={[0, -sy / 2 + 0.05, 0]}>
        <boxGeometry args={[sx - 0.02, 0.09, sz - 0.02]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* three fans behind the front glass, and one at the back */}
      {[0.14, 0, -0.14].map((fy, k) => (
        <Fan key={fy} gamer={gamer} phase={0.3 + k * 0.1} size={0.12} position={[sx / 2 - 0.03, fy + 0.03, 0]} rotation={[0, Math.PI / 2, 0]} />
      ))}
      <Fan gamer={gamer} phase={0.7} size={0.11} position={[-sx / 2 + 0.03, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
      {/* glass: the near side and the front */}
      <mesh position={[0, 0, -sz / 2 + 0.003]}>
        <boxGeometry args={[sx - 0.01, sy - 0.01, 0.004]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.05} metalness={0.9} transparent opacity={0.16} envMapIntensity={1.4} />
      </mesh>
      <mesh position={[sx / 2 - 0.003, 0, 0]}>
        <boxGeometry args={[0.004, sy - 0.01, sz - 0.01]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.05} metalness={0.9} transparent opacity={0.2} envMapIntensity={1.4} />
      </mesh>
      {/* feet */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => (
        <mesh key={`${a}${b}`} position={[a * (sx / 2 - 0.04), -sy / 2 - 0.006, b * (sz / 2 - 0.03)]}>
          <cylinderGeometry args={[0.014, 0.014, 0.012, 12]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
    </group>
  );
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
      <mesh position={[WALL_X + 0.01, 2.3, 0.72]} rotation={[0, Math.PI / 2, 0]}>
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
  return (
    <>
      <Lights gamer={gamer} dopamineRef={dopamineRef} />
      <Rig gamer={gamer} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} onTick={onTick} />
      <Room gamer={gamer} />
      <Desk gamer={gamer} />
      <Mat gamer={gamer} />
      <MainMonitor gamer={gamer} />
      <SideMonitor gamer={gamer} />
      <Keyboard gamer={gamer} />
      <Mouse gamer={gamer} />
      <Can gamer={gamer} />
      <PCTower gamer={gamer} />
      <Chair />
      <Fly machine={gamer} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} headSlot={<Headset gamer={gamer} />} />
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
      <PerspectiveCamera makeDefault fov={GAME_CAMERA.fov} position={GAME_CAMERA.position} near={0.05} far={60} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World gamer={gamer} onTick={onTick} />
      </Suspense>
    </Canvas>
  );
}
