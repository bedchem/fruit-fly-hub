/**
 * The classroom: Damian at his desk with his middle parting, two classmates along
 * the row, the blackboard on the wall in front of them, the teacher on its
 * platform beside it, the afternoon sun through the windows on the left.
 *
 * The board is a canvas the lesson is chalked onto as the teacher writes it,
 * with the strikes against Damian's name in the corner. All four flies are
 * the same CT scan as everywhere in Fly Lab. When he does it, his one rigged
 * foreleg pumps up and down, the body rocks the other way, and a chalk 6 and
 * 7 stand over his shoulders — the 6 on the viewer's left, so it reads 6 7 —
 * bobbing in turn, while the classmates turn to look and shake with laughter.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, AdaptiveDpr, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Fly } from './Fly.jsx';
import { Stool, StudioProbe } from './studio.jsx';
import { FLY, flyToWorld } from './layout.js';
import {
  BOARD, WALL_X, TEACHER, TEACHER_AT_BOARD, BOARD_GAZE, CLASS_CAMERA, SIX_AT, SEVEN_AT, NOTEBOOK, CLASSMATE_DZ, SUN,
} from './sixSevenLayout.js';
import { Room, PupilDesk, DamianThings, SchoolBag } from './sixSevenRoom.jsx';
import { PHASES, TEACH, NAME, MAX_STRIKES, DETENTION_LINES, BEAT_HZ } from '../game/sixSeven.js';
import { sound } from '../audio/audio.js';

const BG = new THREE.Color('#e6dcc8');
const DAMIAN_HEAD = flyToWorld([-0.04, 0.9, 0.62]);
const smoothstep = (x) => x * x * (3 - 2 * x);

/** A word or a numeral as a sprite texture: thick, outlined, with a soft shadow so it reads over anything. */
function textTexture(text, { h = 160, color = '#ffffff', font = '900 120px Inter, system-ui, sans-serif', stroke = '#fff7e8', lineWidth = 16 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width + lineWidth * 3 + 24);
  c.height = h;
  ctx.font = font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(40, 25, 10, 0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
  ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke;
  ctx.strokeText(text, c.width / 2, h / 2 + 4);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.aspect = c.width / c.height;
  return t;
}

/** A name tag with an arrow under it, pointing down at whoever it is over. */
function pointerTexture(label) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '900 78px Inter, system-ui, sans-serif';
  ctx.font = font;
  const tw = ctx.measureText(label).width;
  const W = Math.ceil(tw + 96), H = 250;
  c.width = W; c.height = H;
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(40, 25, 10, 0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
  // the tag and the arrow as one shape, outlined in cream
  const tagH = 116, r = 30, ax = W / 2, shaft = 26, headW = 62, tip = H - 14;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(r + 10, 10);
    ctx.arcTo(W - 10, 10, W - 10, 10 + tagH, r);
    ctx.arcTo(W - 10, 10 + tagH, 10, 10 + tagH, r);
    ctx.lineTo(ax + shaft, 10 + tagH);
    ctx.lineTo(ax + shaft, tip - 62);
    ctx.lineTo(ax + headW, tip - 62);
    ctx.lineTo(ax, tip);
    ctx.lineTo(ax - headW, tip - 62);
    ctx.lineTo(ax - shaft, tip - 62);
    ctx.lineTo(ax - shaft, 10 + tagH);
    ctx.arcTo(10, 10 + tagH, 10, 10, r);
    ctx.arcTo(10, 10, W - 10, 10, r);
    ctx.closePath();
  };
  shape();
  ctx.lineWidth = 14; ctx.strokeStyle = '#fff7e8'; ctx.stroke();
  ctx.shadowColor = 'transparent';
  shape();
  ctx.fillStyle = '#de7a22'; ctx.fill();
  ctx.fillStyle = '#fff7e8';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, 10 + tagH / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.aspect = W / H;
  return t;
}

// ------------------------------------------------------------------ the rig

