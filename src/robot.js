// Procedural robots. A single `level` (0..1) drives how humanoid a bot is:
// geometry (boxes -> rounded -> capsules), proportions, joints, and gait
// (stop-motion stagger -> stiff walk -> fluid stride).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { lerp, clamp, smoothstep, mulberry32, hashStr } from './sim.js';

const TAU = Math.PI * 2;

function limbGeo(w, len, d, L) {
  let g;
  if (L < 0.3) g = new THREE.BoxGeometry(w, len, d);
  else if (L < 0.62) g = new RoundedBoxGeometry(w, len, d, 3, Math.min(w, d) * 0.3);
  else {
    const r = w / 2;
    g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14);
    g.scale(1, 1, d / w);
  }
  g.translate(0, -len / 2, 0); // hangs down from its pivot
  return g;
}

function blockGeo(w, h, d, L, radiusK = 0.3) {
  if (L < 0.3) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * radiusK * (0.6 + L * 0.8));
}

export function buildRobot(bot) {
  const L = bot.level;
  const rnd = mulberry32(hashStr(bot.id + 'build'));
  const wonk = 1 - smoothstep(0.1, 0.7, L);
  const accent = new THREE.Color(bot.color);

  const shell = new THREE.Color().lerpColors(new THREE.Color(0x6a615a), new THREE.Color(0xdde3ec), smoothstep(0.05, 0.9, L));
  shell.lerp(accent, 0.08 + 0.1 * L);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: shell, metalness: lerp(0.3, 0.8, L), roughness: lerp(0.85, 0.3, L),
  });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x1b1d23, metalness: 0.6, roughness: 0.5 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().lerpColors(new THREE.Color(0x3a3430), accent.clone().multiplyScalar(0.55), L),
    metalness: 0.5, roughness: 0.5,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: accent, emissiveIntensity: 2.2, roughness: 0.4,
  });

  const D = {
    footH: 0.12,
    legLen: lerp(0.42, 0.85, L),
    torsoH: lerp(0.62, 0.74, L),
    torsoW: lerp(1.0, 0.72, L),
    torsoD: lerp(0.78, 0.46, L),
    neckH: L < 0.3 ? 0 : lerp(0.02, 0.1, L),
    headS: lerp(0.62, 0.42, L),
    legW: lerp(0.42, 0.2, L),
    armW: lerp(0.34, 0.15, L),
    armLen: lerp(0.62, 0.92, L),
  };
  const swing = lerp(0.3, 0.52, L);
  const stride = TAU * swing * D.legLen;

  const root = new THREE.Group();
  const hips = new THREE.Group();
  root.add(hips);
  const mk = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };

  // pelvis
  const pelvis = mk(blockGeo(D.torsoD * 0.9, 0.2, D.torsoW * 0.85, L), trimMat);
  hips.add(pelvis);

  // torso
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 0.06;
  hips.add(torsoPivot);
  const torso = mk(blockGeo(D.torsoD, D.torsoH, D.torsoW, L, 0.35), bodyMat);
  torso.position.y = D.torsoH / 2;
  torsoPivot.add(torso);
  const chest = mk(new THREE.BoxGeometry(0.04, D.torsoH * 0.22, D.torsoW * 0.32), glowMat);
  chest.position.set(D.torsoD / 2 + 0.01, D.torsoH * 0.62, 0);
  torsoPivot.add(chest);
  if (L > 0.45) { // backpack / power core
    const pack = mk(blockGeo(0.16, D.torsoH * 0.6, D.torsoW * 0.55, L), trimMat);
    pack.position.set(-D.torsoD / 2 - 0.07, D.torsoH * 0.55, 0);
    torsoPivot.add(pack);
  }
  if (L < 0.4) { // exposed cables on the primitive models
    for (let i = 0; i < 2; i++) {
      const c = mk(new THREE.CylinderGeometry(0.025, 0.025, D.torsoH * 0.7, 6), jointMat);
      c.position.set(-D.torsoD / 2 + 0.05, D.torsoH * 0.5, (i ? 1 : -1) * D.torsoW * 0.3);
      c.rotation.x = (rnd() - 0.5) * 0.4;
      torsoPivot.add(c);
    }
  }

  // head
  const headPivot = new THREE.Group();
  headPivot.position.y = D.torsoH + D.neckH;
  torsoPivot.add(headPivot);
  if (D.neckH > 0) {
    const neck = mk(new THREE.CylinderGeometry(0.07, 0.09, D.neckH + 0.06, 10), jointMat);
    neck.position.y = -D.neckH / 2;
    headPivot.add(neck);
  }
  const hs = D.headS;
  const headW = hs * lerp(1.25, 0.95, L);
  const head = mk(
    L < 0.3 ? new THREE.BoxGeometry(hs, hs * 0.85, headW)
      : L < 0.62 ? new RoundedBoxGeometry(hs, hs * 0.9, headW, 4, hs * 0.2)
        : new RoundedBoxGeometry(hs * 1.02, hs * 0.95, headW, 6, hs * 0.42),
    bodyMat);
  head.position.y = hs * 0.45;
  headPivot.add(head);
  const eyes = [];
  if (L < 0.15) { // one cyclops eye
    const e = mk(new THREE.BoxGeometry(0.04, hs * 0.22, hs * 0.22), glowMat);
    e.position.set(hs / 2 + 0.01, hs * 0.5, hs * 0.12);
    headPivot.add(e); eyes.push(e);
  } else if (L < 0.62) { // two eyes, uneven on the older ones
    for (const s of [-1, 1]) {
      const e = mk(new THREE.BoxGeometry(0.04, hs * (0.18 - 0.05 * L), hs * 0.18), glowMat);
      e.position.set(hs / 2 + 0.01, hs * (0.5 + 0.06 * wonk * s), s * headW * 0.24);
      headPivot.add(e); eyes.push(e);
    }
  } else { // visor
    const vis = mk(new RoundedBoxGeometry(0.05, hs * 0.26, headW * 0.78, 3, 0.02), jointMat);
    vis.position.set(hs * 0.5, hs * 0.5, 0);
    headPivot.add(vis);
    const strip = mk(new THREE.BoxGeometry(0.03, hs * 0.07, headW * 0.6), glowMat);
    strip.position.set(hs * 0.5 + 0.03, hs * 0.5, 0);
    headPivot.add(strip); eyes.push(strip);
  }
  if (L < 0.5) { // bent antenna
    const a = mk(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 5), jointMat);
    a.position.set(-0.05, hs * 0.9 + 0.14, headW * 0.25);
    a.rotation.z = 0.3 + rnd() * 0.5;
    headPivot.add(a);
    const tip = mk(new THREE.SphereGeometry(0.035, 8, 6), glowMat);
    tip.position.set(-0.05 - Math.sin(a.rotation.z) * 0.16, hs * 0.9 + 0.14 + Math.cos(a.rotation.z) * 0.16, headW * 0.25);
    headPivot.add(tip);
  }
  // primitive bots have a crooked head
  headPivot.rotation.z = (rnd() - 0.5) * 0.45 * wonk;
  headPivot.rotation.x = (rnd() - 0.5) * 0.3 * wonk;
  const headBase = { z: headPivot.rotation.z, x: headPivot.rotation.x };

  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, D.torsoH - D.armW * 0.55 - 0.04, s * (D.torsoW / 2 + D.armW * 0.5));
    torsoPivot.add(shoulder);
    const shortK = 1 - 0.28 * wonk * (rnd() > 0.5 ? 1 : 0);
    const hasElbow = L >= 0.3;
    const upperLen = hasElbow ? D.armLen * 0.5 * shortK : D.armLen * shortK;
    const upper = mk(limbGeo(D.armW, upperLen, D.armW, L), bodyMat);
    shoulder.add(upper);
    if (L >= 0.3) {
      const ball = mk(new THREE.SphereGeometry(D.armW * 0.62, 10, 8), jointMat);
      shoulder.add(ball);
    }
    const elbow = new THREE.Group();
    elbow.position.y = -upperLen;
    shoulder.add(elbow);
    let tip = elbow, tipY = 0;
    if (hasElbow) {
      const eb = mk(new THREE.SphereGeometry(D.armW * 0.55, 8, 6), jointMat);
      elbow.add(eb);
      const foreLen = D.armLen * 0.5 * shortK;
      const fore = mk(limbGeo(D.armW * 0.88, foreLen, D.armW * 0.88, L), bodyMat);
      elbow.add(fore);
      tipY = -foreLen;
    }
    const hand = mk(
      L < 0.62 ? new THREE.BoxGeometry(D.armW * 1.1, D.armW * 1.1, D.armW * 1.1)
        : new THREE.SphereGeometry(D.armW * 0.62, 10, 8),
      L < 0.62 ? trimMat : bodyMat);
    hand.position.y = tipY - D.armW * 0.45;
    tip.add(hand);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(D.armW * 0.6, tipY - D.armW * 0.45, 0);
    tip.add(muzzle);
    arms.push({ shoulder, elbow, hasElbow, muzzle, hand, side: s });
  }

  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0, -0.08, s * D.torsoW * 0.28);
    hips.add(hip);
    const hasKnee = L >= 0.3;
    const thickK = s > 0 ? 1 + 0.25 * wonk : 1;
    const upLen = hasKnee ? D.legLen * 0.5 : D.legLen;
    const thigh = mk(limbGeo(D.legW * thickK, upLen, D.legW * thickK, L), bodyMat);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -upLen;
    hip.add(knee);
    let tip = knee, tipY = 0;
    if (hasKnee) {
      const kb = mk(new THREE.SphereGeometry(D.legW * 0.58, 8, 6), jointMat);
      knee.add(kb);
      const shin = mk(limbGeo(D.legW * 0.9, D.legLen * 0.5, D.legW * 0.9, L), bodyMat);
      knee.add(shin);
      tipY = -D.legLen * 0.5;
    }
    const foot = new THREE.Group();
    foot.position.y = tipY;
    tip.add(foot);
    const fm = mk(blockGeo(D.legW * 1.9, D.footH + 0.02, D.legW * 1.15, L), trimMat);
    fm.position.set(D.legW * 0.55, -D.footH / 2, 0);
    foot.add(fm);
    legs.push({ hip, knee, foot, hasKnee, side: s });
  }
  hips.position.y = D.legLen + D.footH;

  const H = D.legLen + D.footH + D.torsoH + D.neckH + hs * 0.95;
  const nameAnchor = new THREE.Object3D();
  nameAnchor.position.y = H + 0.7;
  root.add(nameAnchor);

  return {
    bot, root, hips, torsoPivot, headPivot, headBase, arms, legs, eyes, chest, glowMat,
    D, L, wonk, swing, stride, H, nameAnchor,
    kneeBend: L < 0.3 ? 0 : lerp(0.4, 1.05, smoothstep(0.3, 0.9, L)),
  };
}

