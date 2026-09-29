/**
 * The pub table: the fly, spilled beer, a bottle and a pint far off, and a
 * swatter that comes down out of the lamp light.
 *
 * The swatter's shadow falls on the table before it lands — the key light is
 * nearly overhead on purpose, because a shadow sweeping in is part of what a
 * real fly sees. The fly is the same CT scan as everywhere in Fly Lab,
 * standing rather than sitting. The scene moves and tips the whole scan when
 * it walks and flies; its one rigged foreleg rubs its eye when it grooms and
 * dabs the beer while it drinks, and its proboscis reaches down into the
 * puddle. The last part of every swing plays in slow motion — the game and
 * the brain both, so what the giant fibre does is still what it would do.
 */
import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { StudioProbe } from './studio.jsx';
import {
  SWATTER, FLY_POSE, SWAT_CAMERA, ARENA, PUDDLES, inPuddle, MOUTH_LOCAL, EYE_RUB_LOCAL,
} from './swatLayout.js';
import { Table, BeerMat, Puddles, Bottle, Pint, BEER } from './swatProps.jsx';
import { PHASES, HAND } from '../game/swatter.js';
import { sound } from '../audio/audio.js';

const BG = new THREE.Color('#2a1a10');
const smoothstep = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------ the rig

function Rig({ game, lookRef, dopamineRef, rippleRef, onTick, onReady }) {
  const { camera } = useThree();
  const started = useRef(false);
  const target = useMemo(() => new THREE.Vector3(0, 0.4, 0), []);
  const blend = useRef(0);
  const uiClock = useRef(0);
  const lastLand = useRef(0);

  useFrame((state, realDt) => {
    // the fly is decoded and on screen: the loading screen can go
    if (!started.current) { started.current = true; onReady?.(); }
    game.updateTimeScale(Math.min(realDt, 0.05));
    game.update(realDt * game.timeScale);
    const f = game.fly;
    const h = game.hand;
    const t = state.clock.elapsedTime;
    dopamineRef.current = game.dopamine;

    // where its eyes go: the swatter when it is up there, otherwise ahead, or down into the beer
    const threat = h.phase === HAND.STALK || h.phase === HAND.HOVER || h.phase === HAND.SWING;
    if (threat && f.phase !== PHASES.STUNNED && f.phase !== PHASES.OUT) {
      lookRef.current = h.head.center;
    } else {
      const drinking = f.action === 'drink';
      const ahead = drinking ? 1.2 : 3;
      lookRef.current = [
        f.pos[0] + Math.sin(f.heading) * ahead,
        f.pos[1] + (drinking ? -0.7 : 0.25 + Math.sin(t * 0.7) * 0.2),
        f.pos[2] + Math.cos(f.heading) * ahead,
      ];
    }

    // ripples: where it landed in beer, and every so often while it drinks
    if (f.land > 0.95 && lastLand.current <= 0.95) {
      const p = PUDDLES.find((q) => inPuddle(q, f.pos[0], f.pos[2]) > 0);
      if (p) rippleRef.current = { puddle: p, x: f.pos[0], z: f.pos[2], at: t, size: 1 };
    }
    lastLand.current = f.land;
    if (f.action === 'drink' && (!rippleRef.current || t - rippleRef.current.at > 1.6)) {
      const m = [f.pos[0] + Math.sin(f.heading) * 0.45, f.pos[2] + Math.cos(f.heading) * 0.45];
      const p = PUDDLES.find((q) => inPuddle(q, m[0], m[1]) > 0);
      if (p) rippleRef.current = { puddle: p, x: m[0], z: m[1], at: t, size: 0.45 };
    }

    sound.setArousal?.(f.arousal, f.collapse);

    // The camera follows the fly. While the hand is up it drops lower and
    // backs off, looking across the table rather than down at it, so the
    // fly on the wood and the swatter hanging over it share the shot. In
    // slow motion it leans in.
    const up = threat || h.phase === HAND.IMPACT ? 1 : 0;
    blend.current += (up - blend.current) * Math.min(1, realDt * 1.4);
    const b = smoothstep(blend.current);
    const k = Math.min(1, realDt * 2.2);
    target.x += (f.pos[0] * SWAT_CAMERA.follow - target.x) * k;
    target.z += (f.pos[2] * SWAT_CAMERA.follow - target.z) * k;
    target.y = 0.4 + f.pos[1] * 0.4 + b * SWAT_CAMERA.threatLift;
    const slow = 1 - game.timeScale;
    const shake = h.shake;
    const o = SWAT_CAMERA.offset, q = SWAT_CAMERA.threatOffset;
    const near = 1 - slow * 0.18;
    // a drunk fly's world sways a little too
    const drift = f.sway * 0.25;
    camera.position.set(
      target.x + (o[0] + (q[0] - o[0]) * b) * near + Math.sin(t * 0.23) * (0.15 + drift) + Math.sin(t * 37) * shake * 0.14,
      target.y + (o[1] + (q[1] - o[1]) * b) * near + Math.sin(t * 0.17) * (0.08 + drift * 0.5) + Math.sin(t * 29) * shake * 0.12,
      target.z + (o[2] + (q[2] - o[2]) * b) * near + Math.sin(t * 43) * shake * 0.1,
    );
    camera.lookAt(target);
    if (drift) camera.rotateZ(Math.sin(t * 0.6) * drift * 0.05);
    const fov = SWAT_CAMERA.fov - slow * 4;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    uiClock.current += realDt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

/**
 * Pub light: one warm lamp nearly overhead (the key, with the shadows), a
 * low amber fill from the bar, and a cool rim from a window behind.
 */
function Lights({ game }) {
  const key = useRef();
  useFrame(() => {
    // the lamp dims a touch in slow motion, as if the moment held its breath
    if (key.current) key.current.intensity = 2.3 - (1 - game.timeScale) * 0.5;
  });
  return (
    <>
      <ambientLight intensity={0.25} color="#ffd9a8" />
      <hemisphereLight args={['#ffe3bb', '#3a1f0e', 0.55]} />
      <directionalLight
        ref={key}
        position={[2.5, 18, 4]}
        intensity={2.3}
        color="#ffdcae"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <pointLight position={[-9, 5, 8]} intensity={40} distance={30} decay={2} color="#ff9d4a" />
      <directionalLight position={[-6, 6, -14]} intensity={0.9} color="#9fc3ff" />
    </>
  );
}

// ---------------------------------------------------------- the swatter

/** The perforated head: square holes cut out by alpha, a solid rim. */
function useMeshTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    const n = 22, cell = 512 / n, hole = cell * 0.6;
    for (let i = 1; i < n - 1; i++) {
      for (let j = 1; j < n - 1; j++) {
        ctx.clearRect(i * cell + (cell - hole) / 2, j * cell + (cell - hole) / 2, hole, hole);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
}

const RED = '#d8342a';
const RED_DARK = '#a82219';

/** The head, set on the handle so it lands flat: mesh, rim, and the collar that holds the wire. */
function SwatterHead({ mesh, ghost = false }) {
  const L = SWATTER.headLength, W = SWATTER.headWidth;
  if (ghost) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L, W]} />
        <meshBasicMaterial color={RED} map={mesh} alphaTest={0.5} transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    );
  }
  const rim = 0.09;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color={RED} map={mesh} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.5} />
      </mesh>
      {[[0, W / 2, L + rim, rim], [0, -W / 2, L + rim, rim], [L / 2, 0, rim, W], [-L / 2, 0, rim, W]].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0, z]} castShadow>
          <boxGeometry args={[sx, 0.1, sz]} />
          <meshStandardMaterial color={RED_DARK} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[-L / 2 - 0.25, 0.02, 0]} castShadow>
        <boxGeometry args={[0.6, 0.14, 0.8]} />
        <meshStandardMaterial color={RED_DARK} roughness={0.45} />
      </mesh>
    </group>
  );
}