function Rig({ game, lookRef, teacherLookRef, gripTargetRef, dopamineRef, teacherPose, mates, onTick, onReady }) {
  const { camera } = useThree();
  const started = useRef(false);
  const base = useMemo(() => new THREE.Vector3(...CLASS_CAMERA.position), []);
  const look = useMemo(() => new THREE.Vector3(...CLASS_CAMERA.target), []);
  const toDamian = useMemo(() => new THREE.Vector3(...DAMIAN_HEAD).sub(new THREE.Vector3(...CLASS_CAMERA.position)).normalize(), []);
  const uiClock = useRef(0);
  const shake = useRef(0);
  const strikes = useRef(0);
  const push = useRef(0);

  useFrame((state, dt) => {
    // the flies are decoded and on screen: the loading screen can go
    if (!started.current) { started.current = true; onReady?.(); }
    game.update(dt);
    const t = state.clock.elapsedTime;
    const T = game.teach;
    const saying = game.phase === PHASES.SIXSEVEN;
    dopamineRef.current = game.urge;
    gripTargetRef.current = game.gripTarget;
    teacherPose.rotationY = game.teacher.yaw;

    // Damian's eyes: the board; his audience while he does it; his lines in detention
    if (saying) {
      const m = mates[Math.floor(game.gesture.t * 1.6) % mates.length];
      lookRef.current = m.head;
    } else if (game.phase === PHASES.DETENTION) {
      lookRef.current = NOTEBOOK;
    } else if (game.watching > 0.5) {
      // when the teacher looks, he looks back, innocently
      lookRef.current = [TEACHER.position[0], TEACHER.position[1] + 0.35, TEACHER.position[2]];
    } else {
      lookRef.current = [BOARD_GAZE[0], BOARD_GAZE[1] + Math.sin(t * 0.9) * 0.05, BOARD_GAZE[2] + Math.sin(t * 0.5) * 0.3];
    }
    // the teacher's: the chalk while it writes, Damian while it watches
    const writing = T.phase === TEACH.WRITE || T.phase === TEACH.ANSWER;
    teacherLookRef.current = game.watching > 0.3 || !writing
      ? DAMIAN_HEAD
      : [BOARD.x, BOARD.y + 0.1, BOARD.z + BOARD.width * (0.35 - 0.7 * T.written)];

    // the classmates: eyes on the board, on Damian while he is at it, and shaking when it is funny
    const laugh = game.laughter;
    mates.forEach((m, i) => {
      const b = m.body;
      const ph = t * (13 + i * 2.1) + i * 1.7;
      const looking = saying || laugh > 0.1;
      m.lookRef.current = looking
        ? DAMIAN_HEAD
        : game.watching > 0.5
          ? [TEACHER.position[0], TEACHER.position[1] + 0.35, TEACHER.position[2]]
          : [BOARD_GAZE[0], BOARD_GAZE[1] + Math.sin(t * 0.7 + i) * 0.06, BOARD_GAZE[2] + Math.sin(t * 0.4 + i * 2) * 0.5];
      b.body.rise += (Math.abs(Math.sin(ph)) * 0.035 * laugh - b.body.rise) * Math.min(1, dt * 20);
      b.body.pitch += (-0.07 * laugh - b.body.pitch) * Math.min(1, dt * 6);
      b.body.roll = Math.sin(ph * 0.5) * 0.05 * laugh;
      b.headRoll = Math.sin(ph * 0.7) * 0.14 * laugh;
      b.arousal += ((saying ? 0.5 : 0.1) + laugh * 0.4 - b.arousal) * Math.min(1, dt * 4);
    });

    sound.setArousal?.(game.fly.arousal, game.fly.collapse);

    // a strike lands with a jolt; while he does it the shot leans in on him
    if (game.strikes > strikes.current) shake.current = 1;
    strikes.current = game.strikes;
    shake.current = Math.max(0, shake.current - dt * 2.5);
    push.current += ((saying && !game.gesture.mutter ? 1 : 0) - push.current) * Math.min(1, dt * 5);
    const k = shake.current;
    const p = smoothstep(push.current);
    const groove = saying ? Math.sin(game.gesture.t * BEAT_HZ * Math.PI * 2) * 0.012 : 0;
    camera.position.set(
      base.x + toDamian.x * p * 0.45 + Math.sin(t * 0.21) * 0.05 + Math.sin(t * 31.7) * k * 0.04,
      base.y + toDamian.y * p * 0.45 + Math.sin(t * 0.17) * 0.03 + groove + Math.sin(t * 27.3) * k * 0.035,
      base.z + toDamian.z * p * 0.45 + Math.cos(t * 0.19) * 0.05 + Math.cos(t * 24.1) * k * 0.04,
    );
    camera.lookAt(look);

    uiClock.current += dt;
    if (uiClock.current > 1 / 12) { uiClock.current = 0; onTick(); }
  });
  return null;
}

