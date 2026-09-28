/**
 * Two flies, two phones, a dark room.
 *
 * The same CT scan twice, each on its own stool, each with a phone in front
 * of its face that is painted live from the reel its fly is watching
 * (reelPainters.js). The only real light in the room is the phones: each
 * throws the colour of its reel onto its fly's face. The right foreleg swipes
 * up the glass and taps the send arrow; when a message arrives, or when one
 * has just sent something, the two look at each other.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, advance } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { Stool, StudioProbe } from './studio.jsx';
import { flyToWorld } from './layout.js';
import { HAND } from './flyRig.js';
import {
  POSES, STOOL_OFFSETS, PHONE, SWIPE_FROM, SWIPE_TO, SHARE_BUTTON, THUMB_REST,
  SCROLL_CAMERA, phoneWorld, eyesWorld, lapWorld,
} from './scrollLayout.js';
import { drawPhone, SCREEN_W, SCREEN_H } from './reelPainters.js';
import { REELS, PHASES } from '../game/scroll.js';
import { sound } from '../audio/audio.js';

if (import.meta.env.DEV) window.__advance = advance;

const BG = new THREE.Color('#0d1119');
/** A phone's light is its reel's colour, washed towards the white of a screen. */
const SCREEN_WHITE = new THREE.Color('#cfe0ff');
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** A point on a phone's glass, in world space, from screen fractions (x right, y up). */
function onGlass(phone, [u, v], out) {
  out.set(u * PHONE.width / 2, v * PHONE.height / 2, PHONE.depth / 2 + 0.006);
  return phone.localToWorld(out);
}

// ------------------------------------------------------------------ the rig

function Rig({ duo, rigs, onTick }) {
  const { camera } = useThree();
  const base = useMemo(() => new THREE.Vector3(...SCROLL_CAMERA.position), []);
  const look = useMemo(() => new THREE.Vector3(...SCROLL_CAMERA.target), []);
  const uiClock = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    duo.update(dt);
    const t = state.clock.elapsedTime;
    duo.flies.forEach((f, i) => {
      const r = rigs[i];
      const phone = r.phone.current;
      if (!phone) return;
      // the phone: in front of the face, or sliding into the lap asleep
      const drop = f.phase === PHASES.ASLEEP ? f.collapse : 0;
      phone.position.set(...lerp3(phoneWorld(i), lapWorld(i), drop));
      phone.lookAt(...eyesWorld(i));
      phone.rotateX(-drop * 1.2);
      phone.updateMatrixWorld();

      // the foreleg: resting by the screen, swiping up it, or on the send arrow
      let target = THUMB_REST;
      if (f.phase === PHASES.SWIPING) {
        const k = f.swipe;
        target = [SWIPE_FROM[0], SWIPE_FROM[1] + (SWIPE_TO[1] - SWIPE_FROM[1]) * k];
      } else if (f.phase === PHASES.SHARING) {
        target = [THUMB_REST[0] + (SHARE_BUTTON[0] - THUMB_REST[0]) * f.tap, THUMB_REST[1] + (SHARE_BUTTON[1] - THUMB_REST[1]) * f.tap];
      }
      const w = onGlass(phone, target, tmp);
      r.grip.current = f.grip > 0.01 ? [w.x, w.y, w.z] : r.rest;
      r.dopamine.current = f.dopamine;

      // the gaze: the screen — or the other fly, for a beat, when something
      // has just passed between them
      const justSent = f.lastResult?.kind === 'sent' && duo.now() - f.lastResult.at < 1200;
      const other = eyesWorld(1 - i);
      if ((f.buzz > 0.4 || justSent) && f.awake) r.look.current = other;
      else {
        const c = phone.position;
        r.look.current = [c.x, c.y + Math.sin(t * 1.1 + i) * 0.01, c.z];
      }
    });

    const a = duo.flies[0], b = duo.flies[1];
    sound.setArousal(Math.max(a.arousal, b.arousal), Math.min(a.collapse, b.collapse));
    camera.position.set(
      base.x + Math.sin(t * 0.21) * 0.04,
      base.y + Math.sin(t * 0.17) * 0.025,
      base.z + Math.cos(t * 0.19) * 0.04,
    );
    camera.lookAt(look);

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

// ---------------------------------------------------------------- phones

/** One phone: a slab, a lit screen, and the light it throws on its fly. */
function Phone({ duo, index, phoneRef, canvasRef }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = SCREEN_W; c.height = SCREEN_H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const light = useRef();
  const clock = useRef(index * 0.02);
  const color = useMemo(() => new THREE.Color(), []);
  useEffect(() => { canvasRef.current = canvas; }, [canvas, canvasRef]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, dt) => {
    const f = duo.flies[index];
    clock.current += dt;
    if (clock.current >= 1 / 24) {
      clock.current = 0;
      drawPhone(canvas.getContext('2d'), f, duo);
      texture.needsUpdate = true;
    }
    if (light.current) {
      color.set(REELS[f.reel.cat].color).lerp(SCREEN_WHITE, 0.45);
      light.current.color.copy(color);
      light.current.intensity = f.screenOn ? 3.6 + (f.cat.kind === 'threat' ? f.loom * 3 : 0) : 0;
    }
  });
  return (
    <group ref={phoneRef}>
      <mesh castShadow>
        <boxGeometry args={[PHONE.width + 0.006, PHONE.height + 0.006, PHONE.depth]} />
        <meshStandardMaterial color="#15161a" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, PHONE.depth / 2 + 0.0005]}>
        <planeGeometry args={[PHONE.width, PHONE.height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0.14]} distance={1.5} decay={2} intensity={3.6} />
    </group>
  );
}

