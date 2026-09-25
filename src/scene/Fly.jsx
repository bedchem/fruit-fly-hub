/**
 * The fly, with a driveable right foreleg.
 *
 * The CT scan has no skeleton, so the leg is skinned at load time: every vertex
 * gets a pair of weights from src/scene/flyRig.js, uploaded once as a vertex
 * attribute, and the two bone rotations arrive as uniforms. The deformation
 * therefore costs nothing per frame on the CPU — each frame only solves a
 * two-bone IK for the tarsus and writes four numbers.
 *
 * Idle motion (breathing, the antennal twitch, the wing flick) rides on the
 * group transform so it never fights the leg.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { legWeights, headWeight, solveLegIK, solveHeadLook, quatRotate, SHOULDER, HAND, NECK, REACH } from './flyRig.js';
import { FLY, PARTS } from './layout.js';

/** What the fly watches when it is not working the handle: the middle reel. */
const WATCH_REELS = PARTS.reels[1].center;
/** How far it sags when it gives up, in radians: back, and over to one side. */
const SLUMP_PITCH = 0.16;
const SLUMP_ROLL = 0.10;

const VERTEX_COMMON = /* glsl */`
  attribute vec3 aRigWeight;   // x: femur, y: tibia, z: head
  uniform vec4 uBoneA;         // rotation about the coxa
  uniform vec4 uBoneB;         // rotation about the posed femur/tibia joint
  uniform vec4 uHead;          // rotation about the neck
  uniform vec3 uShoulder;
  uniform vec3 uKnee;          // where that joint ended up after uBoneA
  uniform vec3 uNeck;
  vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

const VERTEX_POSITION = /* glsl */`
  vec3 transformed = vec3(position);
  if (aRigWeight.x > 0.0005) {
    vec3 a = uShoulder + qrot(uBoneA, transformed - uShoulder);
    transformed = mix(transformed, a, aRigWeight.x);
    if (aRigWeight.y > 0.0005) {
      vec3 b = uKnee + qrot(uBoneB, transformed - uKnee);
      transformed = mix(transformed, b, aRigWeight.y);
    }
  }
  if (aRigWeight.z > 0.0005) {
    vec3 h = uNeck + qrot(uHead, transformed - uNeck);
    transformed = mix(transformed, h, aRigWeight.z);
  }
`;

const VERTEX_NORMAL = /* glsl */`
  vec3 objectNormal = vec3(normal);
  if (aRigWeight.x > 0.0005) {
    objectNormal = normalize(mix(objectNormal, qrot(uBoneA, objectNormal), aRigWeight.x));
    if (aRigWeight.y > 0.0005) {
      objectNormal = normalize(mix(objectNormal, qrot(uBoneB, objectNormal), aRigWeight.y));
    }
  }
  if (aRigWeight.z > 0.0005) {
    objectNormal = normalize(mix(objectNormal, qrot(uHead, objectNormal), aRigWeight.z));
  }
