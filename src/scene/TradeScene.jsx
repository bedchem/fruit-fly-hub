/**
 * The trading desk: the same fly on the same stool, a wall of six screens,
 * and two arcade buttons it presses with its right foreleg.
 *
 * Every screen is a canvas texture painted by chartTexture.js. The price
 * chart in the middle of the top row is the one whose motion is fed to the
 * fly's motion detectors; the others are what a trader keeps around it —
 * the news wire, its race against the market, the book, its own trades and,
 * because this is Fly Lab, its own brain. The wall's glow is the key light
 * on the fly: green while the chart climbs, red while it falls.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { Stool, StudioProbe } from './studio.jsx';
import { flyToWorld } from './layout.js';
import { HAND } from './flyRig.js';
import { DESK, MONITOR, MONITORS, BUTTONS, SCREEN_GAZE, TRADE_CAMERA, pressPoint, gazeAt } from './tradeLayout.js';
import { PAINTERS } from './chartTexture.js';
import { PHASES } from '../game/trader.js';
import { sound } from '../audio/audio.js';

if (import.meta.env.DEV) window.__advance = advance;

const REST_HAND_WORLD = flyToWorld(HAND);
const BG = new THREE.Color('#161b24');
const GREEN = new THREE.Color('#3fbf6a');
const RED = new THREE.Color('#e0503a');
const NEUTRAL = new THREE.Color('#9fb3c8');

// ------------------------------------------------------------------ the rig

function Rig({ trader, gripTargetRef, dopamineRef, lookRef, onTick }) {
  const glance = useRef({ id: 'main', until: 0, next: 4 });
  const { camera } = useThree();
  const base = useMemo(() => new THREE.Vector3(...TRADE_CAMERA.position), []);
  const look = useMemo(() => new THREE.Vector3(...TRADE_CAMERA.target), []);
  const uiClock = useRef(0);
  const shake = useRef(0);
  const lastPhase = useRef(trader.phase);

  useFrame((state, dt) => {
    trader.update(dt);
    if (trader.grip > 0.001 && trader.button) {
      gripTargetRef.current = pressPoint(trader.button, trader.pressDepth);
    } else {
      gripTargetRef.current = REST_HAND_WORLD;
    }
    dopamineRef.current = trader.dopamine;

    // Eyes on the price chart, on the buttons while pressing — and now and
    // then a glance at another screen: the wire when a headline breaks, its
    // P&L race after a fill, otherwise wherever its eyes happen to wander.
    const t = state.clock.elapsedTime;
    const g = glance.current;
    const news = trader.market.news;
    if (news && news !== g.news) { g.news = news; g.id = 'news'; g.until = t + 1.6; }
    else if (trader.lastResult && trader.lastResult !== g.result && trader.lastResult.kind !== 'hold') {
      g.result = trader.lastResult; g.id = 'race'; g.until = t + 1.1;
    } else if (t > g.next && t > g.until) {
      const others = ['news', 'race', 'book', 'tape', 'brain'];
      g.id = others[Math.floor((Math.sin(t * 91.7) * 0.5 + 0.5) * others.length) % others.length];
      g.until = t + 0.9;
      g.next = t + 4 + (Math.sin(t * 13.1) * 0.5 + 0.5) * 5;
    }
    const at = t < g.until ? gazeAt(g.id) : SCREEN_GAZE;
    lookRef.current = trader.grip > 0.35 && trader.button
      ? pressPoint(trader.button, 0)
      : [at[0], at[1] + Math.sin(t * 1.3) * 0.03, at[2] + Math.sin(t * 0.7) * 0.08];

    sound.setArousal(trader.arousal, trader.collapse);

    // the camera jolts when something goes badly wrong
    if (trader.phase !== lastPhase.current && trader.phase === PHASES.MARGIN_CALL) shake.current = 1;
    if (trader.order?.panic) shake.current = Math.max(shake.current, 0.5);
    lastPhase.current = trader.phase;
    shake.current = Math.max(0, shake.current - dt * 2.5);
    const k = shake.current + trader.loom * 0.25;
    camera.position.set(
      base.x + Math.sin(t * 0.21) * 0.05 + Math.sin(t * 31.7) * k * 0.04,
      base.y + Math.sin(t * 0.17) * 0.03 + Math.sin(t * 27.3) * k * 0.035,
      base.z + Math.cos(t * 0.19) * 0.05 + Math.cos(t * 24.1) * k * 0.04,
    );
    camera.lookAt(look);

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

/** The screen is the light: its glow follows the chart. */
function Lights({ trader, dopamineRef }) {
  const glow = useRef();
  const key = useRef();
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const m = trader.motion;
    color.copy(NEUTRAL).lerp(m >= 0 ? GREEN : RED, Math.min(1, Math.abs(m) * 0.8));
    if (trader.loom > 0.2 || trader.phase === PHASES.MARGIN_CALL) color.lerp(RED, 0.7);
    if (glow.current) {
      glow.current.color.copy(color);
      glow.current.intensity = trader.phase === PHASES.CLOSED ? 2 : 6 + trader.loom * 6;
    }
    if (key.current) key.current.intensity = 1.1 + (dopamineRef.current ?? 0) * 0.5;
  });
  return (
    <>
      <ambientLight intensity={0.35} color="#c9d6ea" />
      <hemisphereLight args={['#b8c7de', '#1a1410', 0.45]} />
      <directionalLight
        ref={key}
        position={[4.5, 5.5, -1.2]}
        intensity={1.1}
        color="#f1e6d2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-far={18}
        shadow-bias={-0.0006}
      />
      <pointLight
        ref={glow}
        position={[MONITOR.center[0] + 0.3, (MONITORS[0].center[1] + MONITORS[3].center[1]) / 2, MONITOR.center[2]]}
        intensity={6}
        distance={3}
        decay={2}
      />
    </>
  );
}

