/**
 * The classroom itself: parquet with the afternoon sun lying across it, a
 * wainscoted front wall, tall windows on the class's left with curtains and
 * the schoolyard beyond, posters, a bookshelf, plants, the wall clock, the
 * teacher's desk with its globe and apple, and the pupils' desks.
 *
 * The shelf, books, plants, lamp and clock are the CC0 Poly Haven props the
 * coder's room already ships (public/models, Draco); everything else is
 * primitives and canvas textures painted once.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  DESK, BOARD, WALL_X, PLATFORM, NOTEBOOK, WINDOW_WALL_Z, WINDOWS, SUN, TEACHER_DESK,
} from './sixSevenLayout.js';

function canvasTexture(w, h, paint, { repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 8;
  return t;
}

function rngFrom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const WOOD = '#b98a52';
const WOOD_DARK = '#8a5a2b';
const STEEL = { color: '#5d6670', roughness: 0.4, metalness: 0.7 };

// ------------------------------------------------------------------ floor

/** Herringbone parquet, varnished: warm, a little worn down the aisle. */
function useParquet() {
  return useMemo(() => canvasTexture(512, 512, (ctx, W, H) => {
    const rnd = rngFrom(11);
    ctx.fillStyle = '#b07d45';
    ctx.fillRect(0, 0, W, H);
    const bw = 32, bl = 128;
    // two boards at right angles, stepped: a herringbone that tiles at 128
    for (let row = -2; row < H / bw + 2; row++) {
      for (let col = -2; col < W / bl + 3; col++) {
        const x = col * bl + (row % 4) * bw;
        const y = row * bw;
        const horizontal = (row + col) % 2 === 0;
        const tone = 150 + rnd() * 34;
        ctx.fillStyle = `rgb(${tone + 34}, ${tone - 8}, ${tone - 70})`;
        if (horizontal) ctx.fillRect(x, y, bl - 1, bw - 1);
        else ctx.fillRect(x, y, bw - 1, bl - 1);
        // grain
        ctx.strokeStyle = `rgba(80, 45, 15, ${0.08 + rnd() * 0.1})`;
        ctx.lineWidth = 1;
        for (let g = 0; g < 3; g++) {
          ctx.beginPath();
          if (horizontal) { const gy = y + 5 + rnd() * (bw - 10); ctx.moveTo(x + 2, gy); ctx.lineTo(x + bl - 3, gy + (rnd() - 0.5) * 3); }
          else { const gx = x + 5 + rnd() * (bw - 10); ctx.moveTo(gx, y + 2); ctx.lineTo(gx + (rnd() - 0.5) * 3, y + bl - 3); }
          ctx.stroke();
        }
      }
    }
  }, { repeat: [7, 7] }), []);
}