`;

/** Rest position of the tarsus, in the fly's own space. */
export const REST_HAND = HAND;

/**
 * `lookRef`, if given, is the world point the head should turn to this frame
 * (the bar decides that itself); otherwise it watches the reels and the lever.
 * `mouthRef`, if given, is filled every frame with the mouthparts' world
 * position after the head has turned — what the proboscis grows out of.
 * `pose` places the fly; it defaults to the seat on the casino's stool, and a
 * second fly is the same pose moved along the floor.
 * `headSlot`, if given, is rendered in the fly's own model space and turned
 * with the head every frame — a headset stays on the head it was fitted to.
 */
export function Fly({ machine, gripTargetRef, dopamineRef, lookRef, mouthRef, mouthLocal, pose = FLY, headSlot = null }) {
  const { scene } = useGLTF('/models/fly.glb', '/draco/');
  const groupRef = useRef();
  const headRef = useRef();
  const uniforms = useRef(null);

  const model = useMemo(() => {
    const root = scene.clone(true);
    let mesh = null;
    root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return { root, mesh: null };

    // --- bake the skin weights -------------------------------------------
    const pos = mesh.geometry.getAttribute('position');
    const weights = new Float32Array(pos.count * 3);
    let legCount = 0, headCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const [w1, w2] = legWeights(x, y, z);
      const wh = headWeight(x, y, z);
      weights[i * 3] = w1;
      weights[i * 3 + 1] = w2;
      weights[i * 3 + 2] = wh;
      if (w1 > 0.01) legCount++;
      if (wh > 0.01) headCount++;
    }
    mesh.geometry.setAttribute('aRigWeight', new THREE.BufferAttribute(weights, 3));
    if (import.meta.env.DEV) {
      console.info(`[fly] rigged ${pos.count} vertices: foreleg ${legCount} (${(100 * legCount / pos.count).toFixed(1)}%),`
        + ` head ${headCount} (${(100 * headCount / pos.count).toFixed(1)}%)`);
    }

    // The scan's own material is kept: translucent amber, exactly as
    // downloaded. It is cloned only so the rig shader can be injected without
    // touching useGLTF's cached copy.
    const material = mesh.material.clone();
    material.side = THREE.DoubleSide;
    material.envMapIntensity = 1.0;

    const store = { current: null };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBoneA = { value: new THREE.Vector4(0, 0, 0, 1) };
      shader.uniforms.uBoneB = { value: new THREE.Vector4(0, 0, 0, 1) };
      shader.uniforms.uHead = { value: new THREE.Vector4(0, 0, 0, 1) };
      shader.uniforms.uShoulder = { value: new THREE.Vector3(...SHOULDER) };
      shader.uniforms.uKnee = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.uNeck = { value: new THREE.Vector3(...NECK) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERTEX_COMMON)
        .replace('#include <beginnormal_vertex>', VERTEX_NORMAL)
        .replace('#include <begin_vertex>', VERTEX_POSITION);
      store.current = shader.uniforms;
    };
    material.customProgramCacheKey = () => 'fly-foreleg-rig';

    mesh.material = material;
    // A translucent mesh casting a shadow map reads as solid, which is right
    // here — the fly still needs to sit on the stool rather than hover over it.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { root, mesh, store };
  }, [scene]);

  useLayoutEffect(() => { uniforms.current = model.store; }, [model]);

  // scratch, reused every frame
  const tmp = useMemo(() => ({
    world: new THREE.Vector3(),
    local: new THREE.Vector3(),
    rest: new THREE.Vector3(...HAND),
    target: new THREE.Vector3(),
  }), []);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const dop = dopamineRef?.current ?? 0;

    // --- idle life -------------------------------------------------------
    // Breathing, a slow weight shift, and — as the fly gets wound up — a
    // faster tremor on top. Fear also pulls it back from the machine slightly,
    // the way anything nervous leans away from what it is afraid of.
    const fear = machine?.fear ?? 0;
    const arousal = machine?.arousal ?? dop;
    // Out of credit, it gives up: the breathing and the tremor fade out and it
    // sags back and to one side on the stool.
    const slump = machine?.collapse ?? 0;
    const alive = 1 - slump;
    const breathe = (Math.sin(t * 1.35) * 0.006 + Math.sin(t * 3.1) * 0.002) * (0.25 + 0.75 * alive);
    // a fresh nicotine pouch: a quick shiver that runs through it and fades
    const tingle = (machine?.tingle ?? 0) * alive;
    const tremor = arousal * (Math.sin(t * 22) * 0.004 + Math.sin(t * 31.3) * 0.003)
      + fear * alive * Math.sin(t * 41) * 0.0035
      + tingle * (Math.sin(t * 63) * 0.005 + Math.sin(t * 47.3) * 0.003);
    // drunk, it sways on the stool; poisoned, it convulses
    const sway = (machine?.sway ?? 0) * alive;
    const fit = machine?.seizureFit ?? 0;
    const convulse = fit * (Math.sin(t * 47) * 0.02 + Math.sin(t * 29.3) * 0.015);
    g.position.y = pose.position[1] + breathe + tremor - slump * 0.012 + fit * Math.sin(t * 38) * 0.006;
    g.rotation.y = pose.rotationY + (Math.sin(t * 0.47) * 0.012 + arousal * Math.sin(t * 9.7) * 0.008) * alive
      + sway * Math.sin(t * 0.9) * 0.05 + convulse;
    g.rotation.z = (Math.sin(t * 0.83) * 0.006 + fear * Math.sin(t * 5.3) * 0.012) * alive + slump * SLUMP_ROLL
      + sway * (Math.sin(t * 0.61) * 0.07 + Math.sin(t * 1.37) * 0.025) + convulse * 1.3
      + tingle * Math.sin(t * 57) * 0.014;
    // FLY.pitch is what sits the fly up on the stool; the lean is the extra
    // tip it gives the handle on the way down.
    const lean = (machine?.grip ?? 0) * -(machine?.pullProgress ?? 0);
    // at the bar it bends over the straw
    const stoop = (machine?.lean ?? 0) * 0.07;
    g.rotation.x = pose.pitch + lean * 0.06 + stoop - fear * alive * 0.055 - slump * SLUMP_PITCH;

    const u = uniforms.current?.current;
    if (!u) return;

    // --- the gaze --------------------------------------------------------
    // Sitting upright leaves the scan looking at the ceiling, so the head is
    // turned onto whatever it should be watching: the reels while they run,
    // the handle while the fly is working it.
    const watch = lookRef?.current
      ?? ((machine?.grip ?? 0) > 0.35 ? (gripTargetRef?.current ?? WATCH_REELS) : WATCH_REELS);
    // collapsed, it stops watching the reels and the head drops
    tmp.world.set(watch[0], watch[1] - slump * 0.45, watch[2]);
    g.worldToLocal(tmp.local.copy(tmp.world));
    const glance = Math.sin(t * 0.8) * 0.012;
    const look = solveHeadLook([tmp.local.x + glance, tmp.local.y + glance * 0.6, tmp.local.z]);
    u.uHead.value.set(look[0], look[1], look[2], look[3]);
    // whatever is worn on the head turns with it, rigidly, about the same neck
    if (headRef.current) headRef.current.quaternion.set(look[0], look[1], look[2], look[3]);
    if (mouthRef && mouthLocal) {
      // Match the shader's blended head weight: the mouth is at the soft edge
      // of the neck mask, so a full rotation would detach the pouch and straw.
      const off = quatRotate(look, [mouthLocal[0] - NECK[0], mouthLocal[1] - NECK[1], mouthLocal[2] - NECK[2]]);
      const weight = headWeight(...mouthLocal);
      tmp.world.set(
        mouthLocal[0] + (NECK[0] + off[0] - mouthLocal[0]) * weight,
        mouthLocal[1] + (NECK[1] + off[1] - mouthLocal[1]) * weight,
        mouthLocal[2] + (NECK[2] + off[2] - mouthLocal[2]) * weight,
      );
      g.localToWorld(tmp.world);
      mouthRef.current = [tmp.world.x, tmp.world.y, tmp.world.z];
    }

    // --- the foreleg -----------------------------------------------------
    const grip = machine?.grip ?? 0;
    if (grip <= 0.0005) {
      u.uBoneA.value.set(0, 0, 0, 1);
      u.uBoneB.value.set(0, 0, 0, 1);
      return;
    }

    // where the knob is, converted into the fly's own space
    const knob = gripTargetRef?.current;
    if (!knob) return;
    tmp.world.set(knob[0], knob[1], knob[2]);
    g.worldToLocal(tmp.local.copy(tmp.world));

    // ease from the rest pose to the knob as the fly commits to the handle
    tmp.target.copy(tmp.rest).lerp(tmp.local, grip);

    const leg = solveLegIK([tmp.target.x, tmp.target.y, tmp.target.z]);
    u.uBoneA.value.set(leg.q1[0], leg.q1[1], leg.q1[2], leg.q1[3]);
    u.uBoneB.value.set(leg.q2[0], leg.q2[1], leg.q2[2], leg.q2[3]);
    u.uKnee.value.set(leg.knee[0], leg.knee[1], leg.knee[2]);

    if (import.meta.env.DEV && leg.overextended && !Fly._warned) {
      Fly._warned = true;
      console.warn('[fly] foreleg cannot reach the knob — check FLY.scale / FLY.position in layout.js', {
        reach: REACH, needed: tmp.target.distanceTo(new THREE.Vector3(...SHOULDER)),
      });
    }
  });

  // Only the material is ours to dispose — the geometry belongs to useGLTF's
  // cache and is handed back on the next mount.
  useEffect(() => () => { model.mesh?.material.dispose(); }, [model]);

  return (
    /* 'YXZ': yaw first, then the pitch in the fly's own frame — the same order
       tools/preview.mjs and layout.js build their matrices in. */
    <group
      ref={groupRef}
      position={pose.position}
      rotation={[pose.pitch, pose.rotationY, 0, 'YXZ']}
      scale={pose.scale}
    >
      <primitive object={model.root} />
      {headSlot && (
        /* the shader turns the head as neck + q·(p − neck); so does this pair of groups */
        <group ref={headRef} position={NECK}>
          <group position={[-NECK[0], -NECK[1], -NECK[2]]}>{headSlot}</group>
        </group>
      )}
    </group>
  );
}

useGLTF.preload('/models/fly.glb', '/draco/');