/**
 * The swatter: a wire handle hinged at the wrist, a plastic grip with a hang
 * loop, the head. During the swing it leaves ghosts of where the head just
 * was; after impact it springs back off the table and settles.
 */
function Swatter({ game }) {
  const wristRef = useRef();
  const armRef = useRef();
  const ghostRefs = useRef([]);
  const trail = useRef([]);
  const mesh = useMeshTexture();
  const L = SWATTER.handle;
  const headHalf = SWATTER.headLength / 2;
  const GHOSTS = 4;
  useFrame(() => {
    const h = game.hand;
    const w = wristRef.current;
    if (!w) return;
    const yaw = Math.atan2(-h.u[1], h.u[0]);
    // a flexible head springs back off the table and settles
    let angle = h.angle;
    if (h.phase === HAND.IMPACT) angle += Math.abs(Math.sin(h.t * 34)) * Math.exp(-h.t * 9) * 0.07;
    w.position.set(h.wrist[0], h.wrist[1], h.wrist[2]);
    w.rotation.set(0, yaw, 0);
    armRef.current.rotation.z = angle;
    w.visible = h.wrist[1] < 21;

    // motion trail: where the head was over the last few frames of the swing
    const tr = trail.current;
    if (h.phase === HAND.SWING) tr.unshift({ p: h.wrist.slice(), yaw, angle });
    else tr.length = 0;
    if (tr.length > GHOSTS * 2) tr.length = GHOSTS * 2;
    ghostRefs.current.forEach((g, i) => {
      if (!g) return;
      const s = tr[(i + 1) * 2 - 1];
      g.visible = !!s;
      if (!s) return;
      g.position.set(s.p[0], s.p[1], s.p[2]);
      g.rotation.set(0, s.yaw, 0);
      g.children[0].rotation.z = s.angle;
    });
  });
  return (
    <group>
      <group ref={wristRef}>
        <group ref={armRef}>
          {/* the wire: two thin strands side by side, out to the head */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(L + 1.2) / 2, 0, s * 0.05]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, L - 1.2, 8]} />
              <meshStandardMaterial color="#d9dde2" roughness={0.25} metalness={0.9} />
            </mesh>
          ))}
          <mesh position={[1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.2, 0.24, 2.4, 20]} />
            <meshStandardMaterial color={RED} roughness={0.55} />
          </mesh>
          {/* ribs on the grip, and the loop it hangs from */}
          {[0.3, 0.7, 1.1, 1.5, 1.9].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.215, 0.03, 8, 20]} />
              <meshStandardMaterial color={RED_DARK} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[-0.3, 0, 0]}>
            <torusGeometry args={[0.28, 0.06, 8, 20]} />
            <meshStandardMaterial color={RED_DARK} roughness={0.5} />
          </mesh>
          {/* bent at the collar, where the wire ends */}
          <group position={[L, 0, 0]} rotation={[0, 0, -SWATTER.a0]}>
            <group position={[headHalf, 0, 0]}>
              <SwatterHead mesh={mesh} />
            </group>
          </group>
        </group>
      </group>
      {Array.from({ length: GHOSTS }, (_, i) => (
        <group key={i} ref={(g) => { ghostRefs.current[i] = g; }} visible={false}>
          <group>
            <group position={[L, 0, 0]} rotation={[0, 0, -SWATTER.a0]}>
              <group position={[headHalf, 0, 0]}>
                <SwatterHead mesh={mesh} ghost />
              </group>
            </group>
          </group>
        </group>
      ))}
      <ImpactFx game={game} />
    </group>
  );
}