/** An afternoon: the sun low through the windows, the sky filling in from the other side. */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.42} color="#fff3df" />
      <hemisphereLight args={['#fff7e6', '#8a6b48', 0.5]} />
      <directionalLight
        position={SUN}
        intensity={2.4}
        color="#ffe3b4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-far={26}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[4, 3.5, -5]} intensity={0.45} color="#cfe0ff" />
    </>
  );
}

// -------------------------------------------------------------- the board

const CHALK = '#f4f1e6';
const CHALK_YELLOW = '#f6dd7a';
const CHALK_RED = '#f08a7a';
const HAND = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';

/** Chalk is never one clean stroke: drawn twice, a hair apart, the second faint. */
function chalk(ctx, text, x, y) {
  const fill = ctx.fillStyle;
  ctx.globalAlpha = 0.35;
  ctx.fillText(text, x + 2, y + 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Chalk on slate: the lesson as far as it has been written, the answer, and the strikes. */
function paintBoard(ctx, game, W, H, smears) {
  const T = game.teach;
  // slate, darker at the edges, with what the sponge left behind
  const slate = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
  slate.addColorStop(0, '#35543f'); slate.addColorStop(1, '#27402f');
  ctx.fillStyle = slate;
  ctx.fillRect(0, 0, W, H);
  for (const s of smears) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.a);
    const g = ctx.createLinearGradient(-s.w / 2, 0, s.w / 2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${s.o})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }
  // chalk dust settled along the bottom
  const dust = ctx.createLinearGradient(0, H - 50, 0, H);
  dust.addColorStop(0, 'rgba(255,255,255,0)'); dust.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = dust; ctx.fillRect(0, H - 50, W, 50);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `500 30px ${HAND}`;
  ctx.fillStyle = 'rgba(244,241,230,0.55)';
  ctx.fillText(`Day ${game.day} · lesson ${game.itemCount}`, 36, 40);

  // names on the board: the strikes
  ctx.textAlign = 'right';
  ctx.font = `700 40px ${HAND}`;
  ctx.fillStyle = game.strikes ? CHALK_RED : 'rgba(244,241,230,0.4)';
  chalk(ctx, NAME, W - 150, 46);
  ctx.strokeStyle = CHALK_RED; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (let i = 0; i < Math.min(game.strikes, MAX_STRIKES); i++) {
    const x = W - 125 + i * 30;
    ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x - 5, 66); ctx.stroke();
  }

  if (game.phase === PHASES.DETENTION) {
    ctx.textAlign = 'left';
    ctx.font = `600 44px ${HAND}`;
    ctx.fillStyle = CHALK;
    for (let i = 0; i < Math.min(game.lines + 1, DETENTION_LINES); i++) {
      const done = i < game.lines;
      const line = 'I will not say six seven in class.';
      const k = done ? 1 : (game.detentionT * 9 % 12) / 12;
      chalk(ctx, line.slice(0, Math.ceil(line.length * k)), 60, 120 + i * 56);
    }
    return;
  }

  // the lesson, as far as the chalk has got
  const text = T.item.text;
  const shown = text.slice(0, Math.ceil(text.length * T.written));
  const big = text.length < 16;
  ctx.textAlign = 'center';
  ctx.font = `700 ${big ? 150 : 84}px ${HAND}`;
  ctx.fillStyle = CHALK;
  chalk(ctx, shown, W / 2, H * 0.47);
  if (T.item.answer && T.answered > 0) {
    ctx.font = `700 120px ${HAND}`;
    ctx.fillStyle = CHALK_YELLOW;
    const ans = `= ${T.item.answer}`;
    chalk(ctx, ans.slice(0, Math.ceil(ans.length * Math.min(1, T.answered * 1.8))), W / 2, H * 0.78);
    // underlined as the chalk lingers
    if (T.answered > 0.6) {
      const k = Math.min(1, (T.answered - 0.6) / 0.4);
      ctx.strokeStyle = CHALK_YELLOW; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(W / 2 - 120, H * 0.9); ctx.lineTo(W / 2 - 120 + 240 * k, H * 0.9 - 4); ctx.stroke();
    }
  }
}

