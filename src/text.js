// Canvas-textured text: floating cards, nameplates, wall decals, ground glyphs.
// No font files or network needed, so rendering is identical everywhere.
import * as THREE from 'three';

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
export const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
export const SANS = 'system-ui, "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';

const STYLES = {
  paper: { accent: '#7fe9ff', title: `600 66px ${SANS}`, tl: 78 },
  news: { accent: '#ffc46b', title: `700 68px ${SERIF}`, tl: 80 },
  quote: { accent: '#ff9a9a', title: `italic 600 74px ${SERIF}`, tl: 88 },
  report: { accent: '#c9a6ff', title: `600 66px ${SANS}`, tl: 78 },
};

function wrapLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function makeCard(c) {
  const st = STYLES[c.kind] || STYLES.paper;
  const W = 1700, pad = 56, textW = W - pad * 2 - 20;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = st.title;
  const lines = wrapLines(probe, c.title, textW);
  const H = pad + 44 + 26 + lines.length * st.tl + 18 + 42 + pad;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  const draw = (glow) => {
    ctx.shadowColor = glow ? st.accent : 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = glow ? 34 : 8;
    ctx.shadowOffsetY = glow ? 0 : 3;
    let y = pad + 36;
    ctx.fillStyle = st.accent;
    ctx.font = `600 34px ${MONO}`;
    ctx.fillText(c.kicker.toUpperCase(), pad + 22, y);
    y += 26 + st.tl - 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = st.title;
    for (const l of lines) { ctx.fillText(l, pad + 22, y); y += st.tl; }
    y += 6;
    ctx.fillStyle = 'rgba(225,232,245,0.78)';
    ctx.font = `400 36px ${MONO}`;
    ctx.fillText(c.source, pad + 22, y);
  };
  ctx.clearRect(0, 0, W, H);
  draw(true);
  draw(true);
  ctx.shadowBlur = 0;
  draw(false);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = st.accent;
  ctx.fillRect(pad - 6, pad - 4, 6, H - pad * 2 + 8);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const w = c.w || 10;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, (w * H) / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0 }),
  );
  mesh.renderOrder = 10;
  return mesh;
}

export function makeNameplate(name, color) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = `700 64px ${SANS}`;
  const tw = ctx.measureText(name).width;
  const bw = tw + 70, bx = (512 - bw) / 2;
  ctx.fillStyle = 'rgba(6,8,14,0.55)';
  ctx.beginPath();
  ctx.roundRect(bx, 22, bw, 84, 42);
  ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.fillText(name, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0 }));
  sp.scale.set(2.4, 0.6, 1);
  sp.renderOrder = 11;
  return sp;
}

export function makeGroundGlyph(text, size = 6) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 384;
  const ctx = cv.getContext('2d');
  ctx.font = `700 280px ${MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,214,170,0.85)';
  ctx.shadowColor = 'rgba(255,170,90,0.9)'; ctx.shadowBlur = 40;
  ctx.fillText(text, 512, 200);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size * 0.375),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.22, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}