/** The sun through one window, lying on the floor: the glass projected along the light. */
function SunPatch({ x }) {
  const geom = useMemo(() => {
    const { y, width, height } = WINDOWS;
    const project = (px, py) => {
      // from the point on the glass, away from the sun, down to the floor
      const k = py / SUN[1];
      return [px - SUN[0] * k, 0.004, WINDOW_WALL_Z - SUN[2] * k];
    };
    const tiles = [];
    // four panes, the glazing bars left dark between them
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + ox * width / 4, cy = y + oy * height / 4;
      const w = width / 2 - 0.07, h = height / 2 - 0.07;
      const a = project(cx - w / 2, cy - h / 2), b = project(cx + w / 2, cy - h / 2);
      const c = project(cx + w / 2, cy + h / 2), d = project(cx - w / 2, cy + h / 2);
      tiles.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tiles, 3));
    return g;
  }, [x]);
  return (
    <mesh geometry={geom}>
      <meshBasicMaterial color="#ffd596" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ------------------------------------------------------------------ walls

/** What is outside: sky, the hills, the schoolyard trees, a football goal. */
function useYard() {
  return useMemo(() => canvasTexture(512, 512, (ctx, W, H) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#8ec9f2'); sky.addColorStop(0.62, '#dff1ff'); sky.addColorStop(1, '#f7f3e0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(390, 90, 4, 390, 90, 170);
    sun.addColorStop(0, 'rgba(255,250,225,1)'); sun.addColorStop(1, 'rgba(255,250,225,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, r] of [[90, 110, 34], [130, 100, 44], [180, 114, 30], [300, 170, 26], [336, 162, 34]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#9fb7c9';
    ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(90, 250); ctx.lineTo(170, 310); ctx.lineTo(260, 230); ctx.lineTo(380, 320); ctx.lineTo(512, 270); ctx.lineTo(512, 400); ctx.lineTo(0, 400); ctx.fill();
    ctx.fillStyle = '#7fb069'; ctx.fillRect(0, 350, W, H - 350);
    for (const [x, r] of [[70, 56], [230, 44], [440, 62]]) {
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 6, 330, 12, 70);
      ctx.fillStyle = '#4f8a4a'; ctx.beginPath(); ctx.arc(x, 310, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#62a15a'; ctx.beginPath(); ctx.arc(x - r * 0.3, 296, r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 5;
    ctx.strokeRect(300, 380, 90, 50);
  }), []);
}

function Window({ x, yard }) {
  const { y, width, height } = WINDOWS;
  const frame = { color: '#f4efe2', roughness: 0.6 };
  const bar = (w, h, px, py) => (
    <mesh position={[px, py, 0.03]} castShadow>
      <boxGeometry args={[w, h, 0.06]} />
      <meshStandardMaterial {...frame} />
    </mesh>
  );
  return (
    <group position={[x, y, WINDOW_WALL_Z - 0.02]} rotation={[0, Math.PI, 0]}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={yard} toneMapped={false} />
      </mesh>
      {bar(width + 0.14, 0.08, 0, height / 2 + 0.02)}
      {bar(width + 0.14, 0.08, 0, -height / 2 - 0.02)}
      {bar(0.08, height + 0.12, -width / 2 - 0.02, 0)}
      {bar(0.08, height + 0.12, width / 2 + 0.02, 0)}
      {bar(0.045, height, 0, 0)}
      {bar(width, 0.045, 0, 0)}
      {/* the sill */}
      <mesh position={[0, -height / 2 - 0.08, 0.12]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.3, 0.05, 0.3]} />
        <meshStandardMaterial {...frame} />
      </mesh>
    </group>
  );
}

/** A curtain: a strip of cloth in soft folds, drawn back beside a window. */
function Curtain({ x, width = 0.42 }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, 2.55, 14, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / width) * Math.PI * 7) * 0.035);
    g.computeVertexNormals();
    return g;
  }, [width]);
  return (
    <mesh geometry={geom} position={[x, WINDOWS.y + 0.12, WINDOW_WALL_Z - 0.16]} rotation={[0, Math.PI, 0]} castShadow>
      <meshStandardMaterial color="#d9a441" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

const POSTERS = {
  times(ctx, W, H) {
    ctx.fillStyle = '#fbf6e6'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f6fb3'; ctx.fillRect(0, 0, W, 70);
    ctx.fillStyle = '#fff'; ctx.font = '800 40px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TIMES TABLES', W / 2, 50);
    ctx.font = '700 25px Inter, system-ui, sans-serif';
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        const six = (a === 6 && b === 7) || (a === 7 && b === 6);
        ctx.fillStyle = six ? '#de7a22' : (a + b) % 2 ? '#2b241c' : '#6b5d48';
        ctx.fillText(String(a * b), 36 + (b - 1) * 47, 112 + (a - 1) * 54);
        // the one cell somebody keeps circling
        if (six) { ctx.strokeStyle = '#de7a22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(36 + (b - 1) * 47, 104 + (a - 1) * 54, 22, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
  },
  brain(ctx, W, H) {
    ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, W, H);
    const rnd = rngFrom(23);
    // two optic lobes and a central brain, as dots: the connectome scope, as a poster
    for (let i = 0; i < 2600; i++) {
      const lobe = rnd();
      let x, y, col;
      if (lobe < 0.3) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); x = W * 0.2 + Math.cos(a) * r * 70; y = H * 0.42 + Math.sin(a) * r * 110; col = '140,200,225'; }
      else if (lobe < 0.6) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); x = W * 0.8 + Math.cos(a) * r * 70; y = H * 0.42 + Math.sin(a) * r * 110; col = '140,200,225'; }
      else { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); x = W * 0.5 + Math.cos(a) * r * 110; y = H * 0.4 + Math.sin(a) * r * 95; col = rnd() < 0.2 ? '222,122,34' : '232,214,170'; }
      ctx.fillStyle = `rgba(${col},${0.35 + rnd() * 0.5})`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#f6ead6'; ctx.textAlign = 'center';
    ctx.font = '800 34px Inter, system-ui, sans-serif'; ctx.fillText('DROSOPHILA', W / 2, H - 92);
    ctx.font = '500 22px Inter, system-ui, sans-serif'; ctx.fillStyle = '#c9b48e';
    ctx.fillText('60,001 neurons · MaleCNS v1.0', W / 2, H - 56);
  },
  rules(ctx, W, H) {
    ctx.fillStyle = '#fdf3d0'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d8342a'; ctx.font = '800 44px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CLASS RULES', W / 2, 64);
    ctx.textAlign = 'left'; ctx.fillStyle = '#2b241c'; ctx.font = '600 27px Inter, system-ui, sans-serif';
    ['1. Raise a leg to speak.', '2. No buzzing in class.', '3. Proboscis to yourself.', '4. Eyes on the board.'].forEach((t, i) => ctx.fillText(t, 34, 130 + i * 56));
    // added later, in marker
    ctx.fillStyle = '#d8342a'; ctx.font = '700 30px "Segoe Print", "Comic Sans MS", cursive';
    ctx.save(); ctx.translate(34, 372); ctx.rotate(-0.03); ctx.fillText('5. NO SIX SEVEN!!', 0, 0); ctx.restore();
  },
  alphabet(ctx, W, H) {
    ctx.fillStyle = '#eaf3e4'; ctx.fillRect(0, 0, W, H);
    ctx.font = '800 58px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    'ABCDEFGHIJKLMNOP'.split('').forEach((ch, i) => {
      ctx.fillStyle = ['#d8342a', '#2f6fb3', '#2f8a4f', '#de7a22'][i % 4];
      ctx.fillText(ch, 60 + (i % 4) * 96, 90 + Math.floor(i / 4) * 96);
    });
  },
};

