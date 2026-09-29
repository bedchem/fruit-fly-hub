/**
 * The pub table and what is on it: varnished oak with old beer rings, a beer
 * mat, puddles of spilled beer with foam at their edges, and — huge at the
 * fly's scale, well out of its way — a bottle on its side still running into
 * the first puddle, and a pint with bubbles rising through it.
 *
 * Everything is drawn from primitives and canvas textures, painted once: no
 * model to download, nothing to decode.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PUDDLES, puddleEdge, BOTTLE, PINT, MAT } from './swatLayout.js';

export const BEER = '#c77d1c';
const BEER_DEEP = '#8a4a0c';
const FOAM = '#fff6e2';

function rngFrom(seed) {
  let s = seed * 16807 % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function canvasTexture(w, h, paint, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ table

/**
 * Dark varnished oak: planks, grain, knots, and the rings a hundred wet
 * glasses left. The same grain, in grey, is the bump map and — inverted in
 * the rings — the roughness map, so the varnish is glossy where it is intact
 * and dull where beer has eaten into it.
 */
function useTableTextures() {
  return useMemo(() => {
    const planks = 5;
    const grain = [];
    const rnd = rngFrom(7);
    for (let p = 0; p < planks; p++) {
      const lines = [];
      for (let g = 0; g < 90; g++) lines.push({ y: rnd(), a: 0.05 + rnd() * 0.16, w: 0.6 + rnd() * 2.4, ph: rnd() * 10 });
      const knot = rnd() < 0.75 ? { x: rnd(), y: 0.3 + rnd() * 0.4, r: 16 + rnd() * 20 } : null;
      grain.push({ tone: rnd(), lines, knot });
    }
    const rings = Array.from({ length: 7 }, () => ({ x: rnd(), y: rnd(), r: 40 + rnd() * 50, a: 0.12 + rnd() * 0.18 }));

    const paint = (ctx, W, H, mode) => {
      const ph = H / planks;
      grain.forEach((pl, p) => {
        const y0 = p * ph;
        if (mode === 'color') {
          const t = 62 + pl.tone * 18;
          ctx.fillStyle = `rgb(${t + 58}, ${t + 16}, ${t - 22})`;
        } else ctx.fillStyle = mode === 'bump' ? '#808080' : '#5a5a5a';
        ctx.fillRect(0, y0, W, ph);
        for (const l of pl.lines) {
          const y = y0 + l.y * ph;
          ctx.strokeStyle = mode === 'color' ? `rgba(40, 18, 6, ${l.a * 1.6})` : `rgba(0, 0, 0, ${l.a * (mode === 'bump' ? 2.2 : 0.8)})`;
          ctx.lineWidth = l.w;
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.005 + l.ph) * 6);
          ctx.stroke();
        }
        if (pl.knot) {
          const kx = pl.knot.x * W, ky = y0 + pl.knot.y * ph;
          const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, pl.knot.r);
          grad.addColorStop(0, mode === 'color' ? 'rgba(30, 12, 4, 0.75)' : 'rgba(0,0,0,0.6)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.ellipse(kx, ky, pl.knot.r * 1.8, pl.knot.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        }
        // the gap between planks
        ctx.fillStyle = mode === 'color' ? 'rgba(18, 8, 2, 0.9)' : 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, y0, W, 4);
      });
      // old beer rings: a darker ring where the varnish has gone dull
      for (const r of rings) {
        ctx.strokeStyle = mode === 'color' ? `rgba(35, 15, 4, ${r.a})`
          : mode === 'rough' ? `rgba(255,255,255,${r.a * 2.5})` : `rgba(0,0,0,${r.a})`;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(r.x * W, r.y * H, r.r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x * W, r.y * H, r.r - 6, 0.4, Math.PI * 1.7); ctx.stroke();
      }
    };
    const opts = { repeat: [3, 3] };
    return {
      map: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'color'), opts),
      bump: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'bump'), { ...opts, srgb: false }),
      rough: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'rough'), { ...opts, srgb: false }),
    };
  }, []);
}

