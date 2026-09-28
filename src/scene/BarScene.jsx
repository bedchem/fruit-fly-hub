/**
 * The bar: the same fly, on the same stool, at a counter instead of a slot
 * machine.
 *
 * The supplied Old bar interior is aligned to the interaction coordinates.
 * The glass, stool and tin remain live props; one frame loop advances the
 * simulation without making React re-render the room every frame.
 */
import { Suspense, forwardRef, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { flyToWorld } from './layout.js';
import { HAND } from './flyRig.js';
import {
  BAR_CAMERA, BAR_FLY, COUNTER, GLASS, TIN, TIN_GRIP, STRAW_TIP, DRINK_GLASS_BASE, MOUTH_LOCAL, MOUTH, LIP_OFFSET,
} from './barLayout.js';
import { OldBar } from './OldBar.jsx';
import { StudioProbe } from './studio.jsx';
import { BarCamera } from './BarCamera.jsx';
import { PHASES, POUCH_WEAR_MIN } from '../game/bar.js';
import { sound } from '../audio/audio.js';

// render a frame by hand from the console while developing: a hidden tab gets
// no animation frames, so this is the only way to look at it there
if (import.meta.env.DEV) window.__advance = advance;

const REST_HAND_WORLD = flyToWorld(HAND, BAR_FLY);
const BG_AWAKE = new THREE.Color('#3b2d22');
const BG_ASLEEP = new THREE.Color('#15110e');
/** How many finished glasses and spent pouches stay on the counter. */
const MAX_EMPTIES = 9;
const MAX_SPENT = 12;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
/** Where it looks while a pouch goes in: up and out over the counter, not at its own chin. */
const LOOK_AHEAD = [GLASS.base[0] - 0.3, GLASS.base[1] + 0.42, GLASS.base[2] - 0.05];

// ------------------------------------------------------------------ the rig

function Rig({ bar, gripTargetRef, dopamineRef, lookRef, mouthRef, onTick }) {
  const { scene } = useThree();
  const gaze = useMemo(() => ({ want: new THREE.Vector3(), at: new THREE.Vector3(), out: [0, 0, 0], ready: false }), []);
  const uiClock = useRef(0);

  useFrame((state, dt) => {
    // last frame's mouth, after the head turned: where a pouch goes in
    if (mouthRef.current) bar.setMouth(mouthRef.current);
    bar.update(dt);
    gripTargetRef.current = bar.grip > 0.001 ? bar.handTarget : REST_HAND_WORLD;
    dopamineRef.current = bar.dopamine;

    // where the head goes: the glass while drinking, the pouch while carrying
    // it — but up and away once it is at the mouth, or the head would chase
    // its own chin — otherwise a slow wander between the glass and the room.
    // The head turns towards it rather than snapping.
    const t = state.clock.elapsedTime;
    const s = bar.phase === PHASES.POUCH ? bar.pouchStage : null;
    const atMouth = s === 'tuck' || s === 'release' || (s === 'lift' && bar.stageK > 0.45);
    if (bar.phase === PHASES.SIPPING && bar.lean > 0.05) gaze.want.set(...MOUTH);
    else if (atMouth) gaze.want.set(...LOOK_AHEAD);
    else if (bar.grip > 0.3) gaze.want.set(...bar.handTarget);
    else {
      const w = Math.sin(t * 0.13) * 0.5 + 0.5;
      gaze.want.set(GLASS.base[0] - 0.6 * w, GLASS.base[1] + 0.12 + 0.35 * w, GLASS.base[2] + (Math.sin(t * 0.21) * 0.6));
    }
    if (!gaze.ready) { gaze.at.copy(gaze.want); gaze.ready = true; }
    gaze.at.lerp(gaze.want, 1 - Math.exp(-dt * 8));
    gaze.out[0] = gaze.at.x; gaze.out[1] = gaze.at.y; gaze.out[2] = gaze.at.z;
    lookRef.current = gaze.out;

    sound.setArousal(bar.arousal, bar.collapse);

    // the lights go down while it sleeps
    const night = bar.phase === PHASES.ASLEEP || bar.phase === PHASES.PASSED_OUT ? bar.collapse : 0;
    scene.background.copy(BG_AWAKE).lerp(BG_ASLEEP, night * 0.85);
    scene.fog.color.copy(scene.background);

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

function Lights({ bar, dopamineRef }) {
  const key = useRef();
  const amb = useRef();
  const lamp = useRef();
  useFrame((state) => {
    const night = bar.phase === PHASES.ASLEEP || bar.phase === PHASES.PASSED_OUT ? bar.collapse : 0;
    const dim = 1 - night * 0.7;
    if (key.current) key.current.intensity = (1.9 + (dopamineRef.current ?? 0) * 0.6) * dim;
    if (amb.current) amb.current.intensity = 0.4 * dim;
    // the pendant over the counter breathes very slightly, like a real bulb
    if (lamp.current) lamp.current.intensity = (7 + Math.sin(state.clock.elapsedTime * 7.3) * 0.08) * dim;
  });
  return (
    <>
      <ambientLight ref={amb} intensity={0.4} color="#ffe2bd" />
      <hemisphereLight args={['#ffdcaa', '#3a2618', 0.55]} />
      <directionalLight
        ref={key}
        position={[4.5, 5.5, 1.2]}
        intensity={1.9}
        color="#ffe6c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-far={18}
        shadow-bias={-0.0006}
      />
      <pointLight ref={lamp} position={[0.62, 2.35, -0.05]} intensity={7} distance={3.2} decay={2} color="#ffb867" />
      <pointLight position={[-0.9, 1.9, -1.2]} intensity={2.2} distance={4} decay={2} color="#ff7a3d" />
    </>
  );
}

// ------------------------------------------------------------- the drink

/** A pint-ish glass profile, for the lathe. */
function glassProfile(h, rb, rt) {
  return [
    new THREE.Vector2(0, 0), new THREE.Vector2(rb, 0), new THREE.Vector2(rb + 0.002, 0.01),
    new THREE.Vector2(rt * 0.93, h * 0.72), new THREE.Vector2(rt, h * 0.9), new THREE.Vector2(rt * 0.985, h),
    new THREE.Vector2(rt * 0.95, h), new THREE.Vector2(rt * 0.94, h * 0.9), new THREE.Vector2(rt * 0.89, h * 0.72),
    new THREE.Vector2(rb - 0.004, 0.012), new THREE.Vector2(0, 0.012),
  ];
}

const GLASS_MAT = {
  color: '#ffffff', roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.5,
  transparent: true, opacity: 0.35,
};

function Glass({ bar }) {
  const { base, height, radiusTop, radiusBottom } = GLASS;
  const group = useRef();
  const liquid = useRef();
  const foam = useRef();
  const bubbles = useRef();
  const geo = useMemo(() => new THREE.LatheGeometry(glassProfile(height, radiusBottom, radiusTop), 40), [height, radiusBottom, radiusTop]);
  const inner = radiusBottom - 0.005;
  const innerTop = radiusTop * 0.9;
  const fullH = height * 0.86;
  const bubbleSeeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    a: (i * 2.39996) % (Math.PI * 2), r: 0.3 + ((i * 37) % 10) / 16, s: 0.6 + ((i * 13) % 7) / 10, o: i / 14,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const f = clamp01(bar.fill);
    const lift = smooth01(bar.glassLift);
    const tilt = smooth01(bar.glassTilt);
    const h = Math.max(0.0005, fullH * f);
    if (group.current) {
      group.current.position.set(
        base[0] + (DRINK_GLASS_BASE[0] - base[0]) * lift,
        base[1] + (DRINK_GLASS_BASE[1] - base[1]) * lift,
        base[2] + (DRINK_GLASS_BASE[2] - base[2]) * lift,
      );
      group.current.rotation.z = -0.62 * tilt;
    }
    if (liquid.current) {
      liquid.current.scale.set(1, h / fullH, 1);
      liquid.current.position.y = 0.012 + h / 2;
      liquid.current.visible = f > 0.01;
    }
    if (foam.current) {
      const r = inner + (innerTop - inner) * (h / fullH);
      foam.current.scale.set(r / innerTop, 1, r / innerTop);
      foam.current.position.y = 0.012 + h + 0.006;
      foam.current.visible = f > 0.01;
    }
    if (bubbles.current) {
      const t = state.clock.elapsedTime;
      bubbleSeeds.forEach((b, i) => {
        const k = (t * 0.25 * b.s + b.o) % 1;
        const y = 0.02 + k * h * 0.95;
        const rr = inner * b.r * 0.8;
        dummy.position.set(Math.cos(b.a) * rr, y, Math.sin(b.a) * rr);
        dummy.scale.setScalar(f > 0.02 ? 1 : 0);
        dummy.updateMatrix();
        bubbles.current.setMatrixAt(i, dummy.matrix);
      });
      bubbles.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} position={base}>
      <mesh geometry={geo} castShadow renderOrder={2}>
        <meshPhysicalMaterial {...GLASS_MAT} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={liquid} position={[0, fullH / 2, 0]}>
        <cylinderGeometry args={[innerTop, inner, fullH, 32]} />
        <meshPhysicalMaterial color="#e39a2a" roughness={0.15} transmission={0.45} thickness={0.05}
          emissive="#8a4b08" emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={foam} position={[0, fullH, 0]}>
        <cylinderGeometry args={[innerTop, innerTop, 0.014, 32]} />
        <meshStandardMaterial color="#fbf3e4" roughness={0.9} />
      </mesh>
      <instancedMesh ref={bubbles} args={[null, null, bubbleSeeds.length]}>
        <sphereGeometry args={[0.0016, 6, 5]} />
        <meshStandardMaterial color="#fff3cf" roughness={0.2} />
      </instancedMesh>
      <mesh position={[0, -0.003, 0]} receiveShadow>
        <cylinderGeometry args={[0.058, 0.058, 0.006, 32]} />
        <meshStandardMaterial color="#e8dcc4" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Finished glasses, lined up down the counter: the tab, made visible. */
function Empties({ bar }) {
  const refs = useRef([]);
  const geo = useMemo(() => new THREE.LatheGeometry(glassProfile(GLASS.height, GLASS.radiusBottom, GLASS.radiusTop), 28), []);
  useFrame(() => {
    const n = Math.min(MAX_EMPTIES, bar.beers);
    refs.current.forEach((m, i) => { if (m) m.visible = i < n; });
  });
  return (
    <group>
      {Array.from({ length: MAX_EMPTIES }, (_, i) => {
        const row = Math.floor(i / 5);
        const z = GLASS.base[2] + 0.2 + (i % 5) * 0.11 + row * 0.05;
        const x = GLASS.base[0] - 0.1 - row * 0.11;
        return (
          <group key={i} ref={(el) => { refs.current[i] = el; }} position={[x, COUNTER.top, z]} visible={false}>
            <mesh geometry={geo} renderOrder={2}>
              <meshPhysicalMaterial {...GLASS_MAT} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* the lacing a finished beer leaves */}
            <mesh position={[0, 0.012, 0]}>
              <cylinderGeometry args={[GLASS.radiusBottom - 0.006, GLASS.radiusBottom - 0.006, 0.004, 20]} />
              <meshStandardMaterial color="#d8a348" roughness={0.3} transparent opacity={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------ the pouches

const POUCH_SIZE = [0.03, 0.007, 0.016];
/** One soft pillow, shared by every pouch in the bar: rounded, not a brick. */
const POUCH_GEO = new RoundedBoxGeometry(...POUCH_SIZE, 3, 0.0032);
const FRESH = new THREE.Color('#f3efe6');
const USED = new THREE.Color('#a88a5c');
/** Pouches in a tin; after the last one there is a new tin. */
const TIN_COUNT = 7;
/** Where the pouch sits on the tarsus, and how it is held there. */
const HOLD = [0, -0.003, 0];
const CARRY_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.9, 0.25));
/** A second pouch in sits just behind the first. */
const STACK = [0.002, -0.008, -0.006];
const SPIT_S = 0.75;
const SPIT_POOL = 3;
const SPARKS = 16;

/**
 * The fresh pouches, fanned out in the open tin — ordered so the one nearest
 * the tarsus goes first. Positions are world space, rotations quaternions.
 */
const TIN_SLOTS = (() => {
  const [cx, cy, cz] = TIN.center;
  const slots = Array.from({ length: TIN_COUNT }, (_, i) => {
    const a = (i / TIN_COUNT) * Math.PI * 2;
    return {
      pos: [cx + Math.cos(a) * 0.017, cy + TIN.height + 0.004, cz + Math.sin(a) * 0.017],
      rot: [0.25, -a, 0],
    };
  });
  const d = (s) => Math.hypot(s.pos[0] - TIN_GRIP[0], s.pos[2] - TIN_GRIP[2]);
  return slots.sort((a, b) => d(a) - d(b)).map((s) => ({
    ...s, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...s.rot)),
  }));
})();

/** The spent pile on the napkin. */
const spentSlot = (i) => {
  const [x, y, z] = TIN.center;
  return [x - 0.075 + (i % 4) * 0.022, y + 0.006 + Math.floor(i / 8) * 0.006, z - 0.16 + Math.floor(i / 4) * 0.025];
};

const PouchMesh = forwardRef(function PouchMesh({ used = false, ...props }, ref) {
  return (
    <mesh ref={ref} geometry={POUCH_GEO} castShadow {...props}>
      <meshStandardMaterial color={used ? USED : FRESH} roughness={used ? 0.55 : 0.95} />
    </mesh>
  );
});

/** Under the lip, where the mouth is this frame. */
const lipPoint = (mouth, out) => out.set(
  mouth[0] + LIP_OFFSET[0] + HOLD[0], mouth[1] + LIP_OFFSET[1] + HOLD[1], mouth[2] + LIP_OFFSET[2] + HOLD[2],
);

/**
 * The tin, and every pouch's life: fanned out in the tin, lifted out onto the
 * tarsus, carried up, tucked in under the lip (where it follows the head and
 * slowly turns brown), and spat onto the napkin when it is spent.
 */
function Tin({ bar, mouthRef }) {
  const [x, y, z] = TIN.center;
  const lid = useRef();
  const fresh = useRef([]);
  const inHand = useRef();
  const tucked = useRef([]);
  const spent = useRef([]);
  const flyingRefs = useRef([]);
  const flights = useRef([]);
  const spentSeen = useRef(null);
  const landed = useRef({});
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const mouth = mouthRef.current ?? MOUTH;
    const { a, b } = scratch;

    if (lid.current) lid.current.rotation.z = 1.9 * bar.tinLid;

    // the tin empties one pouch at a time
    const taken = (bar.pouchCount % TIN_COUNT) + (bar.pouchInHand ? 1 : 0);
    fresh.current.forEach((m, i) => { if (m) m.visible = i >= taken; });

    // on the tarsus: lifted from its slot during the pinch, then carried flat
    const hand = inHand.current;
    if (hand) {
      hand.visible = bar.pouchInHand;
      if (bar.pouchInHand) {
        const slot = TIN_SLOTS[bar.pouchCount % TIN_COUNT];
        const h = bar.handTarget;
        b.set(h[0] + HOLD[0], h[1] + HOLD[1], h[2] + HOLD[2]);
        if (bar.pouchStage === 'pinch') {
          const k = bar.stageK * bar.stageK * (3 - 2 * bar.stageK);
          a.set(...slot.pos);
          hand.position.lerpVectors(a, b, k);
          hand.quaternion.slerpQuaternions(slot.q, CARRY_Q, k);
        } else {
          hand.position.copy(b);
          hand.quaternion.copy(CARRY_Q);
        }
      }
    }

    // in: the newest right under the lip, an older one just behind it
    const n = bar.pouches.length;
    tucked.current.forEach((m, i) => {
      if (!m) return;
      const p = bar.pouches[i];
      m.visible = !!p;
      if (!p) return;
      const back = n - 1 - i;
      lipPoint(mouth, m.position);
      m.position.x += STACK[0] * back;
      m.position.y += STACK[1] * back;
      m.position.z += STACK[2] * back;
      m.quaternion.copy(CARRY_Q);
      // it soaks through as it gives up its nicotine
      m.material.color.lerpColors(FRESH, USED, clamp01(p.age / POUCH_WEAR_MIN));
    });

    // spent: each new one is spat out and tumbles onto the napkin
    const total = bar.pouchCount - bar.pouches.length;
    if (spentSeen.current === null || total < spentSeen.current) {
      spentSeen.current = total;
      flights.current = [];
      landed.current = {};
    }
    while (spentSeen.current < total) {
      const idx = spentSeen.current++;
      lipPoint(mouth, a);
      flights.current.push({ slot: idx % MAX_SPENT, from: a.toArray(), t0: now + flights.current.length * 0.18 });
    }
    flights.current = flights.current.filter((f) => {
      if (now - f.t0 < SPIT_S) return true;
      landed.current[f.slot] = now;
      return false;
    });
    flyingRefs.current.forEach((m, i) => {
      if (!m) return;
      const f = flights.current[i];
      const k = f ? (now - f.t0) / SPIT_S : -1;
      m.visible = k >= 0 && k < 1;
      if (!m.visible) return;
      const to = spentSlot(f.slot);
      // out and a little up, then gravity
      const up = 0.09;
      m.position.set(
        f.from[0] + (to[0] - f.from[0]) * k,
        f.from[1] + up * k - (up + f.from[1] - to[1]) * k * k,
        f.from[2] + (to[2] - f.from[2]) * k,
      );
      const spin = (1 - k) * 7;
      m.rotation.set(spin, f.slot * 0.9 + spin * 0.6, spin * 0.4);
    });
    const onPile = Math.min(MAX_SPENT, total - flights.current.length);
    spent.current.forEach((m, i) => {
      if (!m) return;
      m.visible = i < onPile;
      const since = now - (landed.current[i] ?? -9);
      const hop = since < 0.3 ? 0.007 * Math.abs(Math.sin(since * Math.PI / 0.15)) * (1 - since / 0.3) : 0;
      m.position.y = spentSlot(i)[1] + hop;
    });
  });

  return (
    <group>
      <group position={[x, y, z]}>
        {/* the can */}
        <mesh position={[0, TIN.height / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[TIN.radius, TIN.radius, TIN.height, 40]} />
          <meshStandardMaterial color="#1d3c63" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, TIN.height + 0.0005, 0]}>
          <cylinderGeometry args={[TIN.radius * 0.93, TIN.radius * 0.93, 0.001, 40]} />
          <meshStandardMaterial color="#e8e3d6" roughness={0.9} />
        </mesh>
        {/* the lid, on its hinge at the back: the foreleg flips it, a spring shuts it */}
        <group ref={lid} position={[-TIN.radius, TIN.height, 0]}>
          <mesh position={[TIN.radius, 0.006, 0]} castShadow>
            <cylinderGeometry args={[TIN.radius * 1.02, TIN.radius * 1.02, 0.012, 40]} />
            <meshStandardMaterial color="#e2e8ef" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[TIN.radius, 0.0122, 0]}>
            <cylinderGeometry args={[TIN.radius * 0.72, TIN.radius * 0.72, 0.0006, 40]} />
            <meshStandardMaterial color="#1d3c63" roughness={0.4} metalness={0.3} />
          </mesh>
        </group>
      </group>
      {TIN_SLOTS.map((s, i) => (
        <PouchMesh key={i} ref={(el) => { fresh.current[i] = el; }} position={s.pos} quaternion={s.q} />
      ))}
      {/* spent ones, on a napkin */}
      <mesh position={[x - 0.04, y + 0.001, z - 0.13]} receiveShadow>
        <boxGeometry args={[0.12, 0.002, 0.12]} />
        <meshStandardMaterial color="#efe6d4" roughness={1} />
      </mesh>
      {Array.from({ length: MAX_SPENT }, (_, i) => (
        <PouchMesh
          key={i}
          used
          ref={(el) => { spent.current[i] = el; }}
          visible={false}
          position={spentSlot(i)}
          rotation={[0, i * 0.9, 0]}
        />
      ))}
      {Array.from({ length: SPIT_POOL }, (_, i) => (
        <PouchMesh key={i} used ref={(el) => { flyingRefs.current[i] = el; }} visible={false} />
      ))}
      <PouchMesh ref={inHand} visible={false} />
      {[0, 1].map((i) => <PouchMesh key={i} ref={(el) => { tucked.current[i] = el; }} visible={false} />)}
    </group>
  );
}

/**
 * The hit: a few bright specks drifting up from the lip as a pouch goes in,
 * more for the strong ones. Nicotine is felt at once, and this is that.
 */
function Tingle({ bar, mouthRef }) {
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const origin = useMemo(() => new THREE.Vector3(), []);
  const sparks = useRef([]);
  const seen = useRef(null);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (seen.current === null || bar.pouchCount < seen.current) {
      seen.current = bar.pouchCount;
      sparks.current = [];
    }
    if (bar.pouchCount > seen.current) {
      seen.current = bar.pouchCount;
      lipPoint(mouthRef.current ?? MOUTH, origin);
      const count = Math.round(SPARKS * bar.tingle);
      sparks.current = Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random();
        return {
          t0: now + Math.random() * 0.25,
          from: origin.toArray(),
          v: [Math.cos(a) * 0.05, 0.06 + Math.random() * 0.06, Math.sin(a) * 0.05],
          life: 0.7 + Math.random() * 0.5,
        };
      });
    }
    if (!mesh.current) return;
    for (let i = 0; i < SPARKS; i++) {
      const s = sparks.current[i];
      const age = s ? now - s.t0 : -1;
      if (!s || age < 0 || age > s.life) {
        dummy.scale.setScalar(0);
      } else {
        const k = age / s.life;
        dummy.position.set(s.from[0] + s.v[0] * age, s.from[1] + s.v[1] * age, s.from[2] + s.v[2] * age);
        dummy.scale.setScalar(Math.sin(k * Math.PI) * (0.7 + 0.3 * Math.sin(age * 40 + i)));
      }
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[null, null, SPARKS]} frustumCulled={false}>
      <octahedronGeometry args={[0.0028, 0]} />
      <meshBasicMaterial color="#fff4d6" toneMapped={false} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------ the proboscis

/**
 * The proboscis. Flies drink by extending it; the motor neuron that does it
 * (MN9) is what Shiu et al. 2024 drove from sugar-sensing neurons through a
 * whole-brain connectome model. Here it grows from the mouthparts, wherever
 * the turned head has put them, to the end of the straw.
 */
function Proboscis({ bar, mouthRef }) {
  const stalk = useRef();
  const tip = useRef();
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(() => {
    const m = mouthRef.current;
    const e = bar.proboscis ?? bar.extend;
    const on = !!m && e > 0.02;
    if (stalk.current) stalk.current.visible = on;
    if (tip.current) tip.current.visible = on;
    if (!on) return;
    from.set(m[0], m[1], m[2]);
    to.set(...STRAW_TIP);
    dir.subVectors(to, from);
    const full = dir.length();
    const len = Math.max(0.001, full * e);
    dir.normalize();
    stalk.current.position.copy(from).addScaledVector(dir, len / 2);
    stalk.current.quaternion.setFromUnitVectors(up, dir);
    stalk.current.scale.set(1, len, 1);
    tip.current.position.copy(from).addScaledVector(dir, len);
  });
  return (
    <group>
      <mesh ref={stalk} visible={false}>
        <cylinderGeometry args={[0.011, 0.016, 1, 12]} />
        <meshPhysicalMaterial color="#b0621c" roughness={0.45} transmission={0.25} thickness={0.02} />
      </mesh>
      <mesh ref={tip} visible={false} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.016, 16, 12]} />
        <meshPhysicalMaterial color="#c47327" roughness={0.5} transmission={0.2} thickness={0.02} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------- scene

function World({ bar, onTick }) {
  const gripTargetRef = useRef(REST_HAND_WORLD);
  const dopamineRef = useRef(0);
  const lookRef = useRef(null);
  const mouthRef = useRef(null);
  return (
    <>
      <Lights bar={bar} dopamineRef={dopamineRef} />
      <BarCamera bar={bar} />
      <Rig bar={bar} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} mouthRef={mouthRef} onTick={onTick} />
      <OldBar />
      <Glass bar={bar} />
      <Empties bar={bar} />
      <Fly
        machine={bar}
        pose={BAR_FLY}
        gripTargetRef={gripTargetRef}
        dopamineRef={dopamineRef}
        lookRef={lookRef}
        mouthRef={mouthRef}
        mouthLocal={MOUTH_LOCAL}
      />
      <Tin bar={bar} mouthRef={mouthRef} />
      <Tingle bar={bar} mouthRef={mouthRef} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={12} blur={2.4} far={4} resolution={1024} color="#140c06" />
      <StudioProbe />
    </>
  );
}

export function BarScene({ bar, onTick }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = BG_AWAKE.clone();
        scene.fog = new THREE.Fog(BG_AWAKE.clone(), 6, 16);
      }}
    >
      <PerspectiveCamera makeDefault fov={BAR_CAMERA.fov} position={BAR_CAMERA.position} near={0.05} far={60} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World bar={bar} onTick={onTick} />
      </Suspense>
    </Canvas>
  );
}