function Poster({ kind, w, h, position, rotation = [0, Math.PI / 2, 0], frame = '#c9b48e' }) {
  const tex = useMemo(() => canvasTexture(420, Math.round((420 * h) / w), POSTERS[kind]), [kind, w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow><boxGeometry args={[w + 0.05, h + 0.05, 0.02]} /><meshStandardMaterial color={frame} roughness={0.6} /></mesh>
      <mesh position={[0, 0, 0.0105]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} roughness={0.85} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ Poly Haven

const MODELS = {
  lamp: '/models/ph-desk-lamp.glb',
  plantTall: '/models/ph-plant-tall.glb',
  plantSmall: '/models/ph-plant-small.glb',
  shelf: '/models/ph-shelf.glb',
  books: '/models/ph-books.glb',
  clock: '/models/ph-wall-clock.glb',
};

function Prop({ url, position, rotation = [0, 0, 0], scale = 1 }) {
  const { scene } = useGLTF(url, '/draco/');
  const root = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return r;
  }, [scene]);
  return <primitive object={root} position={position} rotation={rotation} scale={scale} />;
}

/** The school clock keeps the viewer's own time: its hands are separate nodes in the model. */
function WallClock() {
  const { scene } = useGLTF(MODELS.clock, '/draco/');
  const { root, hands } = useMemo(() => {
    const r = scene.clone(true);
    const h = {};
    r.traverse((o) => {
      if (/hours_hand/.test(o.name)) h.hour = o;
      else if (/minute_hand/.test(o.name)) h.minute = o;
      else if (/second_hand/.test(o.name)) h.second = o;
    });
    return { root: r, hands: h };
  }, [scene]);
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current += dt;
    if (tick.current < 0.2) return;
    tick.current = 0;
    const d = new Date();
    const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    // the hands turn about the clock's face normal, +Z in the model
    if (hands.hour) hands.hour.rotation.z = -(h / 12) * Math.PI * 2;
    if (hands.minute) hands.minute.rotation.z = -(m / 60) * Math.PI * 2;
    if (hands.second) hands.second.rotation.z = -(s / 60) * Math.PI * 2;
  });
  return <primitive object={root} position={[WALL_X + 0.006, 2.95, -2.75]} rotation={[0, Math.PI / 2, 0]} scale={1.05} />;
}