function Blackboard({ game }) {
  const W = 1280, H = 608;
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }, []);
  const smears = useMemo(() => {
    let seed = 31;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return Array.from({ length: 14 }, () => ({ x: rnd() * W, y: 80 + rnd() * (H - 140), w: 180 + rnd() * 320, h: 30 + rnd() * 50, a: (rnd() - 0.5) * 0.3, o: 0.025 + rnd() * 0.04 }));
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const clock = useRef(1);
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 1 / 12) return;
    clock.current = 0;
    paintBoard(canvas.getContext('2d'), game, W, H, smears);
    texture.needsUpdate = true;
  });
  const { x, y, z, width, height } = BOARD;
  const wood = { color: '#8a5a2b', roughness: 0.55 };
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.004]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.95} />
      </mesh>
      {/* a moulded frame: four rails standing proud of the slate */}
      {[[0, height / 2 + 0.04, width + 0.16, 0.08], [0, -height / 2 - 0.04, width + 0.16, 0.08], [-width / 2 - 0.04, 0, 0.08, height], [width / 2 + 0.04, 0, 0.08, height]].map(([px, py, w, h], i) => (
        <mesh key={i} position={[px, py, 0.02]} castShadow>
          <boxGeometry args={[w, h, 0.06]} />
          <meshStandardMaterial {...wood} />
        </mesh>
      ))}
      {/* the chalk tray, sticks of chalk, the sponge */}
      <mesh position={[0, -height / 2 - 0.1, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, 0.03, 0.16]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.075, 0.165]}>
        <boxGeometry args={[width + 0.16, 0.05, 0.015]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {[[0.55, CHALK, 0.2], [0.7, CHALK_YELLOW, -0.3], [0.82, CHALK_RED, 0.5], [-0.2, CHALK, 0.1]].map(([px, color, rot]) => (
        <mesh key={px} position={[px, -height / 2 - 0.07, 0.09]} rotation={[0, rot, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.013, 0.013, 0.1, 10]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
      <group position={[-1.1, -height / 2 - 0.055, 0.09]}>
        <mesh castShadow><boxGeometry args={[0.2, 0.04, 0.1]} /><meshStandardMaterial color="#d9b34a" roughness={1} /></mesh>
        <mesh position={[0, 0.028, 0]}><boxGeometry args={[0.2, 0.016, 0.1]} /><meshStandardMaterial color="#5a4632" roughness={0.9} /></mesh>
      </group>
    </group>
  );
}

/** The number line over the board. The six and the seven are, of course, circled. */
function NumberLine() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1536; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f6efdc';
    ctx.fillRect(0, 0, 1536, 128);
    ctx.font = '800 84px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // the class reads the wall from the windows towards the door: 1 is on the left of the picture
    for (let n = 1; n <= 10; n++) {
      const x = 80 + (n - 1) * 153;
      ctx.fillStyle = ['#d8342a', '#2f6fb3', '#2f8a4f', '#de7a22'][n % 4];
      ctx.fillText(String(n), x, 68);
    }
    // somebody has been at it with a pencil
    ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(80 + 5.5 * 153, 66, 150, 52, -0.04, 0, Math.PI * 2); ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  return (
    <mesh position={[WALL_X + 0.012, BOARD.y + BOARD.height / 2 + 0.36, BOARD.z]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[BOARD.width, BOARD.width / 12]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}

// ------------------------------------------------------------ on the heads
// All in the fly's own head space (the head spans x −0.22..0.15, y 0.64..1.09,
// z 0.54..0.65); Fly.jsx turns whatever is in the head slot with the head.

/**
 * Damian's hair: a middle parting. Two curtains swept out and down from a
 * line over the middle of the head, a lock falling forward past each eye,
 * and the back of the head covered.
 */
function MiddleParting() {
  const hair = { color: '#3b2413', roughness: 0.5 };
  const shine = { color: '#5a3a20', roughness: 0.4 };
  return (
    <group position={[-0.039, 0.985, 0.59]}>
      {/* the back and crown, under the two curtains */}
      <mesh position={[0, -0.03, -0.05]} scale={[1, 0.62, 0.78]} castShadow>
        <sphereGeometry args={[0.205, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...hair} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* a curtain: a dome tipped outwards, so the parting is the valley between the two */}
          <mesh position={[s * 0.105, 0.005, 0.0]} rotation={[0.12, 0, -s * 0.62]} scale={[0.72, 0.46, 0.92]} castShadow>
            <sphereGeometry args={[0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial {...hair} side={THREE.DoubleSide} />
          </mesh>
          {/* the lock that falls forward and down past the eye */}
          <mesh position={[s * 0.185, -0.075, 0.105]} rotation={[0.55, 0, -s * 0.3]} castShadow>
            <capsuleGeometry args={[0.05, 0.17, 6, 14]} />
            <meshStandardMaterial {...hair} />
          </mesh>
          {/* a shorter strand from the parting, curving out over the forehead */}
          <mesh position={[s * 0.095, 0.0, 0.135]} rotation={[0.95, 0, -s * 0.75]} castShadow>
            <capsuleGeometry args={[0.042, 0.12, 6, 14]} />
            <meshStandardMaterial {...shine} />
          </mesh>
          {/* the tip, flicking out */}
          <mesh position={[s * 0.225, -0.175, 0.15]} rotation={[0.3, 0, -s * 0.9]}>
            <capsuleGeometry args={[0.032, 0.05, 6, 12]} />
            <meshStandardMaterial {...hair} />
          </mesh>
        </group>
      ))}
      {/* the parting itself: a pale line of scalp down the middle */}
      <mesh position={[0, 0.088, 0.02]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.012, 0.012, 0.26]} />
        <meshStandardMaterial color="#e3a36a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** The teacher's glasses: a ring over each eye, a bridge between. */
function Glasses() {
  const rim = { color: '#1d1a17', roughness: 0.3, metalness: 0.4 };
  return (
    <group position={[-0.039, 0.86, 0.71]}>
      {[-0.115, 0.115].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh><torusGeometry args={[0.092, 0.011, 8, 28]} /><meshStandardMaterial {...rim} /></mesh>
          <mesh><circleGeometry args={[0.088, 24]} /><meshStandardMaterial color="#dff1ff" transparent opacity={0.22} roughness={0.05} /></mesh>
        </group>
      ))}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.009, 0.009, 0.05, 8]} />
        <meshStandardMaterial {...rim} />
      </mesh>
    </group>
  );
}