// ---------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------

const pw = (a, b, x) => smoothstep(a, b, x);

// Returns target {armR, armL, elbowR, elbowL, lean, twist, glow} for a strike.
function strikePose(kind, dt, L) {
  const hasElbow = L >= 0.3 ? 1 : 0;
  const o = { armR: null, armL: null, elbowR: 0, elbowL: 0, lean: 0, twist: 0, glow: 0, w: 0 };
  if (kind === 'punch') {
    const wind = pw(-0.55, -0.06, dt), hit = pw(-0.06, 0.07, dt), rec = pw(0.25, 0.9, dt);
    const k = 1 - rec;
    o.w = pw(-0.7, -0.45, dt) * k;
    o.armR = lerp(lerp(0.3, -1.1, wind), 1.55, hit) ;
    o.elbowR = hasElbow * lerp(1.3 * wind, 0.1, hit);
    o.armL = lerp(0.3, -0.5, wind) * k;
    o.lean = -0.1 * wind - 0.28 * hit;
    o.twist = 0.5 * wind - 0.9 * hit;
    o.glow = 1.5 * hit * k;
  } else if (kind === 'slam') {
    const wind = pw(-0.9, -0.12, dt), hit = pw(-0.12, 0.08, dt), rec = pw(0.3, 1.3, dt);
    const k = 1 - rec;
    o.w = pw(-1.0, -0.7, dt) * k;
    const up = lerp(0.2, -2.7, wind), down = 1.2;
    o.armR = o.armL = lerp(up, down, hit);
    o.elbowR = o.elbowL = hasElbow * lerp(0.4 * wind, 0.1, hit);
    o.lean = 0.2 * wind - 0.6 * hit;
    o.glow = 1.8 * hit * k;
  } else if (kind === 'charge') {
    const run = pw(-1.1, -0.3, dt), hit = pw(-0.05, 0.1, dt), rec = pw(0.7, 1.6, dt);
    const k = 1 - rec;
    o.w = pw(-1.2, -0.9, dt) * k;
    o.lean = (-0.42 * run - 0.2 * hit) * k;
    o.armR = o.armL = lerp(-0.9 * run, 1.3, hit) * k;
    o.elbowR = o.elbowL = hasElbow * 0.5 * hit * k;
    o.glow = 2 * hit * k;
  } else if (kind === 'beam') {
    const on = pw(0, 0.5, dt);
    o.w = on;
    o.armR = 1.55 * on;
    o.armL = 0.7 * on;
    o.elbowR = 0;
    o.lean = -0.12 * on;
    o.glow = 2.5 * on;
  }
  return o;
}

