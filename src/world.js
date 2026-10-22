// The stage: dusk sky that sinks into night, ash plain, scattered rocks for
// parallax, floating motes, year inscriptions on the ground, lights.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mulberry32, smoothstep, lerp, xAtYear } from './sim.js';
import { makeGroundGlyph } from './text.js';
import { fxShared } from './fx.js';
import { WALLS } from './timeline.js';

const FOG_DAY = new THREE.Color(0x2b1f33);
const FOG_NIGHT = new THREE.Color(0x05060d);

export function createWorld(scene, renderer) {
  scene.fog = new THREE.FogExp2(FOG_DAY.clone(), 0.016);
  scene.background = FOG_DAY.clone();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  // sky
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uNight: { value: 0 }, uFog: { value: FOG_DAY.clone() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform float uNight; uniform vec3 uFog;
      float hash(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = mix(vec3(0.045,0.06,0.15), vec3(0.006,0.01,0.03), uNight);
        vec3 mid = mix(vec3(0.34,0.17,0.28), vec3(0.02,0.03,0.07), uNight);
        vec3 col = mix(mid, top, smoothstep(0.0, 0.6, h));
        float sd = max(dot(d, normalize(vec3(1.0, 0.07, -0.18))), 0.0);
        vec3 glow = vec3(1.0, 0.5, 0.2) * (pow(sd, 6.0) * 0.8 + pow(sd, 48.0) * 1.5 + pow(sd, 600.0) * 4.0);
        col += glow * (1.0 - uNight * 0.94);
        float st = step(0.9972, hash(floor(d * 260.0)));
        col += vec3(0.8, 0.85, 1.0) * st * smoothstep(0.04, 0.4, h) * (0.25 + 0.75 * uNight);
        col = mix(uFog, col, smoothstep(-0.01, 0.2, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // ground
  const gc = document.createElement('canvas');
  gc.width = gc.height = 512;
  const gx = gc.getContext('2d');
  const r = mulberry32(42);
  gx.fillStyle = '#7a7480'; gx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + r() * 90 | 0;
    gx.fillStyle = `rgba(${v},${v - 6},${v + 6},${0.1 + r() * 0.25})`;
    gx.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  const gtex = new THREE.CanvasTexture(gc);
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(120, 60);
  gtex.colorSpace = THREE.SRGBColorSpace;
  gtex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 600),
    new THREE.MeshStandardMaterial({ color: 0x4d4654, map: gtex, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(200, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // rocks
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x2c2a32, roughness: 0.95, flatShading: true }),
    1100,
  );
  const rr = mulberry32(7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 1100; i++) {
    let z = (rr() - 0.5) * 180;
    if (Math.abs(z) < 6.5) z += Math.sign(z || 1) * 7;
    const s = 0.08 + Math.pow(rr(), 3) * 1.1;
    e.set(rr() * 3, rr() * 3, rr() * 3); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(-60 + rr() * 330, s * 0.35, z), q, new THREE.Vector3(s * (1 + rr()), s * 0.7, s * (1 + rr())));
    rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // year inscriptions on the ground, where the group passes through each year
  // (skip any that would crowd a previous one, or sit at a wall)
  let lastX = -1e9;
  for (let y = 2018; y <= 2026; y++) {
    let x = xAtYear(y) + (y === 2018 ? 4 : 0);
    if (x - lastX < 12 || WALLS.some((wl) => Math.abs(x - wl.x) < 9)) continue;
    lastX = x;
    const g = makeGroundGlyph(String(y), 7);
    g.position.set(x, 0.03, 8.5);
    scene.add(g);
  }

  // floating motes
  const N = 500, mr = mulberry32(99);
  const mg = new THREE.BufferGeometry();
  const mp = new Float32Array(N * 3), ms = new Float32Array(N);
  for (let i = 0; i < N; i++) { mp[i * 3] = mr() * 120; mp[i * 3 + 1] = 0.3 + mr() * 14; mp[i * 3 + 2] = (mr() - 0.5) * 60; ms[i] = 0.4 + mr(); }
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('aS', new THREE.BufferAttribute(ms, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uM: { value: 0 }, uScale: fxShared.uScale, uK: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aS; uniform float uT, uM, uScale;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x = mod(p.x - uT * 0.35 * aS - uM + 60.0, 120.0) - 60.0 + uM;
        p.y += sin(uT * 0.4 * aS + p.x) * 0.4;
        p.z += cos(uT * 0.3 * aS + p.y) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.07 * aS * uScale / -mv.z;
        vA = smoothstep(55.0, 10.0, -mv.z) * 0.55;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; uniform float uK; void main(){ float d = length(gl_PointCoord-0.5)*2.0; gl_FragColor = vec4(1.0,0.78,0.55, smoothstep(1.0,0.0,d)*vA*uK); }`,
  });
  const motes = new THREE.Points(mg, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // lights
  const hemi = new THREE.HemisphereLight(0x8793cc, 0x52404a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a58, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 190;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9db8ff, 1.7);
  scene.add(fill, fill.target);

  function update(t, mx) {
    const night = smoothstep(138, 176, t);
    skyMat.uniforms.uNight.value = night;
    const fc = FOG_DAY.clone().lerp(FOG_NIGHT, night);
    scene.fog.color.copy(fc);
    scene.background.copy(fc);
    skyMat.uniforms.uFog.value.copy(fc);
    scene.fog.density = lerp(0.0165, 0.0125, night);
    sun.intensity = lerp(3.0, 0.9, smoothstep(136, 172, t));
    sun.color.setHex(0xff9a58).lerp(new THREE.Color(0x6a7cff), night * 0.8);
    hemi.intensity = lerp(0.8, 0.3, night);
    fill.intensity = lerp(1.7, 0.6, night);
    scene.environmentIntensity = lerp(0.4, 0.14, night);
    fxShared.uLight.value = lerp(1, 0.22, night);
    sun.position.set(mx + 40, 34, -14);
    sun.target.position.set(mx, 0, 0);
    fill.position.set(mx - 14, 15, 32);
    fill.target.position.set(mx, 0, 0);
    sky.position.set(mx, 0, 0);
    moteMat.uniforms.uT.value = t;
    moteMat.uniforms.uM.value = mx;
    moteMat.uniforms.uK.value = 1 - 0.7 * night;
  }

  return { update, sky, sun, fill, hemi };
}