// -------------------------------------------------------------- furniture

/** A pupil's desk: a top with a pencil groove, a shelf underneath, tube legs. `dz` moves it along the row. */
export function PupilDesk({ dz = 0, children }) {
  const { top, thickness, front, back, zMin, zMax } = DESK;
  const len = zMax - zMin, zMid = (zMin + zMax) / 2, depth = front - back, xMid = (front + back) / 2;
  return (
    <group position={[0, 0, dz]}>
      <mesh position={[xMid, top - thickness / 2, zMid]} castShadow receiveShadow>
        <boxGeometry args={[depth, thickness, len]} />
        <meshStandardMaterial color="#d2a566" roughness={0.45} />
      </mesh>
      {/* an edge band, and the groove pencils roll into */}
      <mesh position={[xMid, top - thickness / 2, zMid]}>
        <boxGeometry args={[depth + 0.012, thickness * 0.6, len + 0.012]} />
        <meshStandardMaterial color="#8d6a3c" roughness={0.6} />
      </mesh>
      <mesh position={[back + 0.06, top + 0.0015, zMid]}>
        <boxGeometry args={[0.03, 0.003, len * 0.7]} />
        <meshStandardMaterial color="#a67c45" roughness={0.7} />
      </mesh>
      <mesh position={[xMid - 0.04, top - 0.22, zMid]} castShadow>
        <boxGeometry args={[depth - 0.12, 0.022, len - 0.12]} />
        <meshStandardMaterial color="#b08248" roughness={0.6} />
      </mesh>
      {[[back + 0.05, zMin + 0.06], [back + 0.05, zMax - 0.06], [front - 0.05, zMin + 0.06], [front - 0.05, zMax - 0.06]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <mesh position={[x, (top - thickness) / 2, z]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, top - thickness, 12]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          <mesh position={[x, 0.012, z]}>
            <cylinderGeometry args={[0.028, 0.03, 0.024, 12]} />
            <meshStandardMaterial color="#22262b" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {children}
    </group>
  );
}

/** What is on Damian's desk: the notebook he doodles in, a pencil, a pencil case, a water bottle. */
export function DamianThings() {
  const top = DESK.top;
  const page = useMemo(() => canvasTexture(256, 320, (ctx) => {
    ctx.fillStyle = '#fbf8ee'; ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = 'rgba(80,120,190,0.45)'; ctx.lineWidth = 1;
    for (let y = 30; y < 320; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(210,70,60,0.5)';
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(34, 320); ctx.stroke();
    // what he has been drawing instead of listening
    ctx.fillStyle = '#2b3a67'; ctx.font = '700 58px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillText('6 7', 70, 120);
    ctx.font = '700 30px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillText('6 7  6 7', 60, 200);
    ctx.fillText('67!', 150, 270);
  }), []);
  return (
    <group>
      <mesh position={[NOTEBOOK[0] - 0.02, top + 0.006, NOTEBOOK[2]]} rotation={[-Math.PI / 2, 0, Math.PI / 2 + 0.12]} receiveShadow castShadow>
        <boxGeometry args={[0.3, 0.38, 0.012]} />
        <meshStandardMaterial attach="material-4" map={page} roughness={0.9} />
        <meshStandardMaterial attach="material-0" color="#efe9d8" />
        <meshStandardMaterial attach="material-1" color="#efe9d8" />
        <meshStandardMaterial attach="material-2" color="#efe9d8" />
        <meshStandardMaterial attach="material-3" color="#efe9d8" />
        <meshStandardMaterial attach="material-5" color="#2f6fb3" />
      </mesh>
      {/* pencil, with its point and its rubber */}
      <group position={[0.6, top + 0.011, 0.1]} rotation={[0, 0.5, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.009, 0.009, 0.22, 6]} /><meshStandardMaterial color="#e9b53c" roughness={0.5} /></mesh>
        <mesh position={[0.125, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.009, 0.03, 6]} /><meshStandardMaterial color="#e6c9a0" roughness={0.7} /></mesh>
        <mesh position={[-0.118, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0095, 0.0095, 0.016, 8]} /><meshStandardMaterial color="#e58a8a" roughness={0.8} /></mesh>
      </group>
      {/* pencil case */}
      <mesh position={[0.44, top + 0.03, 0.3]} rotation={[0, 0.25, 0]} castShadow>
        <capsuleGeometry args={[0.03, 0.2, 6, 12]} />
        <meshStandardMaterial color="#d8342a" roughness={0.7} />
      </mesh>
      {/* water bottle */}
      <group position={[0.4, top, -0.72]}>
        <mesh position={[0, 0.1, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.2, 20]} /><meshStandardMaterial color="#7fd0e8" roughness={0.15} transparent opacity={0.75} /></mesh>
        <mesh position={[0, 0.215, 0]}><cylinderGeometry args={[0.022, 0.034, 0.035, 16]} /><meshStandardMaterial color="#2f6fb3" roughness={0.5} /></mesh>
      </group>
    </group>
  );
}

/** His school bag, slumped against the desk leg. */
export function SchoolBag() {
  return (
    <group position={[0.62, 0, 0.8]} rotation={[0, 0.35, -0.08]}>
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 0.46, 0.36]} />
        <meshStandardMaterial color="#2f6fb3" roughness={0.85} />
      </mesh>
      <mesh position={[0.105, 0.2, 0]} castShadow>
        <boxGeometry args={[0.05, 0.26, 0.26]} />
        <meshStandardMaterial color="#255a92" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.49, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.06, 0.012, 8, 20, Math.PI]} />
        <meshStandardMaterial color="#1d1a17" roughness={0.8} />
      </mesh>
      {/* a key ring: a little orange 67 */}
      <mesh position={[0.135, 0.36, 0.1]}>
        <boxGeometry args={[0.012, 0.06, 0.05]} />
        <meshStandardMaterial color="#de7a22" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A globe on a stand. */
function Globe({ position }) {
  const map = useMemo(() => canvasTexture(512, 256, (ctx, W, H) => {
    ctx.fillStyle = '#3b83c4'; ctx.fillRect(0, 0, W, H);
    const rnd = rngFrom(61);
    ctx.fillStyle = '#6fae5a';
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = 40 + rnd() * (H - 80);
      for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.ellipse(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 50, 14 + rnd() * 30, 10 + rnd() * 20, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = '#f2f6f8'; ctx.fillRect(0, 0, W, 16); ctx.fillRect(0, H - 14, W, 14);
  }), []);
  const ball = useRef();
  useFrame((_, dt) => { if (ball.current) ball.current.rotation.y += dt * 0.12; });
  return (
    <group position={position}>
      <mesh position={[0, 0.012, 0]} castShadow><cylinderGeometry args={[0.09, 0.1, 0.024, 24]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.5} /></mesh>
      <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.012, 0.012, 0.1, 10]} /><meshStandardMaterial {...STEEL} /></mesh>
      <group position={[0, 0.27, 0]} rotation={[0, 0, 0.41]}>
        <mesh ref={ball} castShadow><sphereGeometry args={[0.15, 40, 28]} /><meshStandardMaterial map={map} roughness={0.45} /></mesh>
        <mesh rotation={[0, 0, 0]}><torusGeometry args={[0.165, 0.007, 8, 40, Math.PI]} /><meshStandardMaterial color="#c9954b" roughness={0.3} metalness={0.8} /></mesh>
      </group>
    </group>
  );
}

