/**
 * The coder fly's room: a desk at night, until dawn.
 *
 * The same fly in the same seat as every experiment, in a cozy desk chair
 * now, at a wooden desk: a MacBook under its right foreleg, an external
 * monitor behind it, a mug of coffee and the French press, a desk lamp, a
 * string of fairy lights, plants, a bookshelf, and a window with rain on it
 * and a city outside whose sky is the clock of the night.
 *
 * The screens are canvases painted from the Coder (codePainters.js), each on
 * its own budget: the editor when something changed and at most twenty times
 * a second, the monitor five times, the sky once a second. The furniture
 * from Poly Haven (CC0) is loaded compressed from /models/, the decoder from
 * this site.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { AdaptiveDpr, ContactShadows, PerspectiveCamera, RoundedBox, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { flyToWorld } from './layout.js';
import { HAND } from './flyRig.js';
import {
  DESK, ROOM, CHAIR, MBP, MACBOOK, KEYS, KEY, TRACKPAD, DECK_Y, MONITOR, MUG, PRESS, MOUTH, MOUTH_LOCAL,
  CODE_CAMERA, codeCameraFov, macToWorld, mugPose,
} from './codeLayout.js';
import {
  paintEditor, paintMonitor, paintSky, paintKeyLegends, paintDeck, paintLid, paintWood, paintRug, paintPoster, paintSticky,
} from './codePainters.js';
import { PHASES } from '../game/coder.js';
import { sound } from '../audio/audio.js';
import { cozy } from '../audio/codeSounds.js';

if (import.meta.env.DEV) window.__advance = advance;

const REST_HAND_WORLD = flyToWorld(HAND);
const BG = new THREE.Color('#140f0c');
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint?.(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- where it looks

const SCREEN_AT = macToWorld([-MBP.depth / 2 - Math.sin(MBP.lidTilt) * 0.1, MBP.base + Math.cos(MBP.lidTilt) * 0.1, 0]);
const monitorPoint = (u, v) => {
  const [x, y, z] = MONITOR.center;
  const c = Math.cos(MONITOR.yaw), s = Math.sin(MONITOR.yaw);
  // along the screen: its width runs along the rotated Z
  return [x + s * u * MONITOR.width / 2, y + v * MONITOR.height / 2, z + c * u * MONITOR.width / 2];
};
const GAZE = {
  laptop: SCREEN_AT,
  keys: macToWorld([-0.02, MBP.base, -0.02]),
  app: monitorPoint(0.28, 0),
  terminal: monitorPoint(-0.55, 0.2),
  window: [ROOM.back, (ROOM.window.y0 + ROOM.window.y1) / 2, (ROOM.window.z0 + ROOM.window.z1) / 2],
};

// ------------------------------------------------------------------ the rig

function Rig({ coder, gripTargetRef, dopamineRef, lookRef, coffeeRef, onTick }) {
  const { camera, size } = useThree();
  const gaze = useMemo(() => ({ want: new THREE.Vector3(), at: new THREE.Vector3(), out: [0, 0, 0], ready: false, glance: null, until: 0, next: 5 }), []);
  const base = useMemo(() => new THREE.Vector3(...CODE_CAMERA.position), []);
  const target = useMemo(() => new THREE.Vector3(...CODE_CAMERA.target), []);
  const pointer = useRef({ x: 0, y: 0, ax: 0, ay: 0 });
  const reduced = useRef(false);
  const uiClock = useRef(0);
  const shake = useRef(0);
  const lastPhase = useRef(coder.phase);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const set = () => { reduced.current = media.matches; };
    set();
    media.addEventListener('change', set);
    const move = (e) => {
      if (e.pointerType === 'touch') return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', move);
    return () => { media.removeEventListener('change', set); window.removeEventListener('pointermove', move); };
  }, []);

  useFrame((state, dt) => {
    coder.update(dt);
    gripTargetRef.current = coder.grip > 0.001 ? coder.handTarget : REST_HAND_WORLD;
    dopamineRef.current = coder.dopamine;
    const t = state.clock.elapsedTime;

    // --- where its eyes go ---------------------------------------------------
    // the MacBook while it types, the monitor while something runs, the mug
    // while it drinks; now and then a glance at the other screen, and at the
    // window when the sky starts to change
    if (t > gaze.next && coder.phase === PHASES.TYPING) {
      gaze.glance = coder.daylight > 0.2 && Math.sin(t * 7.1) > 0 ? 'window' : Math.sin(t * 3.3) > 0 ? 'app' : 'terminal';
      gaze.until = t + 0.8;
      gaze.next = t + 5 + (Math.sin(t * 1.9) * 0.5 + 0.5) * 6;
    }
    const id = t < gaze.until ? gaze.glance : coder.gaze;
    if (coder.phase === PHASES.SIPPING && coder.mugLift > 0.4 && coffeeRef.current) gaze.want.set(...coffeeRef.current);
    else if (coder.phase === PHASES.TYPING && t >= gaze.until) gaze.want.set(...GAZE.laptop);
    else gaze.want.set(...(GAZE[id] ?? GAZE.laptop));
    gaze.want.y += Math.sin(t * 1.1) * 0.01;
    if (!gaze.ready) { gaze.at.copy(gaze.want); gaze.ready = true; }
    gaze.at.lerp(gaze.want, 1 - Math.exp(-dt * 7));
    gaze.out[0] = gaze.at.x; gaze.out[1] = gaze.at.y; gaze.out[2] = gaze.at.z;
    lookRef.current = gaze.out;

    sound.setArousal(coder.arousal, coder.collapse);
    cozy.update(coder, dt);

    // --- the camera -------------------------------------------------------------
    // a slow drift, a little parallax under the pointer, a jolt when the
    // giant fibre fires — none of it with reduced motion
    if (coder.phase !== lastPhase.current && lastPhase.current === PHASES.NODDING && coder.phase === PHASES.IDLE) shake.current = 0.7;
    lastPhase.current = coder.phase;
    shake.current = Math.max(0, shake.current - dt * 2.2);
    const p = pointer.current;
    const still = reduced.current ? 0 : 1;
    p.ax += (p.x * still - p.ax) * (1 - Math.exp(-dt * 3));
    p.ay += (p.y * still - p.ay) * (1 - Math.exp(-dt * 3));
    const k = shake.current * still;
    camera.position.set(
      base.x + (Math.sin(t * 0.13) * 0.035 + Math.sin(t * 29) * k * 0.02) * still - p.ax * 0.06,
      base.y + (Math.sin(t * 0.11) * 0.02 + Math.sin(t * 23) * k * 0.02) * still - p.ay * 0.04,
      base.z + (Math.cos(t * 0.09) * 0.035) * still + p.ax * 0.1,
    );
    camera.lookAt(target);
    let fov = codeCameraFov(size.width, size.height);
    // dev only: a fixed viewpoint for visual checks (tools/code-visual-fixture.js)
    if (import.meta.env.DEV && window.__codeCam) {
      camera.position.set(...window.__codeCam.position);
      camera.lookAt(...window.__codeCam.target);
      fov = window.__codeCam.fov ?? fov;
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

// ------------------------------------------------------------------ light

const WARM = new THREE.Color('#ffb56b');
const MOON = new THREE.Color('#7f94d6');
const DAWN = new THREE.Color('#ffae7a');
const SCREEN_BLUE = new THREE.Color('#9fb2ff');
const ERROR_RED = new THREE.Color('#ff5a4a');
const DEPLOY_GREEN = new THREE.Color('#7dffa0');

function Lights({ coder }) {
  const lamp = useRef();
  const window = useRef();
  const hemi = useRef();
  const screen = useRef();
  const laptop = useRef();
  const amb = useRef();
  const color = useMemo(() => new THREE.Color(), []);
  const lampTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.72, DESK.top, -0.22);
    return o;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const d = coder.daylight;
    const asleep = coder.phase === PHASES.ASLEEP ? coder.collapse : 0;
    if (window.current) {
      window.current.color.copy(MOON).lerp(DAWN, smooth01(d * 1.6)).lerp(WARM, Math.max(0, d - 0.7));
      window.current.intensity = 0.35 + d * 2.2;
    }
    if (hemi.current) {
      hemi.current.intensity = 0.28 + d * 0.5;
      hemi.current.color.copy(MOON).lerp(DAWN, d);
    }
    if (amb.current) amb.current.intensity = 0.16 + d * 0.25;
    if (lamp.current) lamp.current.intensity = (13 + Math.sin(t * 5.3) * 0.08) * (1 - d * 0.4);
    // the monitor lights the desk in its own colours: red on an error, green on a deploy
    const r = coder.lastResult;
    const fresh = r && coder.now() - r.at < 2500;
    color.copy(SCREEN_BLUE);
    if (coder.app.overlay || (fresh && /Fail|Error|conflict|rejected/.test(r.kind))) color.lerp(ERROR_RED, 0.55);
    else if (fresh && r.kind === 'deploy') color.lerp(DEPLOY_GREEN, 0.6);
    if (screen.current) { screen.current.color.lerp(color, 0.08); screen.current.intensity = 1.3 * (1 - asleep * 0.3); }
    if (laptop.current) laptop.current.intensity = 0.7 + coder.keyPulse * 0.08;
  });
  return (
    <>
      <ambientLight ref={amb} intensity={0.16} color="#ffd9b0" />
      <hemisphereLight ref={hemi} args={['#7f94d6', '#2a1a10', 0.28]} />
      {/* the desk lamp: the key light, warm, casting the shadows */}
      <spotLight
        ref={lamp}
        position={[0.46, 2.12, 0.28]}
        target={lampTarget}
        angle={0.72}
        penumbra={0.75}
        intensity={13}
        distance={4.5}
        decay={1.6}
        color="#ffb46a"
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-bias={-0.0004}
        shadow-camera-near={0.2}
        shadow-camera-far={5}
      />
      <primitive object={lampTarget} />
      {/* the window: moonlight, then the dawn */}
      <directionalLight ref={window} position={[-2.5, 3.2, -1.6]} intensity={0.35} color="#7f94d6" />
      {/* the screens on the fly */}
      <pointLight ref={screen} position={[0.62, 1.78, -0.1]} intensity={1.3} distance={2.4} decay={2} color="#9fb2ff" />
      <pointLight ref={laptop} position={[0.78, 1.46, -0.2]} intensity={0.7} distance={1.1} decay={2} color="#b8c6ff" />
    </>
  );
}