const mix = (a, b, w) => (b == null ? a : lerp(a, b, w));

export function poseRobot(r, st, t) {
  const { D, L } = r;
  const smooth = smoothstep(0.18, 0.55, L);
  const phase = (st.x / r.stride) * TAU;
  const q = Math.PI / 3;
  const ph = lerp(Math.round(phase / q) * q, phase, smooth);
  const move = clamp(Math.abs(st.v) / 0.55, 0, 1) * (1 - 0.0);
  const dir = st.v < -0.01 ? -1 : 1;

  // gait
  const A = r.swing * move;
  const sinP = Math.sin(ph);
  r.legs.forEach((leg, i) => {
    const psi = i === 0 ? 0 : Math.PI;
    const thigh = A * Math.sin(ph + psi);
    leg.hip.rotation.z = thigh;
    const kneeA = leg.hasKnee ? -r.kneeBend * Math.max(0, Math.cos(ph + psi)) * move : 0;
    leg.knee.rotation.z = kneeA;
    leg.foot.rotation.z = -(thigh + kneeA) * 0.7;
  });
  r.hips.position.y = (D.legLen + D.footH) * Math.cos(A * Math.abs(sinP)) + 0.005;
  const bob = (1 - smooth) * 0.03 * move * Math.sin(ph * 2);
  r.hips.position.y += bob;

  // idle life
  const breathe = Math.sin(t * 1.7 + r.bot.seed * 9) * 0.012 * (0.4 + L);
  const twitch = (1 - smooth) * (Math.sin(Math.floor(t * 7 + r.bot.seed * 40) * 12.9898) > 0.8 ? 0.12 : 0);

  // base arms: stiff & held forward when primitive, swinging when refined
  const armSwing = lerp(0.06, 0.5, smooth) * move;
  const armHold = lerp(0.55, 0.12, smooth);
  const baseArm = [-armSwing * Math.sin(ph) + armHold * (1 - 0.5 * move), armSwing * Math.sin(ph) + armHold * (1 - 0.5 * move)];

  let lean = lerp(-0.05, -0.1, move) * (0.5 + 0.5 * L);
  let twist = 0.14 * smooth * move * Math.sin(ph);
  let armR = baseArm[1], armL = baseArm[0];
  let elbowR = L >= 0.3 ? 0.25 + 0.2 * move : 0, elbowL = elbowR;
  let headPitch = 0, headYaw = 0, glow = 0;
  const sway = (1 - smooth) * 0.1 * move * Math.sin(ph);

  const sp = st.strike ? strikePose(st.strike.kind, st.strike.dt, L) : null;
  if (sp) {
    const w = Math.max(sp.w, 0.0001);
    armR = mix(armR, sp.armR, Math.min(1, w + (sp.armR != null ? 0.0 : 0)));
    if (st.strike.kind === 'slam' || st.strike.kind === 'charge') armL = mix(armL, sp.armL, Math.min(1, w));
    else if (sp.armL != null) armL = mix(armL, sp.armL, Math.min(1, w));
    elbowR = lerp(elbowR, sp.elbowR, Math.min(1, w));
    elbowL = lerp(elbowL, sp.elbowL, Math.min(1, w));
    lean = lerp(lean, sp.lean, Math.min(1, w + 0.2));
    twist = lerp(twist, sp.twist, Math.min(1, w));
    glow = sp.glow;
    headPitch = -0.15 * w;
  }

  // knocked back
  if (st.stagger > 0.01) {
    const s = st.stagger;
    lean = lerp(lean, 0.38, s);
    armR = lerp(armR, 0.9 * Math.sin(t * 22) , s * 0.7);
    armL = lerp(armL, 0.9 * Math.sin(t * 22 + 2), s * 0.7);
    headPitch = lerp(headPitch, 0.35, s);
  }

  // spent: slump
  if (st.slump > 0) {
    const s = st.slump;
    lean = lerp(lean, -0.36, s);
    headPitch = lerp(headPitch, -0.7, s);
    armR = lerp(armR, 0.05, s);
    armL = lerp(armL, 0.05, s);
    elbowR = lerp(elbowR, 0.15, s);
    elbowL = lerp(elbowL, 0.15, s);
    glow *= 1 - s;
  }

  const [aL, aR] = r.arms; // side -1 then +1
  aL.shoulder.rotation.z = armL;
  aR.shoulder.rotation.z = armR;
  aL.shoulder.rotation.x = 0.04 + 0.1 * (1 - smooth);
  aR.shoulder.rotation.x = -0.04 - 0.1 * (1 - smooth);
  if (aL.hasElbow) { aL.elbow.rotation.z = elbowL; aR.elbow.rotation.z = elbowR; }

  r.torsoPivot.rotation.z = lean + breathe;
  r.torsoPivot.rotation.y = twist;
  r.torsoPivot.rotation.x = sway;
  r.headPivot.rotation.z = r.headBase.z + headPitch + (twitch ? 0.05 : 0);
  r.headPivot.rotation.x = r.headBase.x;
  r.headPivot.rotation.y = headYaw + twitch * 0.8;

  const idleGlow = 0.8 + 0.25 * Math.sin(t * 2.3 + r.bot.seed * 20);
  r.glowMat.emissiveIntensity = (1.6 * idleGlow + glow * 2.2) * (1 - 0.4 * st.slump);

  r.root.position.set(st.x, 0, st.z);
  const sc = Math.max(0.0001, st.scale);
  r.root.scale.setScalar(sc);
  r.root.visible = st.visible;
}