/**
 * Impact: a shock ring racing out over the wood, and a burst of droplets —
 * beer if the blow landed in a puddle, crumbs and dust if it did not.
 */
function ImpactFx({ game }) {
  const ringRef = useRef();
  const ring2Ref = useRef();
  const dropsRef = useRef();
  const N = 70;
  const parts = useMemo(() => Array.from({ length: N }, () => ({ p: [0, 0, 0], v: [0, 0, 0], s: 0 })), []);
  const state = useRef({ at: null, wet: false, age: 0, c: [0, 0, 0] });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, realDt) => {
    const h = game.hand;
    const s = state.current;
    const dt = realDt * game.timeScale;
    if (h.impactAt !== null && h.impactAt !== s.at) {
      // a new blow: throw the particles out from under the rim
      s.at = h.impactAt;
      s.age = 0;
      const c = h.head.center;
      s.c = c.slice();
      s.wet = PUDDLES.some((p) => inPuddle(p, c[0], c[2]) > -SWATTER.headWidth / 2);
      let seed = Math.floor(h.impactAt * 1000) % 2147483646 + 1;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      parts.forEach((q) => {
        const a = rnd() * Math.PI * 2;
        const r = 1.6 + rnd() * 1.2;
        q.p = [c[0] + Math.cos(a) * r, 0.1, c[2] + Math.sin(a) * r];
        const sp = 3 + rnd() * 6;
        q.v = [Math.cos(a) * sp, 2 + rnd() * 6, Math.sin(a) * sp];
        q.s = (s.wet ? 0.05 : 0.03) + rnd() * 0.06;
      });
      if (dropsRef.current) dropsRef.current.material.color.set(s.wet ? BEER : '#c9b08a');
    }
    if (s.at === null) return;
    s.age += dt;
    const k = s.age / 0.6;
    [ringRef.current, ring2Ref.current].forEach((ring, i) => {
      if (!ring) return;
      const kk = Math.max(0, k - i * 0.25);
      ring.visible = kk > 0 && kk < 1;
      if (!ring.visible) return;
      ring.position.set(s.c[0], 0.05, s.c[2]);
      ring.scale.setScalar(2.2 + kk * (6 + i * 3));
      ring.material.opacity = (1 - kk) * (i ? 0.25 : 0.45);
    });
    const inst = dropsRef.current;
    if (!inst) return;
    const alive = s.age < 1.4;
    inst.visible = alive;
    if (!alive) return;
    const fade = Math.max(0, 1 - Math.max(0, s.age - 0.8) / 0.6);
    parts.forEach((q, i) => {
      if (q.p[1] > 0.02) {
        q.v[1] -= 22 * dt;
        q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
        if (q.p[1] < 0.02) { q.p[1] = 0.02; q.v = [0, 0, 0]; }
      }
      dummy.position.set(q.p[0], q.p[1], q.p[2]);
      // in the air a drop is round; on the wood it spreads flat
      dummy.scale.set(q.s * fade, q.s * fade * (q.p[1] > 0.03 ? 1.4 : 0.35), q.s * fade);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial color="#fff0d0" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.95, 1, 64]} />
        <meshBasicMaterial color="#fff0d0" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <instancedMesh ref={dropsRef} args={[null, null, N]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={BEER} roughness={0.15} />
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------------ the fly

/** A fan of beating wing, painted once: bright at the hinge, gone at the tip. */
function useWingTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(0, 128, 4, 0, 128, 250);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.55, 'rgba(235,240,255,0.35)');
    g.addColorStop(1, 'rgba(235,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.arc(0, 128, 250, -1.15, 1.15);
    ctx.closePath();
    ctx.fill();
    // the strokes the eye catches in a blur
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) {
      const a = -1 + i * 0.4;
      ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(Math.cos(a) * 240, 128 + Math.sin(a) * 240); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** The wings, a blur while they beat: in flight, and raised for the takeoff. */
function WingBlur({ fly }) {
  const ref = useRef();
  const mats = useRef([]);
  const planes = useRef([]);
  const tex = useWingTexture();
  useFrame((state) => {
    const on = fly.wings;
    if (ref.current) ref.current.visible = on > 0.02;
    if (on <= 0.02) return;
    const t = state.clock.elapsedTime;
    mats.current.forEach((m) => { if (m) m.opacity = on * (0.55 + Math.abs(Math.sin(t * 131)) * 0.35); });
    // the stroke plane rocks a little, the way a real blur shimmers
    planes.current.forEach((p, i) => { if (p) p.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(t * 57) * 0.08); });
  });
  return (
    <group ref={ref} visible={false}>
      {[-1, 1].map((s, i) => (
        <group key={s} position={[s * 0.18, 1.1, 0.05]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <mesh ref={(p) => { planes.current[i] = p; }} rotation={[-Math.PI / 2, 0, 0.25]}>
            <planeGeometry args={[1.5, 1.5]} />
            <meshBasicMaterial ref={(m) => { mats.current[i] = m; }} map={tex} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The proboscis: from the mouthparts, wherever the turned head put them, down into the beer. */
function Proboscis({ fly, mouthRef }) {
  const stalk = useRef();
  const tip = useRef();
  const v = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const m = mouthRef.current;
    const e = fly.proboscis;
    const on = !!m && e > 0.03 && fly.phase === PHASES.GROUND;
    stalk.current.visible = on;
    tip.current.visible = on;
    if (!on) return;
    v.from.set(m[0], m[1], m[2]);
    // straight down and a little forward, onto the surface of the beer
    v.to.set(m[0] + Math.sin(fly.heading) * 0.08, 0.05, m[2] + Math.cos(fly.heading) * 0.08);
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
        <cylinderGeometry args={[0.022, 0.03, 1, 12]} />
        <meshStandardMaterial color="#a8561a" roughness={0.45} />
      </mesh>
      <mesh ref={tip} visible={false} scale={[1.25, 0.6, 1.25]}>
        <sphereGeometry args={[0.04, 16, 12]} />
        <meshStandardMaterial color="#c06a26" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Stunned: little stars wheeling over its head. Passed out: z's drifting up. */
function Daze({ fly }) {
  const ref = useRef();
  const kids = useRef([]);
  const zTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff4d6';
    ctx.font = '800 54px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('z', 32, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useFrame((state) => {
    const g = ref.current;
    const stunned = fly.phase === PHASES.STUNNED;
    const out = fly.phase === PHASES.OUT;
    g.visible = stunned || out;
    if (!g.visible) return;
    const t = state.clock.elapsedTime;
    g.position.set(fly.pos[0], 1.05, fly.pos[2]);
    kids.current.forEach((k, i) => {
      if (!k) return;
      const star = i < 3;
      k.visible = star ? stunned : out;
      if (!k.visible) return;
      if (star) {
        const a = t * 3 + (i * Math.PI * 2) / 3;
        k.position.set(Math.cos(a) * 0.45, 0.1 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45);
        k.rotation.set(t * 4, t * 3, 0);
      } else {
        const life = (t * 0.45 + (i - 3) / 3) % 1;
        k.position.set(0.2 + life * 0.5, life * 1.3, Math.sin(life * 6) * 0.15);
        k.scale.setScalar(0.18 + life * 0.25);
        k.material.opacity = Math.sin(Math.PI * life);
      }
    });
  });
  return (
    <group ref={ref} visible={false}>
      {[0, 1, 2].map((i) => (
        <mesh key={`s${i}`} ref={(k) => { kids.current[i] = k; }}>
          <octahedronGeometry args={[0.07, 0]} />
          <meshBasicMaterial color="#ffd257" toneMapped={false} />
        </mesh>
      ))}
      {[3, 4, 5].map((i) => (
        <sprite key={`z${i}`} ref={(k) => { kids.current[i] = k; }}>
          <spriteMaterial map={zTex} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

function FlyOnTable({ game, lookRef, dopamineRef }) {
  const ref = useRef();
  const f = game.fly;
  const gripTargetRef = useRef([0, 0, 0]);
  const mouthRef = useRef(null);
  const tapPoint = useMemo(() => new THREE.Vector3(), []);
  // the point the foreleg rubs, re-read every frame after the head has turned
  const headPoints = useMemo(() => ({ local: [EYE_RUB_LOCAL], world: [[0, 0, 0]], after: null }), []);
  headPoints.after = () => {
    const g = ref.current;
    if (!g) return;
    if (f.leg === 'groom') {
      // small circles over the eye, the way flies wipe their heads
      const w = headPoints.world[0];
      const side = [Math.cos(f.heading), 0, -Math.sin(f.heading)];
      const a = f.legPhase;
      gripTargetRef.current = [
        w[0] + side[0] * Math.cos(a) * 0.05,
        w[1] + Math.sin(a) * 0.05,
        w[2] + side[2] * Math.cos(a) * 0.05,
      ];
    } else if (f.leg === 'tap') {
      // down into the beer in front of it
      tapPoint.set(-0.18 * FLY_POSE.scale, 0.03, 0.86 * FLY_POSE.scale);
      g.localToWorld(tapPoint);
      gripTargetRef.current = [tapPoint.x, tapPoint.y, tapPoint.z];
    }
  };
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(f.pos[0], f.pos[1], f.pos[2]);
    g.rotation.set(f.flight.pitch, f.heading, f.flight.roll, 'YXZ');
    // a landing squashes it for a moment
    g.scale.set(1 + f.land * 0.04, 1 - f.land * 0.08, 1 + f.land * 0.04);
  });
  return (
    <>
      <group ref={ref}>
        <Fly
          machine={f}
          lookRef={lookRef}
          dopamineRef={dopamineRef}
          pose={FLY_POSE}
          gripTargetRef={gripTargetRef}
          mouthRef={mouthRef}
          mouthLocal={MOUTH_LOCAL}
          headPoints={headPoints}
        />
        <group scale={FLY_POSE.scale}>
          <WingBlur fly={f} />
        </group>
      </group>
      <Proboscis fly={f} mouthRef={mouthRef} />
      <Daze fly={f} />
    </>
  );
}

// ----------------------------------------------------------------- scene

function World({ game, onTick, onReady }) {
  const lookRef = useRef(null);
  const dopamineRef = useRef(0);
  const rippleRef = useRef(null);
  return (
    <>
      <Lights game={game} />
      <Rig game={game} lookRef={lookRef} dopamineRef={dopamineRef} rippleRef={rippleRef} onTick={onTick} onReady={onReady} />
      <Table />
      <BeerMat />
      <Puddles rippleRef={rippleRef} />
      <Bottle />
      <Pint />
      <Swatter game={game} />
      <FlyOnTable game={game} lookRef={lookRef} dopamineRef={dopamineRef} />
      <ContactShadows
        position={[0, 0.006, 0]}
        opacity={0.55}
        scale={[ARENA.xMax - ARENA.xMin + 10, ARENA.zMax - ARENA.zMin + 10]}
        blur={1.4}
        far={2}
        resolution={1024}
        color="#140802"
      />
      <StudioProbe />
    </>
  );
}

export function SwatScene({ game, onTick, onReady }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 24, 60);
      }}
    >
      <PerspectiveCamera makeDefault fov={SWAT_CAMERA.fov} position={SWAT_CAMERA.offset} near={0.1} far={140} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World game={game} onTick={onTick} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