// ------------------------------------------------------------ the desk

function Desk() {
  const { top, thickness, front, back, zMin, zMax } = DESK;
  const len = zMax - zMin;
  const zMid = (zMin + zMax) / 2;
  const depth = front - back;
  return (
    <group>
      <mesh position={[(front + back) / 2, top - thickness / 2, zMid]} castShadow receiveShadow>
        <boxGeometry args={[depth, thickness, len]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.35} metalness={0.2} />
      </mesh>
      {[zMin + 0.12, zMax - 0.12].map((z) => (
        <mesh key={z} position={[(front + back) / 2, (top - thickness) / 2, z]} castShadow>
          <boxGeometry args={[depth - 0.08, top - thickness, 0.05]} />
          <meshStandardMaterial color="#1f2125" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * One screen of the wall: a thin bezel, the picture painted on its face by
 * the painter named after it (chartTexture.js). The price chart repaints
 * often; the others take turns, so six canvases never cost six repaints a
 * frame.
 */
function Screen({ spec, trader, store, slot }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = spec.id === 'main' ? 1024 : 768;
    c.height = spec.id === 'main' ? 600 : 448;
    return c;
  }, [spec.id]);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  const clock = useRef(slot * 0.03);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, dt) => {
    clock.current += dt;
    const every = spec.id === 'main' ? 1 / 15 : 1 / 5;
    if (clock.current < every) return;
    clock.current = 0;
    PAINTERS[spec.id](canvas.getContext('2d'), trader, store?.current?.brain ?? null);
    texture.needsUpdate = true;
  });
  const [x, y, z] = spec.center;
  // Y first to face +X and swing in, then the tilt back towards the fly
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2 + spec.yaw, 0]}>
      <group rotation={[spec.tilt, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[spec.width + 0.024, spec.height + 0.024, 0.022]} />
          <meshStandardMaterial color="#0c0d10" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.0115]}>
          <planeGeometry args={[spec.width, spec.height]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The wall: six screens on a two-tier stand. Posts hold the bottom row off
 * the desk; the top row hangs from the same frame.
 */
function Monitors({ trader, store }) {
  const bottom = Math.min(...MONITORS.map((m) => m.center[1])) - MONITORS[0].height / 2;
  const top = Math.max(...MONITORS.map((m) => m.center[1])) + MONITORS[0].height / 2;
  const posts = MONITORS.filter((m) => m.center[1] < 1.7);
  return (
    <group>
      {MONITORS.map((m, i) => <Screen key={m.id} spec={m} trader={trader} store={store} slot={i} />)}
      {posts.map((m) => (
        <group key={`post-${m.id}`}>
          <mesh position={[m.center[0] - 0.05, (DESK.top + top) / 2, m.center[2]]} castShadow>
            <boxGeometry args={[0.035, top - DESK.top, 0.035]} />
            <meshStandardMaterial color="#1a1b1f" roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[m.center[0] - 0.05, DESK.top + 0.006, m.center[2]]} receiveShadow castShadow>
            <boxGeometry args={[0.2, 0.012, 0.16]} />
            <meshStandardMaterial color="#1a1b1f" roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[MONITOR.center[0] - 0.05, bottom - 0.03, MONITOR.center[2]]} castShadow>
        <boxGeometry args={[0.03, 0.03, 1.9]} />
        <meshStandardMaterial color="#1a1b1f" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** An arcade button: a ring, and a cap that travels when pressed. */
function Button({ trader, which, color }) {
  const cap = useRef();
  const mat = useRef();
  const [x, y, z] = BUTTONS[which];
  useFrame(() => {
    const down = Math.max(trader.pressed[which], trader.button === which ? trader.pressDepth : 0);
    if (cap.current) cap.current.position.y = 0.018 - down * 0.012;
    if (mat.current) mat.current.emissiveIntensity = 0.35 + down * 1.6;
  });
  return (
    <group position={[x, DESK.top, z]}>
      <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[BUTTONS.radius * 1.35, BUTTONS.radius * 1.45, 0.012, 32]} />
        <meshStandardMaterial color="#111" roughness={0.4} />
      </mesh>
      <mesh ref={cap} position={[0, 0.018, 0]} castShadow>
        <cylinderGeometry args={[BUTTONS.radius, BUTTONS.radius, 0.016, 32]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.35} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Labels for the two buttons, printed on the desk in front of them. */
function ButtonLabels() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e9e2d4';
    ctx.font = '700 72px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BUY', 128, 64);
    ctx.fillText('SELL', 384, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const zMid = (BUTTONS.buy[2] + BUTTONS.sell[2]) / 2;
  return (
    <mesh position={[BUTTONS.buy[0] + 0.058, DESK.top + 0.001, zMid]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
      <planeGeometry args={[0.32, 0.08]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** Other screens on the wall behind: somebody else's markets, all night. */
function Wall() {
  const screens = useMemo(() => {
    const out = [];
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 150;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0e1117';
        ctx.fillRect(0, 0, 256, 150);
        let p = 75;
        for (let k = 0; k < 40; k++) {
          const o = p;
          p = Math.max(15, Math.min(135, p + (rnd() - 0.5) * 16));
          ctx.fillStyle = p < o ? '#3fbf6a' : '#e0503a';
          ctx.fillRect(8 + k * 6, Math.min(o, p), 4, Math.max(2, Math.abs(p - o)));
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        out.push({ t, z: -1.6 + i * 0.62, y: 1.75 + row * 0.42 });
      }
    }
    return out;
  }, []);
  const x = -0.55;
  return (
    <group>
      <mesh position={[x - 0.05, 1.8, -0.1]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[6, 3.6]} />
        <meshStandardMaterial color="#1b2029" roughness={0.9} />
      </mesh>
      {screens.map((s, i) => (
        <mesh key={i} position={[x, s.y, s.z]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.56, 0.33]} />
          <meshBasicMaterial map={s.t} toneMapped={false} transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// ----------------------------------------------------------------- scene

function World({ trader, store, onTick }) {
  const gripTargetRef = useRef(REST_HAND_WORLD);
  const dopamineRef = useRef(0);
  const lookRef = useRef(null);
  return (
    <>
      <Lights trader={trader} dopamineRef={dopamineRef} />
      <Rig trader={trader} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} onTick={onTick} />
      <Desk />
      <Stool />
      <Monitors trader={trader} store={store} />
      <Button trader={trader} which="buy" color="#2fa85a" />
      <Button trader={trader} which="sell" color="#d6412c" />
      <ButtonLabels />
      <Wall />
      <Fly machine={trader} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={12} blur={2.4} far={4} resolution={1024} color="#05070a" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color="#232830" roughness={0.9} />
      </mesh>
      <StudioProbe />
    </>
  );
}

export function TradeScene({ trader, store, onTick }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 6, 16);
      }}
    >
      <PerspectiveCamera makeDefault fov={TRADE_CAMERA.fov} position={TRADE_CAMERA.position} near={0.05} far={60} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World trader={trader} store={store} onTick={onTick} />
      </Suspense>
    </Canvas>
  );
}