// ------------------------------------------------------------------ room

/**
 * The room: a floor, a rug under the stools, and the wall they face with a
 * window in it — the moon, and a city that is still up too.
 */
function Room() {
  const city = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 384;
    const ctx = c.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 384);
    sky.addColorStop(0, '#0b1230');
    sky.addColorStop(1, '#1d2447');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#e8eeff';
    ctx.beginPath(); ctx.arc(380, 90, 34, 0, Math.PI * 2); ctx.fill();
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.5})`; ctx.fillRect(rnd() * 512, rnd() * 200, 1.5, 1.5); }
    for (let x = 0; x < 512;) {
      const w = 30 + rnd() * 50, h = 60 + rnd() * 150;
      ctx.fillStyle = '#070a16';
      ctx.fillRect(x, 384 - h, w, h);
      for (let wy = 384 - h + 8; wy < 380; wy += 12) {
        for (let wx = x + 5; wx < x + w - 6; wx += 10) {
          if (rnd() < 0.18) { ctx.fillStyle = rnd() < 0.5 ? '#f3c874' : '#9ec2ff'; ctx.fillRect(wx, wy, 4, 5); }
        }
      }
      x += w + 2;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => city.dispose(), [city]);
  const WALL_X = -0.95;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14, 64]} />
        <meshStandardMaterial color="#1b1e25" roughness={0.9} />
      </mesh>
      <mesh position={[1.45, 0.004, 0.45]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.05, 48]} />
        <meshStandardMaterial color="#3a2f3f" roughness={1} />
      </mesh>
      {/* the wall they face */}
      <mesh position={[WALL_X, 1.8, 0.3]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[9, 3.6]} />
        <meshStandardMaterial color="#232834" roughness={0.95} />
      </mesh>
      {/* the window: the moon and a city still awake */}
      <group position={[WALL_X + 0.01, 1.95, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[1.6, 1.2]} />
          <meshBasicMaterial map={city} toneMapped={false} />
        </mesh>
        {[[0, 0.615, 1.7, 0.05], [0, -0.615, 1.7, 0.05], [0.825, 0, 0.05, 1.28], [-0.825, 0, 0.05, 1.28], [0, 0, 0.035, 1.2], [0, 0, 1.6, 0.035]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.01]}>
            <boxGeometry args={[w, h, 0.03]} />
            <meshStandardMaterial color="#343a48" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* moonlight through it, cool and weak */}
      <directionalLight position={[-3, 3.2, 1.2]} intensity={0.45} color="#9fb4e6" castShadow shadow-mapSize={[1024, 1024]} />
      <ambientLight intensity={0.14} color="#8fa0c8" />
      <hemisphereLight args={['#33415e', '#0b0d12', 0.3]} />
    </group>
  );
}

// ----------------------------------------------------------------- scene

function useFlyRig(i) {
  const rest = useMemo(() => flyToWorld(HAND, POSES[i]), [i]);
  return {
    rest,
    grip: useRef(rest),
    look: useRef(null),
    dopamine: useRef(0),
    phone: useRef(),
  };
}

function World({ duo, onTick, canvasRefs }) {
  const rigs = [useFlyRig(0), useFlyRig(1)];
  return (
    <>
      <Rig duo={duo} rigs={rigs} onTick={onTick} />
      <Room />
      {[0, 1].map((i) => (
        <group key={i}>
          <Stool offset={STOOL_OFFSETS[i]} />
          <Phone duo={duo} index={i} phoneRef={rigs[i].phone} canvasRef={canvasRefs[i]} />
          <Fly
            machine={duo.flies[i]}
            pose={POSES[i]}
            gripTargetRef={rigs[i].grip}
            dopamineRef={rigs[i].dopamine}
            lookRef={rigs[i].look}
          />
        </group>
      ))}
      <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={12} blur={2.4} far={4} resolution={1024} color="#000" />
      <StudioProbe />
    </>
  );
}

export function ScrollScene({ duo, onTick, canvasRefs }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 6, 16);
      }}
    >
      <PerspectiveCamera makeDefault fov={SCROLL_CAMERA.fov} position={SCROLL_CAMERA.position} near={0.05} far={60} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World duo={duo} onTick={onTick} canvasRefs={canvasRefs} />
      </Suspense>
    </Canvas>
  );
}