function CozyProbe() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.12;
    return () => { env.texture.dispose(); pmrem.dispose(); scene.environment = null; };
  }, [gl, scene]);
  return null;
}

// ------------------------------------------------------------------ the room

function Room() {
  const wall = useMemo(() => canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#6e5646'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,235,210' : '40,25,15'},${Math.random() * 0.05})`; ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
  }), []);
  const floor = useMemo(() => {
    const t = canvasTexture(1024, 1024, (ctx) => paintWood(ctx, { base: [92, 58, 36], seed: 9, planks: 8 }));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.5, 2.5);
    return t;
  }, []);
  const rug = useMemo(() => canvasTexture(512, 768, paintRug), []);
  useEffect(() => () => { wall.dispose(); floor.dispose(); rug.dispose(); }, [wall, floor, rug]);
  const { back, left, height, window: win } = ROOM;
  const zR = -3.2;               // how far the back wall runs to the right, out of shot
  const wallMat = <meshStandardMaterial map={wall} color="#b39a86" roughness={0.95} />;
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, 0, -0.8]} receiveShadow>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial map={floor} roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.1]} position={[1.55, 0.004, -0.15]} receiveShadow>
        <planeGeometry args={[1.7, 2.4]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      {/* the wall behind the desk, around the window */}
      <group>
        <mesh position={[back, height / 2, (win.z1 + left) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[left - win.z1, height]} />{wallMat}
        </mesh>
        <mesh position={[back, height / 2, (zR + win.z0) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[win.z0 - zR, height]} />{wallMat}
        </mesh>
        <mesh position={[back, win.y0 / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[win.z1 - win.z0, win.y0]} />{wallMat}
        </mesh>
        <mesh position={[back, (win.y1 + height) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[win.z1 - win.z0, height - win.y1]} />{wallMat}
        </mesh>
      </group>
      {/* the wall on the fly's left */}
      <mesh position={[(back + 4.5) / 2, height / 2, left]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[4.5 - back, height]} />{wallMat}
      </mesh>
      {/* skirting boards */}
      <mesh position={[back + 0.01, 0.05, (zR + left) / 2]}>
        <boxGeometry args={[0.02, 0.1, left - zR]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.6} />
      </mesh>
      <mesh position={[(back + 4.5) / 2, 0.05, left - 0.01]}>
        <boxGeometry args={[4.5 - back, 0.1, 0.02]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ the window

const RAIN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RAIN_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uLight;
  uniform float uAspect;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv = vec2(vUv.x * uAspect, vUv.y);
    float a = 0.0;
    // rain beyond the glass: thin streaks, three depths
    for (int l = 0; l < 3; l++) {
      float fl = float(l);
      float cols = 38.0 + fl * 26.0;
      vec2 g = vec2(uv.x * cols, uv.y * 2.2 + uTime * (1.6 + fl * 0.7) + fl * 3.1);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float r = hash(id + fl * 17.0);
      float streak = smoothstep(0.1, 0.0, abs(f.x - 0.5 + (r - 0.5) * 0.4)) * smoothstep(0.0, 0.25, f.y) * smoothstep(0.9, 0.45, f.y);
      a += streak * step(0.72, r) * (0.26 - fl * 0.06);
    }
    // drops on the glass, some of them sliding down
    vec2 dg = uv * vec2(18.0, 20.0);
    vec2 did = floor(dg);
    float dr = hash(did);
    float slide = dr > 0.9 ? fract(uTime * 0.07 + dr * 13.0) : 0.0;
    vec2 df = fract(dg) - 0.5 - vec2(hash(did + 1.7) - 0.5, hash(did + 3.1) - 0.5) * 0.5 + vec2(0.0, slide - 0.5) * step(0.9, dr);
    float d = length(df * vec2(1.0, 0.8));
    float drop = smoothstep(0.13, 0.07, d) * step(0.5, dr);
    float rim = smoothstep(0.12, 0.09, d) - smoothstep(0.09, 0.05, d);
    a += drop * 0.18 + rim * 0.25 * step(0.5, dr);
    // a trail behind the sliding ones
    a += step(0.9, dr) * smoothstep(0.05, 0.0, abs(fract(dg.x) - 0.5)) * step(fract(dg.y), slide) * 0.08;
    vec3 col = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.86, 0.72), uLight);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.7));
  }
`;

function Window({ coder }) {
  const { window: win, back } = ROOM;
  const w = win.z1 - win.z0, h = win.y1 - win.y0;
  const sky = useMemo(() => canvasTexture(512, Math.round(512 * h / w)), [w, h]);
  const rain = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLight: { value: 0 }, uAspect: { value: w / h } },
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
  }), [w, h]);
  const clock = useRef(1);
  useEffect(() => () => { sky.dispose(); rain.dispose(); }, [sky, rain]);
  useFrame((state, dt) => {
    rain.uniforms.uTime.value = state.clock.elapsedTime;
    rain.uniforms.uLight.value = coder.daylight;
    clock.current += dt;
    // the sky changes slowly: once a second is plenty, faster through the day's time-lapse
    if (clock.current < (coder.phase === PHASES.MORNING ? 0.1 : 1)) return;
    clock.current = 0;
    paintSky(sky.image.getContext('2d'), coder, state.clock.elapsedTime * 1000);
    sky.needsUpdate = true;
  });
  const zc = (win.z0 + win.z1) / 2, yc = (win.y0 + win.y1) / 2;
  const frame = { color: '#e8dccb', roughness: 0.6 };
  return (
    <group>
      {/* outside */}
      <mesh position={[back - 0.35, yc, zc]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[w * 1.6, h * 1.4]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      {/* the glass, with the rain on it */}
      <mesh position={[back - 0.01, yc, zc]} rotation={[0, Math.PI / 2, 0]} material={rain} renderOrder={3}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* frame, mullions, sill */}
      <group position={[back, yc, zc]}>
        {[[0, h / 2 + 0.03, w + 0.12, 0.06], [0, -h / 2 - 0.03, w + 0.12, 0.06]].map(([y, yy, ww, hh], i) => (
          <mesh key={`h${i}`} position={[0.02, yy, 0]} castShadow><boxGeometry args={[0.1, hh, ww]} /><meshStandardMaterial {...frame} /></mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={`v${sd}`} position={[0.02, 0, sd * (w / 2 + 0.03)]} castShadow><boxGeometry args={[0.1, h + 0.12, 0.06]} /><meshStandardMaterial {...frame} /></mesh>
        ))}
        <mesh position={[0.0, 0, 0]}><boxGeometry args={[0.05, h, 0.035]} /><meshStandardMaterial {...frame} /></mesh>
        <mesh position={[0.0, h * 0.12, 0]}><boxGeometry args={[0.05, 0.035, w]} /><meshStandardMaterial {...frame} /></mesh>
        <mesh position={[0.08, -h / 2 - 0.07, 0]} castShadow receiveShadow><boxGeometry args={[0.2, 0.035, w + 0.2]} /><meshStandardMaterial {...frame} /></mesh>
      </group>
      <Curtains />
    </group>
  );
}

/** Two linen curtains, folds and all, tied back either side of the window. */
function Curtains() {
  const { window: win, back } = ROOM;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.36, 1.5, 24, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      // gathered at the tie-back, a third of the way up
      const pinch = 1 - 0.45 * Math.exp(-((y + 0.2) ** 2) / 0.04);
      p.setX(i, x * pinch);
      p.setZ(i, Math.sin(x * 38) * 0.018 * pinch);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const top = win.y1 + 0.12;
  return (
    <group>
      <mesh position={[back + 0.06, top + 0.02, (win.z0 + win.z1) / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, win.z1 - win.z0 + 0.9, 10]} />
        <meshStandardMaterial color="#2e241c" roughness={0.4} metalness={0.6} />
      </mesh>
      {[win.z0 - 0.16, win.z1 + 0.16].map((z) => (
        <mesh key={z} geometry={geo} position={[back + 0.07, top - 0.75, z]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#c9b79a" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ fairy lights

const BULBS = 44;
function FairyLights() {
  const { curve, points } = useMemo(() => {
    const b = ROOM.back + 0.03;
    const knots = [
      [b, 2.78, -1.5], [b, 2.62, -1.05], [b, 2.78, -0.62], [b, 2.6, -0.1], [b, 2.8, 0.42], [b, 2.58, 0.92], [b, 2.74, 1.4],
      [0.55, 2.66, ROOM.left - 0.03], [1.05, 2.8, ROOM.left - 0.03], [1.6, 2.6, ROOM.left - 0.03], [2.1, 2.78, ROOM.left - 0.03],
    ].map((p) => new THREE.Vector3(...p));
    const c = new THREE.CatmullRomCurve3(knots, false, 'centripetal');
    return { curve: c, points: c.getSpacedPoints(BULBS - 1) };
  }, []);
  const wire = useMemo(() => new THREE.TubeGeometry(curve, 240, 0.0022, 5, false), [curve]);
  const bulbs = useRef();
  const glows = useRef();
  const glowTex = useMemo(() => canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,220,160,1)'); g.addColorStop(0.25, 'rgba(255,190,110,0.45)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const seeds = useMemo(() => points.map((_, i) => ({ f: 0.6 + ((i * 37) % 11) / 8, ph: (i * 2.39) % 6.28, warm: i % 5 === 0 })), [points]);
  const clock = useRef(0);
  useLayoutEffect(() => {
    points.forEach((p, i) => {
      dummy.position.copy(p).add(new THREE.Vector3(0, -0.012, 0));
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bulbs.current.setMatrixAt(i, dummy.matrix);
      glows.current.setMatrixAt(i, dummy.matrix);
    });
    bulbs.current.instanceMatrix.needsUpdate = true;
    glows.current.instanceMatrix.needsUpdate = true;
  }, [points, dummy]);
  useFrame((state, dt) => {
    clock.current += dt;
    if (clock.current < 1 / 12) return;
    clock.current = 0;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      // a slow breathing, and every so often one of them flickers
      const k = 0.78 + 0.22 * Math.sin(t * s.f + s.ph) - (Math.sin(t * 13 + i * 7) > 0.985 ? 0.4 : 0);
      color.set(s.warm ? '#ffb070' : '#ffe0a8').multiplyScalar(1.6 * k);
      bulbs.current.setColorAt(i, color);
      color.set('#ffc07a').multiplyScalar(k);
      glows.current.setColorAt(i, color);
    });
    bulbs.current.instanceColor.needsUpdate = true;
    glows.current.instanceColor.needsUpdate = true;
  });
  useEffect(() => () => { wire.dispose(); glowTex.dispose(); }, [wire, glowTex]);
  return (
    <group>
      <mesh geometry={wire}><meshStandardMaterial color="#3a3326" roughness={0.6} /></mesh>
      <instancedMesh ref={bulbs} args={[null, null, BULBS]}>
        <sphereGeometry args={[0.009, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* the glow: camera-facing quads, added */}
      <instancedMesh ref={glows} args={[null, null, BULBS]} renderOrder={4}>
        <planeGeometry args={[0.13, 0.13]} />
        <meshBasicMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <pointLight position={[ROOM.back + 0.25, 2.55, -0.9]} intensity={0.9} distance={1.8} decay={2} color="#ffb870" />
      <pointLight position={[ROOM.back + 0.25, 2.55, 0.7]} intensity={0.9} distance={1.8} decay={2} color="#ffb870" />
      <pointLight position={[1.2, 2.55, ROOM.left - 0.25]} intensity={0.8} distance={1.8} decay={2} color="#ffb870" />
    </group>
  );
}

// ------------------------------------------------------------------ the desk

function Desk() {
  const wood = useMemo(() => canvasTexture(1024, 512, (ctx) => paintWood(ctx, { base: [128, 80, 46], seed: 21 })), []);
  useEffect(() => () => wood.dispose(), [wood]);
  const { top, thickness, front, back, zMin, zMax } = DESK;
  const len = zMax - zMin, zMid = (zMin + zMax) / 2, depth = front - back;
  return (
    <group>
      <RoundedBox args={[depth, thickness, len]} radius={0.012} smoothness={3} position={[(front + back) / 2, top - thickness / 2, zMid]} castShadow receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.55} />
      </RoundedBox>
      {/* legs, and a drawer unit on the right */}
      {[[back + 0.05, zMax - 0.06], [front - 0.05, zMax - 0.06]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (top - thickness) / 2, z]} castShadow>
          <boxGeometry args={[0.05, top - thickness, 0.05]} />
          <meshStandardMaterial color="#4a2e1c" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[(front + back) / 2, (top - thickness) / 2, zMin + 0.22]} castShadow receiveShadow>
        <boxGeometry args={[depth - 0.04, top - thickness, 0.42]} />
        <meshStandardMaterial map={wood} color="#b89070" roughness={0.6} />
      </mesh>
      {[0.3, 0.62, 0.94].map((y) => (
        <mesh key={y} position={[front - 0.015, y, zMin + 0.22]}>
          <boxGeometry args={[0.012, 0.02, 0.12]} />
          <meshStandardMaterial color="#c9a56a" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A cozy desk chair, where the stool stood: a deep cushioned seat at the
 * stool's height, a padded back reclined behind the wings, on a five-star
 * base. The back starts where the scan's folded wings end.
 */
function Chair() {
  const { center, depth, width, seatTop, back } = CHAIR;
  const fabric = { color: '#6f7d5c', roughness: 0.95 };
  const backH = back.y1 - back.y0;
  const legs = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2 + 0.3), []);
  return (
    <group>
      <RoundedBox args={[depth, 0.11, width]} radius={0.045} smoothness={4} position={[center[0], seatTop - 0.055, center[2]]} castShadow receiveShadow>
        <meshStandardMaterial {...fabric} />
      </RoundedBox>
      <group position={[back.x + back.thickness / 2, back.y0, center[2]]} rotation={[0, 0, -back.lean]}>
        <RoundedBox args={[back.thickness, backH, width * 0.94]} radius={0.04} smoothness={4} position={[0, backH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...fabric} />
        </RoundedBox>
        {/* a knitted throw over the back */}
        <mesh position={[0.05, backH * 0.72, 0.05]} rotation={[0, 0, 0.08]} castShadow>
          <boxGeometry args={[0.03, backH * 0.6, width * 0.62]} />
          <meshStandardMaterial color="#d8c2a0" roughness={1} />
        </mesh>
      </group>
      {/* the back's support, down to the seat */}
      <mesh position={[back.x + 0.02, seatTop - 0.05, center[2]]} castShadow>
        <boxGeometry args={[0.05, 0.14, 0.2]} />
        <meshStandardMaterial color="#1c1c1e" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* gas lift and star base */}
      <mesh position={[center[0], (seatTop - 0.11) / 2 + 0.05, center[2]]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, seatTop - 0.2, 16]} />
        <meshStandardMaterial color="#202022" roughness={0.3} metalness={0.8} />
      </mesh>
      {legs.map((a) => (
        <group key={a} position={[center[0], 0.075, center[2]]} rotation={[0, a, 0]}>
          <mesh position={[0.17, 0, 0]} castShadow>
            <boxGeometry args={[0.34, 0.03, 0.045]} />
            <meshStandardMaterial color="#1c1c1e" roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0.33, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.03, 12]} />
            <meshStandardMaterial color="#111" roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ the MacBook

const KEY_GEO = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const KEYBOARD = { w: 15 * 0.0184, v0: 0.0205 - 0.009, v1: 0.1129 + 0.009 };

/**
 * A 14-inch MacBook Pro in space black, procedural: base, keys, trackpad,
 * the lid on its hinge with the display and the notch. Nothing on the lid
 * but a sticker.
 */
function MacBook({ coder }) {
  const screenTex = useMemo(() => canvasTexture(1280, 832), []);
  const deckTex = useMemo(() => canvasTexture(1024, Math.round(1024 * MBP.depth / MBP.width), (ctx) => paintDeck(ctx, { w: MBP.width, d: MBP.depth }, KEYBOARD)), []);
  const legendTex = useMemo(() => canvasTexture(2048, Math.round(2048 * (KEYBOARD.v1 - KEYBOARD.v0 + 0.004) / KEYBOARD.w)), []);
  const lidTex = useMemo(() => canvasTexture(1024, Math.round(1024 * 0.2155 / MBP.width), paintLid), []);
  const keys = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastDown = useRef(null);
  const clock = useRef(0);
  const sig = useRef('');

  useLayoutEffect(() => {
    // the legends, in the keyboard's own frame
    const frame = { w: KEYBOARD.w, d: KEYBOARD.v1 - KEYBOARD.v0 + 0.004 };
    const shifted = KEYS.map((k) => ({ ...k, x: k.x + MBP.depth / 2 - KEYBOARD.v0 - frame.d / 2 + 0.002 }));
    paintKeyLegends(legendTex.image.getContext('2d'), shifted, frame);
    legendTex.needsUpdate = true;
  }, [legendTex]);

  const placeKeys = (down) => {
    KEYS.forEach((k, i) => {
      const press = k.label === down ? 0.0011 : 0;
      dummy.position.set(k.x, DECK_Y + 0.0012 - press, k.z);
      dummy.scale.set(k.d, 0.0024, k.w);
      dummy.updateMatrix();
      keys.current.setMatrixAt(i, dummy.matrix);
    });
    keys.current.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => { placeKeys(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { screenTex.dispose(); deckTex.dispose(); legendTex.dispose(); lidTex.dispose(); }, [screenTex, deckTex, legendTex, lidTex]);

  useFrame((state, dt) => {
    if (coder.keyDown !== lastDown.current) { lastDown.current = coder.keyDown; placeKeys(coder.keyDown); }
    clock.current += dt;
    if (clock.current < 1 / 20) return;
    const now = state.clock.elapsedTime * 1000;
    const ed = coder.editor;
    // repaint only when something on it changed (the caret blinks twice a second)
    const s = `${ed.file}|${ed.line}|${ed.text.length}|${ed.junk.length}|${ed.problems.length}|${ed.completion ? 1 : 0}|${coder.phase}|${Math.floor(now / 530)}|${coder.scroll > 0.01 ? now : 0}|${ed.flash > 0 ? now : 0}|${coder.clock}|${ed.typo ? 1 : 0}`;
    if (s === sig.current) return;
    sig.current = s;
    clock.current = 0;
    paintEditor(screenTex.image.getContext('2d'), coder, now);
    screenTex.needsUpdate = true;
  });

  const { screen } = MBP;
  const lidH = screen.height + screen.bezelTop + screen.chin;
  const [x, y, z] = MACBOOK.position;
  const kbCenterX = -MBP.depth / 2 + (KEYBOARD.v0 + KEYBOARD.v1) / 2;
  const black = { color: '#2a2b2f', roughness: 0.38, metalness: 0.75 };
  return (
    <group position={[x, y, z]} rotation={[0, MACBOOK.yaw, 0]}>
      {/* base */}
      <RoundedBox args={[MBP.depth, MBP.base, MBP.width]} radius={0.004} smoothness={3} position={[0, MBP.base / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...black} />
      </RoundedBox>
      <mesh position={[0, MBP.base + 0.0002, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} receiveShadow>
        <planeGeometry args={[MBP.width - 0.004, MBP.depth - 0.004]} />
        <meshStandardMaterial map={deckTex} roughness={0.45} metalness={0.6} />
      </mesh>
      <instancedMesh ref={keys} args={[KEY_GEO, null, KEYS.length]} castShadow receiveShadow>
        <meshStandardMaterial color="#0e0e10" roughness={0.6} metalness={0.1} />
      </instancedMesh>
      {/* backlit legends */}
      <mesh position={[kbCenterX, DECK_Y + 0.0026, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} renderOrder={2}>
        <planeGeometry args={[KEYBOARD.w, KEYBOARD.v1 - KEYBOARD.v0 + 0.004]} />
        <meshBasicMaterial map={legendTex} transparent opacity={0.75} color="#ffe9cf" toneMapped={false} depthWrite={false} />
      </mesh>
      {/* trackpad */}
      <mesh position={[TRACKPAD.x, DECK_Y + 0.0003, TRACKPAD.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[TRACKPAD.d, TRACKPAD.w]} />
        <meshStandardMaterial color="#303135" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* the lid, on its hinge at the back */}
      <group position={[-MBP.depth / 2 + 0.003, MBP.base, 0]} rotation={[0, 0, MBP.lidTilt]}>
        <RoundedBox args={[MBP.lid, lidH, MBP.width]} radius={0.0025} smoothness={3} position={[-MBP.lid / 2, lidH / 2, 0]} castShadow>
          <meshStandardMaterial {...black} />
        </RoundedBox>
        {/* the glass front, the display in it */}
        <mesh position={[0.0002, lidH / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[MBP.width - 0.002, lidH - 0.002]} />
          <meshStandardMaterial color="#050506" roughness={0.12} metalness={0.2} />
        </mesh>
        <mesh position={[0.0004, screen.chin + screen.height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[screen.width, screen.height]} />
          <meshBasicMaterial map={screenTex} toneMapped={false} color="#e6e6e6" />
        </mesh>
        <mesh position={[0.0006, screen.chin + screen.height - MBP.notch.height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[MBP.notch.width, MBP.notch.height]} />
          <meshBasicMaterial color="#030303" />
        </mesh>
        {/* the back of the lid */}
        <mesh position={[-MBP.lid - 0.0002, lidH / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[MBP.width - 0.004, lidH - 0.004]} />
          <meshStandardMaterial map={lidTex} roughness={0.4} metalness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ the monitor

function Monitor({ coder }) {
  const tex = useMemo(() => canvasTexture(1600, 900), []);
  const notes = useMemo(() => [
    canvasTexture(128, 128, (ctx) => paintSticky(ctx, 'deploy\nfriday?\nNO', '#ffd966')),
    canvasTexture(128, 128, (ctx) => paintSticky(ctx, 'fix CI\n☕', '#ff9fb5')),
    canvasTexture(128, 128, (ctx) => paintSticky(ctx, 'sleep\n???', '#a8e6cf')),
  ], []);
  const clock = useRef(1);
  const sig = useRef('');
  useEffect(() => () => { tex.dispose(); notes.forEach((n) => n.dispose()); }, [tex, notes]);
  useFrame((state, dt) => {
    clock.current += dt;
    const ci = coder.ci;
    const running = ci && !ci.done;
    // five times a second, and at once when the terminal or the checks change
    const s = `${coder.terminal.length}|${coder.terminal[coder.terminal.length - 1]?.text}|${coder.app.overlay ? 1 : 0}|${coder.app.view}|${ci?.steps.map((x) => x.state).join('')}|${coder.task?.branch}`;
    if (s === sig.current && clock.current < (running || coder.app.reloaded > 0 ? 1 / 8 : 1 / 3)) return;
    sig.current = s;
    clock.current = 0;
    paintMonitor(tex.image.getContext('2d'), coder, state.clock.elapsedTime * 1000);
    tex.needsUpdate = true;
  });
  const { center, width, height, bezel, yaw, tilt } = MONITOR;
  const W = width + bezel * 2, H = height + bezel * 2;
  const standTop = center[1] - 0.05;
  return (
    <group>
      <group position={center} rotation={[0, Math.PI / 2 + yaw, 0]}>
        <group rotation={[tilt, 0, 0]}>
          <RoundedBox args={[W, H, 0.022]} radius={0.006} smoothness={3} castShadow>
            <meshStandardMaterial color="#1b1b1e" roughness={0.45} metalness={0.4} />
          </RoundedBox>
          <mesh position={[0, 0, 0.0112]}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={tex} toneMapped={false} color="#dadada" />
          </mesh>
          {/* sticky notes on the bezel */}
          {[[-W / 2 + 0.03, H / 2 - 0.035, 0.12], [W / 2 - 0.03, -H / 2 + 0.04, -0.08], [W / 2 - 0.085, -H / 2 + 0.03, 0.2]].map(([nx, ny, r], i) => (
            <mesh key={i} position={[nx, ny, 0.0125 + i * 0.0003]} rotation={[0, 0, r]}>
              <planeGeometry args={[0.06, 0.06]} />
              <meshStandardMaterial map={notes[i]} roughness={0.9} />
            </mesh>
          ))}
          {/* back and the stand's neck */}
          <mesh position={[0, -0.02, -0.03]} castShadow>
            <boxGeometry args={[0.16, 0.2, 0.04]} />
            <meshStandardMaterial color="#1b1b1e" roughness={0.45} metalness={0.4} />
          </mesh>
        </group>
        <mesh position={[0, (DESK.top + standTop) / 2 - center[1], -0.07]} castShadow>
          <boxGeometry args={[0.05, standTop - DESK.top, 0.02]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, DESK.top + 0.004 - center[1], -0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.008, 0.18]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ the coffee

const MUG_PROFILE = (() => {
  const r = MUG.radius, h = MUG.height;
  return [
    [0, 0], [r * 0.86, 0], [r * 0.95, 0.004], [r, 0.014], [r * 1.01, h * 0.6], [r * 1.02, h], [r * 0.93, h], [r * 0.92, h * 0.6], [r * 0.9, 0.012], [0, 0.012],
  ].map(([x, y]) => new THREE.Vector2(x, y));
})();

function Mug({ coder, coffeeRef }) {
  const group = useRef();
  const coffee = useRef();
  const pose = useMemo(() => ({ base: [0, 0, 0], yaw: 0, handle: [0, 0, 0] }), []);
  const geo = useMemo(() => new THREE.LatheGeometry(MUG_PROFILE, 40), []);
  const surface = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    mugPose(smooth01(coder.mugLift), pose);
    const g = group.current;
    if (!g) return;
    g.position.set(...pose.base);
    g.rotation.set(0, pose.yaw, 0);
    // tipped towards the mouth as it empties
    g.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -coder.mugTilt * 0.55);
    const f = clamp01(coder.fill);
    const level = 0.014 + f * (MUG.height - 0.026);
    if (coffee.current) {
      coffee.current.visible = f > 0.01;
      coffee.current.position.y = level;
      const r = MUG.radius * (0.9 + 0.02 * (level / MUG.height));
      // the disc lies in its own XY plane, turned flat: scale X and Y, not Z
      coffee.current.scale.set(r, r, 1);
    }
    surface.set(0, level, 0);
    g.localToWorld(surface);
    coffeeRef.current = [surface.x, surface.y, surface.z];
  });
  return (
    <group ref={group}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#e9e1d3" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[MUG.radius + 0.004, MUG.height * 0.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.024, 0.0065, 12, 24, Math.PI]} />
        <meshStandardMaterial color="#e9e1d3" roughness={0.35} />
      </mesh>
      {/* a band of colour: POKYH indigo */}
      <mesh position={[0, MUG.height * 0.35, 0]}>
        <cylinderGeometry args={[MUG.radius * 1.012, MUG.radius * 1.008, 0.014, 40, 1, true]} />
        <meshStandardMaterial color="#5b54c9" roughness={0.4} />
      </mesh>
      <mesh ref={coffee} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="#2a160b" roughness={0.15} metalness={0.1} />
      </mesh>
      <Steam coder={coder} />
    </group>
  );
}

/** Steam off the coffee: a few soft puffs rising and fading, fewer as it cools. */
function Steam({ coder }) {
  const refs = useRef([]);
  const tex = useMemo(() => canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }), []);
  const heat = useRef(1);
  const lastRefill = useRef(0);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    // fresh from the press it steams hard; it cools over the next hour of the night
    if (coder.refilling > 0) { heat.current = 1; lastRefill.current = t; }
    heat.current = Math.max(0.25, heat.current - dt * 0.004);
    const on = coder.fill > 0.02 ? heat.current : 0;
    refs.current.forEach((s, i) => {
      if (!s) return;
      const k = (t * 0.28 + i / refs.current.length) % 1;
      s.position.set(Math.sin(t * 0.9 + i * 2.1) * 0.012 * (1 + k), MUG.height + 0.01 + k * 0.16, Math.cos(t * 0.7 + i) * 0.01 * (1 + k));
      const sc = 0.035 + k * 0.07;
      s.scale.set(sc, sc * 1.3, 1);
      s.material.opacity = Math.sin(k * Math.PI) * 0.22 * on;
      s.material.rotation = t * 0.3 + i;
    });
  });
  return (
    <group>
      {Array.from({ length: 7 }, (_, i) => (
        <sprite key={i} ref={(el) => { refs.current[i] = el; }}>
          <spriteMaterial map={tex} transparent depthWrite={false} opacity={0} color="#fff4ea" />
        </sprite>
      ))}
    </group>
  );
}

/** The French press. When the mug is empty it pours another. */
function FrenchPress({ coder }) {
  const group = useRef();
  const stream = useRef();
  const level = useRef(0.8);
  const { base, height, radius } = PRESS;
  useFrame((_, dt) => {
    const r = coder.refilling;       // 1 -> 0 while it pours
    const k = r > 0 ? Math.sin((1 - r) * Math.PI) : 0;
    const g = group.current;
    if (g) {
      // up, over the mug, tipped
      const to = [MUG.base[0] - 0.02 - base[0], 0.16, MUG.base[2] - 0.1 - base[2]];
      g.position.set(base[0] + to[0] * k, base[1] + to[1] * k, base[2] + to[2] * k);
      g.rotation.set(-0.95 * smooth01(k * 1.4), 0, 0);
    }
    if (r > 0) level.current = Math.max(0.12, level.current - dt * 0.05);
    if (stream.current) {
      stream.current.visible = k > 0.55;
      stream.current.position.set(MUG.base[0], MUG.base[1] + 0.13, MUG.base[2]);
    }
  });
  const glass = { color: '#dfe8f0', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22 };
  const steel = { color: '#c8c8cc', roughness: 0.25, metalness: 0.9 };
  return (
    <group>
      <group ref={group} position={base}>
        <mesh position={[0, height * 0.42, 0]} renderOrder={2}>
          <cylinderGeometry args={[radius, radius, height * 0.8, 32, 1, true]} />
          <meshStandardMaterial {...glass} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, height * 0.42 * 0.8 * 0.5 + 0.01, 0]} scale={[1, 1, 1]}>
          <cylinderGeometry args={[radius * 0.94, radius * 0.94, height * 0.55, 28]} />
          <meshStandardMaterial color="#1e0f06" roughness={0.3} transparent opacity={0.92} />
        </mesh>
        <mesh position={[0, 0.006, 0]} castShadow><cylinderGeometry args={[radius * 1.08, radius * 1.1, 0.012, 32]} /><meshStandardMaterial {...steel} /></mesh>
        <mesh position={[0, height * 0.84, 0]} castShadow><cylinderGeometry args={[radius * 1.06, radius * 1.06, 0.02, 32]} /><meshStandardMaterial {...steel} /></mesh>
        <mesh position={[0, height * 0.97, 0]} castShadow><cylinderGeometry args={[0.004, 0.004, 0.1, 8]} /><meshStandardMaterial {...steel} /></mesh>
        <mesh position={[0, height * 1.02, 0]} castShadow><sphereGeometry args={[0.014, 16, 12]} /><meshStandardMaterial color="#1a1a1a" roughness={0.4} /></mesh>
        <mesh position={[0, height * 0.45, radius + 0.03]} castShadow>
          <torusGeometry args={[0.035, 0.008, 10, 20, Math.PI]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
        </mesh>
      </group>
      <mesh ref={stream} visible={false}>
        <cylinderGeometry args={[0.004, 0.006, 0.12, 8]} />
        <meshStandardMaterial color="#2a1508" roughness={0.2} />
      </mesh>
    </group>
  );
}

/**
 * The proboscis, as at the bar: out of the mouthparts, wherever the turned
 * head has put them, down into the coffee.
 */
function Proboscis({ coder, mouthRef, coffeeRef }) {
  const stalk = useRef();
  const tip = useRef();
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const m = mouthRef.current;
    const c = coffeeRef.current;
    const e = coder.extend;
    const on = !!m && !!c && e > 0.02 && coder.mugLift > 0.5;
    if (stalk.current) stalk.current.visible = on;
    if (tip.current) tip.current.visible = on;
    if (!on) return;
    from.set(m[0], m[1], m[2]);
    to.set(c[0], c[1] - 0.004, c[2]);
    dir.subVectors(to, from);
    const len = Math.max(0.001, dir.length() * e);
    dir.normalize();
    stalk.current.position.copy(from).addScaledVector(dir, len / 2);
    stalk.current.quaternion.setFromUnitVectors(up, dir);
    stalk.current.scale.set(1, len, 1);
    tip.current.position.copy(from).addScaledVector(dir, len);
  });
  return (
    <group>
      <mesh ref={stalk} visible={false}>
        <cylinderGeometry args={[0.008, 0.013, 1, 12]} />
        <meshPhysicalMaterial color="#b0621c" roughness={0.45} transmission={0.2} thickness={0.02} />
      </mesh>
      <mesh ref={tip} visible={false} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.013, 16, 12]} />
        <meshPhysicalMaterial color="#c47327" roughness={0.5} transmission={0.2} thickness={0.02} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ Poly Haven

function Prop({ url, position, rotation = [0, 0, 0], scale = 1, shadows = true, tweak }) {
  const { scene } = useGLTF(url, '/draco/');
  const root = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadows;
      o.receiveShadow = true;
    });
    tweak?.(r);
    return r;
  }, [scene, shadows, tweak]);
  return <primitive object={root} position={position} rotation={rotation} scale={scale} />;
}

const MODELS = {
  lamp: '/models/ph-desk-lamp.glb',
  plantTall: '/models/ph-plant-tall.glb',
  plantSmall: '/models/ph-plant-small.glb',
  shelf: '/models/ph-shelf.glb',
  books: '/models/ph-books.glb',
  clock: '/models/ph-wall-clock.glb',
};

/** The lamp's bulb glows. */
const lampTweak = (root) => {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (/light/i.test(m.name)) {
        const glow = m.clone();
        glow.emissive = new THREE.Color('#ffd49a');
        glow.emissiveIntensity = 3;
        glow.toneMapped = false;
        o.material = glow;
      }
    });
  });
};

/** The wall clock keeps the game's time: its hands are separate nodes in the model. */
function WallClock({ coder }) {
  const { scene } = useGLTF(MODELS.clock, '/draco/');
  const { root, hands } = useMemo(() => {
    const r = scene.clone(true);
    const h = {};
    r.traverse((o) => {
      if (/hours_hand/.test(o.name)) h.hour = o;
      else if (/minute_hand/.test(o.name)) h.minute = o;
      else if (/second_hand/.test(o.name)) h.second = o;
      if (o.isMesh) o.receiveShadow = true;
    });
    return { root: r, hands: h };
  }, [scene]);
  useFrame(() => {
    const m = coder.clockMin;
    // the hands turn about the clock's face normal, +Z in the model
    if (hands.hour) hands.hour.rotation.z = -((m / 60) % 12) / 12 * Math.PI * 2;
    if (hands.minute) hands.minute.rotation.z = -(m % 60) / 60 * Math.PI * 2;
    if (hands.second) hands.second.rotation.z = -((m * 60) % 60) / 60 * Math.PI * 2;
  });
  return <primitive object={root} position={[ROOM.back + 0.005, 2.42, 0.62]} rotation={[0, Math.PI / 2, 0]} scale={0.9} />;
}

function Furniture({ coder }) {
  const books = useMemo(() => {
    let seed = 4;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return [0.12, 0.52, 0.93, 1.33].map((y, i) => ({ y, z: -0.46 + rnd() * 0.3, flip: i % 2 === 0 }));
  }, []);
  const shelfAt = [1.05, 0, ROOM.left - 0.14];
  return (
    <group>
      <Prop url={MODELS.lamp} position={[0.4, DESK.top, 0.42]} rotation={[0, -1.2, 0]} scale={1.05} tweak={lampTweak} />
      <Prop url={MODELS.plantSmall} position={[0.34, DESK.top, -1.08]} rotation={[0, 0.6, 0]} scale={1.1} />
      <Prop url={MODELS.plantTall} position={[0.62, 0, -1.95]} rotation={[0, 2.2, 0]} scale={1.35} />
      <group position={shelfAt} rotation={[0, Math.PI, 0]}>
        <Prop url={MODELS.shelf} position={[0, 0, 0]} />
        {books.map((b, i) => (
          <Prop key={i} url={MODELS.books} position={[b.z, b.y + 0.4 * i * 0 + 0.012, 0.12]} rotation={[0, b.flip ? Math.PI : 0, 0]} scale={0.78} />
        ))}
      </group>
      <WallClock coder={coder} />
    </group>
  );
}

// ------------------------------------------------------------------ little things

function Posters() {
  const texs = useMemo(() => ({
    dolomites: canvasTexture(512, 720, (ctx) => paintPoster(ctx, 'dolomites')),
    fly: canvasTexture(512, 640, (ctx) => paintPoster(ctx, 'fly')),
    works: canvasTexture(400, 300, (ctx) => paintPoster(ctx, 'works')),
  }), []);
  useEffect(() => () => Object.values(texs).forEach((t) => t.dispose()), [texs]);
  const frame = (w, h, pos, rot, tex, color = '#2a1d14') => (
    <group position={pos} rotation={rot}>
      <mesh castShadow><boxGeometry args={[w + 0.04, h + 0.04, 0.02]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
      <mesh position={[0, 0, 0.0105]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} roughness={0.8} /></mesh>
    </group>
  );
  return (
    <group>
      {frame(0.5, 0.7, [2.05, 1.95, ROOM.left - 0.012], [0, Math.PI, 0], texs.dolomites)}
      {frame(0.36, 0.45, [2.62, 1.8, ROOM.left - 0.012], [0, Math.PI, 0], texs.fly, '#c9b48e')}
      {frame(0.28, 0.21, [ROOM.back + 0.012, 1.95, -1.62], [0, Math.PI / 2, 0], texs.works, '#b89a5a')}
    </group>
  );
}

/** A candle on the sill: a flame that flickers, and its light. */
function Candle() {
  const flame = useRef();
  const light = useRef();
  const at = [ROOM.back + 0.1, ROOM.window.y0 - 0.052, ROOM.window.z0 + 0.14];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = 0.85 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23.7) * 0.05 + Math.sin(t * 4.1) * 0.04;
    if (flame.current) { flame.current.scale.set(1, f, 1); flame.current.rotation.z = Math.sin(t * 3.3) * 0.08; }
    if (light.current) light.current.intensity = 0.55 * f;
  });
  return (
    <group position={at}>
      <mesh position={[0, 0.035, 0]} castShadow><cylinderGeometry args={[0.022, 0.024, 0.07, 20]} /><meshStandardMaterial color="#efe3cf" roughness={0.7} /></mesh>
      <mesh ref={flame} position={[0, 0.082, 0]}>
        <sphereGeometry args={[0.007, 12, 10]} />
        <meshBasicMaterial color="#ffc46a" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.1, 0]} intensity={0.55} distance={0.9} decay={2} color="#ff9a44" />
    </group>
  );
}

/** A little speaker playing lo-fi, its light pulsing with the beat. */
function Speaker() {
  const led = useRef();
  useFrame((state) => {
    const beat = (state.clock.elapsedTime * (78 / 60)) % 1;
    if (led.current) led.current.color.setScalar(0.4 + (beat < 0.12 ? 0.9 : 0.2));
  });
  return (
    <group position={[0.42, DESK.top, 0.72]} rotation={[0, -0.35, 0]}>
      <RoundedBox args={[0.12, 0.16, 0.11]} radius={0.01} smoothness={3} position={[0, 0.08, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#7a4d2c" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0.061, 0.085, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.04, 28]} />
        <meshStandardMaterial color="#2b2622" roughness={1} />
      </mesh>
      <mesh position={[0.061, 0.03, 0.035]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.004, 12]} />
        <meshBasicMaterial ref={led} color="#ffae5a" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ scene

function World({ coder, store, onTick }) {
  const gripTargetRef = useRef(REST_HAND_WORLD);
  const dopamineRef = useRef(0);
  const lookRef = useRef(null);
  const mouthRef = useRef(null);
  const coffeeRef = useRef(null);
  void store;
  return (
    <>
      <Lights coder={coder} />
      <Rig coder={coder} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} coffeeRef={coffeeRef} onTick={onTick} />
      <Room />
      <Window coder={coder} />
      <FairyLights />
      <Posters />
      <Desk />
      <Chair />
      <MacBook coder={coder} />
      <Monitor coder={coder} />
      <Mug coder={coder} coffeeRef={coffeeRef} />
      <FrenchPress coder={coder} />
      <Candle />
      <Speaker />
      <Furniture coder={coder} />
      <Fly
        machine={coder}
        gripTargetRef={gripTargetRef}
        dopamineRef={dopamineRef}
        lookRef={lookRef}
        mouthRef={mouthRef}
        mouthLocal={MOUTH_LOCAL}
      />
      <Proboscis coder={coder} mouthRef={mouthRef} coffeeRef={coffeeRef} />
      <ContactShadows position={[0, 0.003, 0]} opacity={0.55} scale={8} blur={2.6} far={3} resolution={1024} color="#0a0503" />
      <CozyProbe />
    </>
  );
}

export function CodeScene({ coder, store, onTick }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 5, 12);
      }}
    >
      <PerspectiveCamera makeDefault fov={CODE_CAMERA.fov} position={CODE_CAMERA.position} near={0.03} far={40} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World coder={coder} store={store} onTick={onTick} />
      </Suspense>
    </Canvas>
  );
}

Object.values(MODELS).forEach((url) => useGLTF.preload(url, '/draco/'));
void MOUTH; void KEY;