/** A bow, for the classmate next to him. */
function Bow() {
  const pink = { color: '#e0529c', roughness: 0.7 };
  return (
    <group position={[-0.039, 1.1, 0.6]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.075, 0, 0]} rotation={[0, 0, s * Math.PI / 2]} castShadow>
          <coneGeometry args={[0.065, 0.13, 4]} />
          <meshStandardMaterial {...pink} />
        </mesh>
      ))}
      <mesh><sphereGeometry args={[0.03, 12, 10]} /><meshStandardMaterial color="#b83a7c" roughness={0.7} /></mesh>
    </group>
  );
}

/** A beanie with a bobble, for the one by the window. */
function Beanie() {
  return (
    <group position={[-0.039, 0.98, 0.6]}>
      <mesh scale={[1, 0.8, 0.85]} castShadow>
        <sphereGeometry args={[0.22, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2f8a4f" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh scale={[1, 1, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.215, 0.028, 10, 32]} />
        <meshStandardMaterial color="#25703f" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow><sphereGeometry args={[0.05, 14, 12]} /><meshStandardMaterial color="#f6efdc" roughness={1} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- the pops

/**
 * What the joke looks like: a chalk 6 and 7 standing over his shoulders —
 * the 6 on the viewer's left — bobbing in turn with his palms, a banner over
 * his head, laughter over the classmates, and the teacher's "!".
 */
function Pops({ game, mates }) {
  const tex = useMemo(() => ({
    six: textTexture('6', { color: '#de7a22', font: '900 136px Inter, system-ui, sans-serif' }),
    seven: textTexture('7', { color: '#2f6fb3', font: '900 136px Inter, system-ui, sans-serif' }),
    banner: textTexture('SIX SEVEN!', { color: '#2b241c', font: '900 104px Inter, system-ui, sans-serif', lineWidth: 18 }),
    mutter: textTexture('six seven…', { color: '#6b5d48', font: 'italic 700 84px Inter, system-ui, sans-serif', lineWidth: 12 }),
    ha: textTexture('HA', { color: '#de7a22', font: '900 100px Inter, system-ui, sans-serif', lineWidth: 14 }),
    bang: textTexture('!', { color: '#d8342a', font: '900 136px Inter, system-ui, sans-serif' }),
    name: textTexture(`${NAME.toUpperCase()}!`, { color: '#d8342a', font: '900 96px Inter, system-ui, sans-serif', lineWidth: 16 }),
    pointer: pointerTexture(NAME.toUpperCase()),
  }), []);
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex]);
  const refs = useRef({});
  const haRefs = useRef([]);
  const show = useRef(0);
  const HAS = 8;
  const set = (key) => (s) => { refs.current[key] = s; };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = game.gesture;
    const r = refs.current;
    show.current += ((g ? 1 : 0) - show.current) * Math.min(1, dt * (g ? 14 : 7));
    const v = show.current;
    const mutter = !!g?.mutter;
    const size = mutter ? 0.2 : 0.4;
    const phase = g ? g.t * BEAT_HZ * Math.PI * 2 : 0;
    // on "six" the six jumps, on "seven" the seven: the same beat his palms keep
    const bob = [Math.max(0, Math.sin(phase)), Math.max(0, -Math.sin(phase))];
    [[r.six, SIX_AT, bob[0]], [r.seven, SEVEN_AT, bob[1]]].forEach(([s, at, b]) => {
      if (!s) return;
      s.visible = v > 0.02;
      if (!s.visible) return;
      const pop = 0.75 + b * 0.45;
      s.position.set(at[0], at[1] + 0.18 + b * 0.16, at[2]);
      s.scale.set(size * pop * s.material.map.userData.aspect * v, size * pop * v, 1);
      s.material.opacity = Math.min(1, v * 1.4);
      s.material.rotation = (b - 0.4) * 0.12 * (s === r.six ? 1 : -1);
    });
    // the banner over his head
    [[r.banner, !mutter, 0.26], [r.mutter, mutter, 0.13]].forEach(([s, on, h]) => {
      if (!s) return;
      const vis = on ? v : 0;
      s.visible = vis > 0.02;
      if (!s.visible) return;
      const wob = 1 + Math.sin(phase * 2) * 0.04;
      s.position.set(DAMIAN_HEAD[0], DAMIAN_HEAD[1] + 1.05 + Math.sin(phase) * 0.015, DAMIAN_HEAD[2]);
      s.scale.set(h * s.material.map.userData.aspect * vis * wob, h * vis * wob, 1);
      s.material.opacity = Math.min(1, vis * 1.5);
      s.material.rotation = Math.sin(phase * 0.5) * 0.05;
    });

    // which one is Damian: the tag over his head, bobbing, its tip just clear of his hair
    if (r.pointer) {
      const h = 0.34;
      const bobble = Math.abs(Math.sin(t * 2.4)) * 0.05;
      r.pointer.position.set(DAMIAN_HEAD[0], DAMIAN_HEAD[1] + 0.3 + h / 2 + bobble, DAMIAN_HEAD[2]);
      r.pointer.scale.set(h * r.pointer.material.map.userData.aspect, h, 1);
    }

    // laughter, rising off the classmates
    const laugh = game.laughter;
    haRefs.current.forEach((s, i) => {
      if (!s) return;
      const on = laugh > 0.05;
      s.visible = on;
      if (!on) return;
      const m = mates[i % mates.length];
      const life = (t * 0.9 + i / HAS) % 1;
      const side = ((i * 0.618) % 1 - 0.5) * 0.7;
      s.position.set(m.head[0] + 0.1, m.head[1] + 0.35 + life * 0.75, m.head[2] + side);
      const sc = 0.13 * (0.6 + laugh) * (0.7 + Math.sin(Math.PI * life) * 0.5);
      s.scale.set(sc * s.material.map.userData.aspect, sc, 1);
      s.material.opacity = Math.sin(Math.PI * life) * Math.min(1, laugh * 1.8);
      s.material.rotation = Math.sin(i * 2.1) * 0.3;
    });

    // the teacher has noticed
    const T = game.teach;
    const scold = T.phase === TEACH.SCOLD;
    const alarm = scold || T.holdT > 0;
    if (r.bang) {
      r.bang.visible = alarm && !scold;
      if (r.bang.visible) {
        const sc = 0.34 + Math.abs(Math.sin(t * 9)) * 0.04;
        r.bang.position.set(TEACHER.position[0] + 0.25, TEACHER.position[1] + 1.0, TEACHER.position[2]);
        r.bang.scale.set(sc * r.bang.material.map.userData.aspect, sc, 1);
      }
    }
    if (r.name) {
      r.name.visible = scold;
      if (scold) {
        const k = Math.min(1, T.t * 6);
        const sc = 0.3 * (0.6 + 0.4 * k) * (1 + Math.sin(t * 22) * 0.02);
        r.name.position.set(TEACHER.position[0] + 0.3, TEACHER.position[1] + 1.05, TEACHER.position[2] - 0.2);
        r.name.scale.set(sc * r.name.material.map.userData.aspect, sc, 1);
        r.name.material.opacity = Math.min(1, (T.dur - T.t) * 3);
      }
    }
  });
  const sprite = (key) => (
    <sprite ref={set(key)} visible={false} renderOrder={10}>
      <spriteMaterial map={tex[key]} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
  return (
    <group>
      {sprite('six')}
      {sprite('seven')}
      {sprite('banner')}
      {sprite('mutter')}
      {sprite('bang')}
      {sprite('name')}
      <sprite ref={set('pointer')} renderOrder={8}>
        <spriteMaterial map={tex.pointer} transparent depthWrite={false} depthTest={false} />
      </sprite>
      {Array.from({ length: HAS }, (_, i) => (
        <sprite key={i} ref={(s) => { haRefs.current[i] = s; }} visible={false} renderOrder={9}>
          <spriteMaterial map={tex.ha} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

// ----------------------------------------------------------------- scene

const HEADWEAR = [<Bow key="bow" />, <Beanie key="beanie" />];

function World({ game, onTick, onReady }) {
  const lookRef = useRef(BOARD_GAZE);
  const teacherLookRef = useRef(DAMIAN_HEAD);
  const gripTargetRef = useRef(game.gripTarget);
  const dopamineRef = useRef(0);
  // the teacher's pose is turned in place every frame: Fly.jsx reads it as it goes
  const teacherPose = useMemo(() => ({ ...TEACHER, rotationY: TEACHER_AT_BOARD }), []);
  // the classmates: Damian's pose, moved along the row
  const mates = useMemo(() => CLASSMATE_DZ.map((dz) => ({
    dz,
    pose: { ...FLY, position: [FLY.position[0], FLY.position[1], FLY.position[2] + dz] },
    head: [DAMIAN_HEAD[0], DAMIAN_HEAD[1], DAMIAN_HEAD[2] + dz],
    body: { grip: 0, fear: 0, arousal: 0.1, collapse: 0, headRoll: 0, body: { pitch: 0, yaw: 0, roll: 0, rise: 0 } },
    lookRef: { current: BOARD_GAZE },
  })), []);
  return (
    <>
      <Lights />
      <Rig
        game={game}
        lookRef={lookRef}
        teacherLookRef={teacherLookRef}
        gripTargetRef={gripTargetRef}
        dopamineRef={dopamineRef}
        teacherPose={teacherPose}
        mates={mates}
        onTick={onTick}
        onReady={onReady}
      />
      <Room />
      <Blackboard game={game} />
      <NumberLine />

      <PupilDesk><DamianThings /></PupilDesk>
      <SchoolBag />
      <Stool />
      <Fly machine={game.fly} pose={FLY} gripTargetRef={gripTargetRef} dopamineRef={dopamineRef} lookRef={lookRef} headSlot={<MiddleParting />} />

      {mates.map((m, i) => (
        <group key={m.dz}>
          <PupilDesk dz={m.dz} />
          <Stool offset={[0, 0, m.dz]} />
          <Fly machine={m.body} pose={m.pose} lookRef={m.lookRef} headSlot={HEADWEAR[i % HEADWEAR.length]} />
        </group>
      ))}

      <Fly machine={game.teacher} pose={teacherPose} lookRef={teacherLookRef} headSlot={<Glasses />} />
      <Pops game={game} mates={mates} />
      <ContactShadows position={[0, 0.003, 0]} opacity={0.35} scale={14} blur={2.2} far={4} resolution={1024} color="#3a2a18" />
      <StudioProbe />
    </>
  );
}

export function SixSevenScene({ game, onTick, onReady }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.85]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = BG.clone();
        scene.fog = new THREE.Fog(BG.clone(), 12, 26);
      }}
    >
      <PerspectiveCamera makeDefault fov={CLASS_CAMERA.fov} position={CLASS_CAMERA.position} near={0.05} far={60} />
      <AdaptiveDpr pixelated />
      <Suspense fallback={null}>
        <World game={game} onTick={onTick} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