/** The teacher's desk: panelled front, a lamp, the globe, an apple, a pile of exercise books. */
function TeacherDesk() {
  const { x, z, width, length, top } = TEACHER_DESK;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, top - 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.05, length]} />
        <meshStandardMaterial color={WOOD} roughness={0.4} />
      </mesh>
      {/* the modesty panel faces the class */}
      <mesh position={[width / 2 - 0.03, (top - 0.05) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.03, top - 0.05, length - 0.06]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.55} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, (top - 0.05) / 2, s * (length / 2 - 0.03)]} castShadow>
          <boxGeometry args={[width - 0.06, top - 0.05, 0.03]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.55} />
        </mesh>
      ))}
      <Globe position={[0.05, top, -0.45]} />
      <Prop url={MODELS.lamp} position={[-0.12, top, 0.5]} rotation={[0, 2.2, 0]} scale={0.95} />
      {/* an apple */}
      <group position={[0.2, top + 0.045, 0.12]}>
        <mesh scale={[1, 0.9, 1]} castShadow><sphereGeometry args={[0.048, 20, 16]} /><meshStandardMaterial color="#c8231d" roughness={0.35} /></mesh>
        <mesh position={[0, 0.048, 0]} rotation={[0, 0, 0.3]}><cylinderGeometry args={[0.004, 0.004, 0.03, 6]} /><meshStandardMaterial color="#5a3a1a" /></mesh>
      </group>
      {/* exercise books to mark */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.05, top + 0.008 + i * 0.014, -0.05 + (i % 2) * 0.012]} rotation={[0, 0.1 * (i - 1.5), 0]} castShadow>
          <boxGeometry args={[0.22, 0.012, 0.3]} />
          <meshStandardMaterial color={['#2f8a4f', '#d8342a', '#2f6fb3', '#e9b53c'][i]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- the room

export function Room() {
  const parquet = useParquet();
  const yard = useYard();
  const wall = { color: '#efe6d2', roughness: 0.95 };
  const wainscot = { color: '#8fae9c', roughness: 0.85 };
  const wallLen = 18;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshPhysicalMaterial map={parquet} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} envMapIntensity={0.5} />
      </mesh>
      {WINDOWS.xs.map((x) => <SunPatch key={x} x={x} />)}

      {/* the front wall: plaster above, tongue-and-groove below, a rail between */}
      <mesh position={[WALL_X, 2.6, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[wallLen, 5.2]} />
        <meshStandardMaterial {...wall} />
      </mesh>
      <mesh position={[WALL_X + 0.02, 0.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[wallLen, 1]} />
        <meshStandardMaterial {...wainscot} />
      </mesh>
      <mesh position={[WALL_X + 0.035, 1.02, 0]}>
        <boxGeometry args={[0.05, 0.06, wallLen]} />
        <meshStandardMaterial color="#f4efe2" roughness={0.6} />
      </mesh>
      <mesh position={[WALL_X + 0.03, 0.06, 0]}>
        <boxGeometry args={[0.04, 0.12, wallLen]} />
        <meshStandardMaterial color="#f4efe2" roughness={0.6} />
      </mesh>

      {/* the window wall, on the class's left */}
      <mesh position={[2, 2.6, WINDOW_WALL_Z]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[14, 5.2]} />
        <meshStandardMaterial {...wall} />
      </mesh>
      <mesh position={[2, 0.5, WINDOW_WALL_Z - 0.02]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[14, 1]} />
        <meshStandardMaterial {...wainscot} />
      </mesh>
      <mesh position={[2, 1.02, WINDOW_WALL_Z - 0.035]}>
        <boxGeometry args={[14, 0.06, 0.05]} />
        <meshStandardMaterial color="#f4efe2" roughness={0.6} />
      </mesh>
      {WINDOWS.xs.map((x) => <Window key={x} x={x} yard={yard} />)}
      {/* a curtain rail, and the curtains drawn back between the windows */}
      <mesh position={[0.55, WINDOWS.y + WINDOWS.height / 2 + 0.42, WINDOW_WALL_Z - 0.16]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 7, 8]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {[-2.62, -0.5, 1.6, 3.72].map((x) => <Curtain key={x} x={x} />)}
      <Prop url={MODELS.plantSmall} position={[-1.55, WINDOWS.y - WINDOWS.height / 2 - 0.055, WINDOW_WALL_Z - 0.16]} rotation={[0, 1.1, 0]} scale={0.95} />
      <Prop url={MODELS.plantSmall} position={[2.4, WINDOWS.y - WINDOWS.height / 2 - 0.055, WINDOW_WALL_Z - 0.16]} rotation={[0, 2.7, 0]} scale={0.8} />

      {/* the corner by the windows: shelf, books, a tall plant */}
      <group position={[WALL_X + 0.17, 0, 3.35]} rotation={[0, Math.PI / 2, 0]}>
        <Prop url={MODELS.shelf} position={[0, 0, 0]} />
        {[0.12, 0.52, 0.93, 1.33].map((y, i) => (
          <Prop key={y} url={MODELS.books} position={[-0.4 + ((i * 0.37) % 1) * 0.28, y + 0.012, 0.12]} rotation={[0, i % 2 ? 0 : Math.PI, 0]} scale={0.78} />
        ))}
      </group>
      <Prop url={MODELS.plantTall} position={[WALL_X + 0.55, 0, 4.0]} rotation={[0, 0.8, 0]} scale={1.3} />

      {/* on the front wall, either side of the board */}
      <Poster kind="times" w={0.78} h={1.0} position={[WALL_X + 0.014, 2.2, BOARD.z + BOARD.width / 2 + 0.75]} />
      <Poster kind="rules" w={0.72} h={0.78} position={[WALL_X + 0.014, 2.35, BOARD.z - BOARD.width / 2 - 0.62]} frame="#d8342a" />
      <Poster kind="brain" w={0.72} h={0.6} position={[WALL_X + 0.014, 1.6, BOARD.z - BOARD.width / 2 - 0.62]} frame="#2a1d14" />
      <Poster kind="alphabet" w={0.62} h={0.62} position={[1.6, 3.45, WINDOW_WALL_Z - 0.014]} rotation={[0, Math.PI, 0]} />
      <WallClock />

      {/* the teacher's platform, its step worn pale at the edge */}
      <mesh position={[PLATFORM.x, PLATFORM.height / 2, PLATFORM.z]} castShadow receiveShadow>
        <boxGeometry args={[PLATFORM.width, PLATFORM.height, PLATFORM.depth]} />
        <meshStandardMaterial color="#9a6a3a" roughness={0.6} />
      </mesh>
      <mesh position={[PLATFORM.x + PLATFORM.width / 2 - 0.03, PLATFORM.height + 0.002, PLATFORM.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.06, PLATFORM.depth]} />
        <meshStandardMaterial color="#c9a36a" roughness={0.7} />
      </mesh>
      <TeacherDesk />

      {/* dust in the light */}
      <Sparkles count={70} scale={[5.5, 2.6, 3.4]} position={[0.2, 1.7, 2.2]} size={2.2} speed={0.18} opacity={0.5} color="#fff2cf" />
    </group>
  );
}

Object.values(MODELS).forEach((url) => useGLTF.preload(url, '/draco/'));