export function Table() {
  const t = useTableTextures();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[90, 90]} />
      <meshPhysicalMaterial
        map={t.map}
        bumpMap={t.bump}
        bumpScale={0.6}
        roughnessMap={t.rough}
        roughness={0.55}
        clearcoat={0.3}
        clearcoatRoughness={0.45}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}

/** A printed beer mat, a little curled at the edge from the damp. */
export function BeerMat({ x = MAT.x, z = MAT.z, radius = MAT.radius, spin = 0.4 }) {
  const map = useMemo(() => canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#efe4cc';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#1f4f3a';
    ctx.beginPath(); ctx.arc(256, 256, 236, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#efe4cc';
    ctx.beginPath(); ctx.arc(256, 256, 214, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9952e'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(256, 256, 196, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1f4f3a';
    ctx.textAlign = 'center';
    ctx.font = '800 64px Inter, system-ui, sans-serif';
    ctx.fillText('FLY LAB', 256, 230);
    ctx.font = '700 44px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#b1531b';
    ctx.fillText('BRÄU', 256, 290);
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#1f4f3a';
    ctx.fillText('SEIT 60.001 NEURONEN', 256, 340);
    // a wet ring from the glass that stood here
    ctx.strokeStyle = 'rgba(140, 90, 30, 0.28)'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(280, 240, 150, 0, Math.PI * 2); ctx.stroke();
  }), []);
  return (
    <group position={[x, 0, z]} rotation={[0, spin, 0]}>
      <mesh position={[0, 0.025, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[radius, radius, 0.05, 64]} />
        <meshStandardMaterial attach="material-0" color="#d8c8a8" roughness={0.95} />
        <meshStandardMaterial attach="material-1" map={map} roughness={0.9} />
        <meshStandardMaterial attach="material-2" color="#d8c8a8" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- puddles

function puddleShape(p) {
  const shape = new THREE.Shape();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = puddleEdge(p, a);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  return shape;
}

/**
 * One puddle: a thin extruded blob with a rounded (bevelled) edge, so light
 * catches its meniscus, a lace of foam bubbles round the rim that swell and
 * pop, and a ripple whenever something lands in it or drinks from it.
 */
function Puddle({ p, rippleRef }) {
  const geom = useMemo(() => new THREE.ExtrudeGeometry(puddleShape(p), {
    depth: 0.004, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.07, bevelSegments: 4, curveSegments: 72,
  }), [p]);
  const foam = useMemo(() => {
    const rnd = rngFrom(p.seed * 13 + 5);
    const out = [];
    const n = Math.round(40 + p.r * 70);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const edge = puddleEdge(p, a);
      const inward = rnd() < 0.8 ? edge * (0.82 + rnd() * 0.16) : edge * rnd() * 0.7;
      out.push({ x: Math.cos(a) * inward, z: Math.sin(a) * inward, s: 0.012 + rnd() * 0.03, ph: rnd() * 10, sp: 0.4 + rnd() * 1.2 });
    }
    return out;
  }, [p]);
  const foamRef = useRef();
  const ringRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const inst = foamRef.current;
    if (inst) {
      foam.forEach((b, i) => {
        // each bubble swells and pops, then another takes its place
        const life = (t * b.sp + b.ph) % 1;
        const s = b.s * (life < 0.9 ? 0.5 + life * 0.6 : (1 - life) * 10 * 1.04);
        dummy.position.set(b.x, 0.045, b.z);
        dummy.scale.setScalar(Math.max(0.001, s));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
    // a ripple spreading from where it was disturbed
    const r = rippleRef?.current;
    const ring = ringRef.current;
    if (ring) {
      const age = r && r.puddle === p ? t - r.at : 99;
      ring.visible = age < 1.2;
      if (ring.visible) {
        const k = age / 1.2;
        ring.position.set(r.x - p.x, 0.047, r.z - p.z);
        ring.scale.setScalar(0.15 + k * 1.1 * r.size);
        ring.material.opacity = (1 - k) * 0.45;
      }
    }
  });
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh geometry={geom} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.036, 0]} receiveShadow>
        <meshPhysicalMaterial
          color={BEER}
          emissive={BEER_DEEP}
          emissiveIntensity={0.18}
          roughness={0.06}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          transparent
          opacity={0.84}
        />
      </mesh>
      <instancedMesh ref={foamRef} args={[null, null, foam.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={FOAM} roughness={0.35} />
      </instancedMesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial color="#fff2cf" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Puddles({ rippleRef }) {
  return <group>{PUDDLES.map((p) => <Puddle key={p.seed} p={p} rippleRef={rippleRef} />)}</group>;
}

// ----------------------------------------------------------------- bottle

/** A long-neck bottle's profile, for a lathe: base to lip, radius over height. */
function bottleProfile(R, L) {
  const pts = [];
  const neckR = R * 0.36;
  const body = L * 0.58, shoulder = L * 0.2;
  pts.push(new THREE.Vector2(0.001, 0));
  pts.push(new THREE.Vector2(R * 0.92, 0));
  pts.push(new THREE.Vector2(R, R * 0.12));
  pts.push(new THREE.Vector2(R, body));
  for (let i = 1; i <= 10; i++) {
    const k = i / 10;
    pts.push(new THREE.Vector2(neckR + (R - neckR) * (1 - k) * (1 - k) * 0.9 + (R - neckR) * 0.1 * (1 - k), body + shoulder * k));
  }
  pts.push(new THREE.Vector2(neckR, L - R * 0.3));
  pts.push(new THREE.Vector2(neckR * 1.18, L - R * 0.26));
  pts.push(new THREE.Vector2(neckR * 1.18, L - R * 0.08));
  pts.push(new THREE.Vector2(neckR * 0.92, L));
  return pts;
}

/** The bottle on its side, beer still running out of the neck to the first puddle. */
export function Bottle() {
  const { x, z, yaw, radius: R, length: L } = BOTTLE;
  const geom = useMemo(() => new THREE.LatheGeometry(bottleProfile(R, L), 48), [R, L]);
  const label = useMemo(() => canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = '#f1e2bd';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#7c1d12';
    ctx.fillRect(0, 40, 1024, 26); ctx.fillRect(0, 446, 1024, 26);
    ctx.fillStyle = '#7c1d12';
    ctx.textAlign = 'center';
    ctx.font = '800 118px Georgia, serif';
    ctx.fillText('DROSOPHILA', 512, 230);
    ctx.font = 'italic 600 64px Georgia, serif';
    ctx.fillStyle = '#9b6a1c';
    ctx.fillText('Lager · 5,0 % vol', 512, 330);
    ctx.font = '600 34px Georgia, serif';
    ctx.fillStyle = '#7c1d12';
    ctx.fillText('gebraut für 60.001 Neuronen', 512, 400);
  }), []);
  // the neck points at the first puddle; the bottle lies with its axis along that line
  const neck = yaw;
  const stream = useMemo(() => {
    const p = PUDDLES[0];
    const dir = [Math.sin(neck), Math.cos(neck)];
    const lip = [x + dir[0] * (L - R * 0.1), z + dir[1] * (L - R * 0.1)];
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push(new THREE.Vector3(
        lerp(lip[0], p.x, k) + Math.sin(k * 7) * 0.5 * (1 - k),
        0.03,
        lerp(lip[1], p.z, k) + Math.cos(k * 5) * 0.4 * (1 - k),
      ));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.16, 8, false);
  }, [neck, x, z, L, R]);
  return (
    <group>
      <group position={[x, R, z]} rotation={[0, neck, 0]}>
        {/* the lathe runs along +Y; lay it down along +Z, towards the puddle */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={geom} castShadow receiveShadow>
            <meshPhysicalMaterial color="#4a2208" roughness={0.08} metalness={0.05} clearcoat={1} transparent opacity={0.86} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, L * 0.3, 0]}>
            <cylinderGeometry args={[R * 1.004, R * 1.004, L * 0.3, 48, 1, true]} />
            <meshStandardMaterial map={label} roughness={0.7} />
          </mesh>
          {/* what is left inside, lying along the low side */}
          <mesh position={[0, L * 0.3, R * 0.45]} scale={[0.9, 1, 0.4]}>
            <cylinderGeometry args={[R * 0.9, R * 0.9, L * 0.56, 32]} />
            <meshStandardMaterial color={BEER} emissive={BEER_DEEP} emissiveIntensity={0.3} roughness={0.2} transparent opacity={0.7} />
          </mesh>
        </group>
      </group>
      <mesh geometry={stream} scale={[1, 0.18, 1]} receiveShadow>
        <meshPhysicalMaterial color={BEER} emissive={BEER_DEEP} emissiveIntensity={0.2} roughness={0.05} clearcoat={1} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------- pint

/** A pint on its own mat: glass, beer, a head of foam, bubbles rising, beads of condensation. */
export function Pint() {
  const { x, z, radius: R, height: H } = PINT;
  const glass = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0), new THREE.Vector2(R * 0.78, 0), new THREE.Vector2(R * 0.8, 0.4),
    new THREE.Vector2(R * 0.97, H * 0.8), new THREE.Vector2(R * 1.05, H * 0.88), new THREE.Vector2(R, H),
  ], 64), [R, H]);
  const beerH = H * 0.78;
  const bubbles = useMemo(() => {
    const rnd = rngFrom(99);
    return Array.from({ length: 140 }, () => ({
      a: rnd() * Math.PI * 2, r: Math.sqrt(rnd()) * R * 0.72, sp: 1.5 + rnd() * 3, ph: rnd() * beerH, s: 0.05 + rnd() * 0.08,
    }));
  }, [R, beerH]);
  const beads = useMemo(() => {
    const rnd = rngFrom(123);
    return Array.from({ length: 160 }, () => {
      const y = 0.6 + rnd() * (beerH - 0.8);
      const r = R * (0.8 + (0.17 * y) / (H * 0.8)) + 0.04;
      const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.3; // on the side facing the room
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r * -1, s: 0.06 + rnd() * 0.12 };
    });
  }, [R, H, beerH]);
  const bubRef = useRef();
  const beadRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const inst = bubRef.current;
    if (!inst) return;
    bubbles.forEach((b, i) => {
      const y = (b.ph + t * b.sp) % beerH;
      dummy.position.set(Math.cos(b.a) * b.r + Math.sin(t * 3 + i) * 0.03, y + 0.3, Math.sin(b.a) * b.r);
      dummy.scale.setScalar(b.s * (0.6 + y / beerH));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
  });
  const setBeads = (inst) => {
    if (!inst) return;
    beadRef.current = inst;
    beads.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(b.s, b.s * 1.3, b.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  return (
    <group>
      <BeerMat x={x} z={z} radius={R * 1.7} spin={-0.3} />
      <group position={[x, 0.05, z]}>
        <mesh position={[0, beerH / 2 + 0.3, 0]} castShadow>
          <cylinderGeometry args={[R * 0.93, R * 0.8, beerH, 64]} />
          <meshStandardMaterial color={BEER} emissive={BEER_DEEP} emissiveIntensity={0.35} roughness={0.25} transparent opacity={0.9} />
        </mesh>
        {/* the head */}
        <mesh position={[0, beerH + 0.3 + H * 0.05, 0]} castShadow>
          <cylinderGeometry args={[R * 0.99, R * 0.94, H * 0.1, 64]} />
          <meshStandardMaterial color={FOAM} roughness={0.9} />
        </mesh>
        <mesh position={[0, beerH + 0.3 + H * 0.1, 0]} scale={[1, 0.22, 1]}>
          <sphereGeometry args={[R * 0.99, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={FOAM} roughness={0.95} />
        </mesh>
        <instancedMesh ref={bubRef} args={[null, null, bubbles.length]} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#ffe9b0" transparent opacity={0.8} />
        </instancedMesh>
        <mesh geometry={glass}>
          <meshPhysicalMaterial color="#ffffff" roughness={0.03} metalness={0} clearcoat={1} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <instancedMesh ref={setBeads} args={[null, null, beads.length]} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshPhysicalMaterial color="#ffffff" roughness={0} clearcoat={1} transparent opacity={0.55} />
        </instancedMesh>
      </group>
    </group>
  );
}
