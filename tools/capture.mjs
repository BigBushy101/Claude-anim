// Records the film to an MP4: steps the master clock frame by frame in headless
// Chromium (deterministic, since every frame is a pure function of t), renders the
// score offline to a WAV, then muxes with ffmpeg.
//
//   npm run build && node tools/capture.mjs [--fps 30] [--width 1920] [--from 0] [--to 205]   (from/to in story seconds; the film's speed varies)
//                                           [--audio 1] [--workers 4] [--out out/the-walls.mp4]
//
// --workers N renders frames in N parallel browsers (useful on CPU-only machines).
// Needs: ffmpeg on PATH, and Playwright (`npm i -D playwright`, or set PLAYWRIGHT_MODULE
// to its install path). Set CHROMIUM_PATH to use a specific Chromium binary.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { toReal, toAuth } from '../src/timeline.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), WIDTH = +arg('width', 1920), FROM = +arg('from', 0), TO = +arg('to', 205);
const OUT = arg('out', 'out/the-walls.mp4');
const AUDIO = arg('audio', '1') !== '0';
const WORKERS = Math.max(1, +arg('workers', 1));
const WORKER = arg('worker', null);          // internal: this process is frame-worker k
const DIR = arg('dir', null);                // internal: shared frame directory
const AR = 2.39, HEIGHT = Math.round(WIDTH / AR / 2) * 2;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Run `npm run build` first.'); process.exit(1); }

const require = createRequire(process.env.PLAYWRIGHT_MODULE ? process.env.PLAYWRIGHT_MODULE + '/' : import.meta.url);
const { chromium } = require('playwright');

// tiny static server for dist/
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (e, d) => { if (e) { res.statusCode = 404; res.end(); } else { res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

const R0 = toReal(FROM), frames = Math.round((toReal(TO) - R0) * FPS);

async function open(t) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(`${url}/?t=${t}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  return { browser, page };
}

async function renderFrames(dir, k, n) {
  const { browser, page } = await open(FROM);
  for (let i = k; i < frames; i += n) {
    await page.evaluate((t) => window.__film.seek(t), toAuth(R0 + i / FPS));
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(6, '0')}.png`) });
    if (n > 1 || i % FPS === 0) process.stdout.write(`\r  worker ${k}: frame ${i}/${frames}   `);
  }
  await browser.close();
}

async function renderAudio(wav) {
  const { browser, page } = await open(FROM);
  const b64 = await page.evaluate(async () => {
    const buf = await window.__film.wav();
    const u8 = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  await browser.close();
}

// ---- worker mode: just render my share of the frames ------------------------------
if (WORKER !== null) {
  await renderFrames(DIR, +WORKER, WORKERS);
  server.close();
  process.exit(0);
}

// ---- main ---------------------------------------------------------------------------------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = fs.mkdtempSync(path.join(path.dirname(OUT), 'frames-'));
const wav = path.join(tmp, 'score.wav');
console.log(`Rendering ${frames} frames at ${WIDTH}x${HEIGHT}, ${FPS} fps, ${WORKERS} worker(s)…`);

const jobs = [];
if (WORKERS === 1) jobs.push(renderFrames(tmp, 0, 1));
else {
  for (let k = 0; k < WORKERS; k++) {
    jobs.push(new Promise((res, rej) => {
      const p = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--worker', String(k), '--dir', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
      p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${k} exited ${c}`))));
    }));
  }
}
if (AUDIO) jobs.push(renderAudio(wav).then(() => console.log('\n  audio rendered')));
await Promise.all(jobs);
server.close();

console.log('\nEncoding…');
await new Promise((res, rej) => {
  const inputs = ['-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%06d.png')];
  if (AUDIO) inputs.push('-ss', String(R0), '-i', wav, '-t', String(toReal(TO) - R0));
  const ff = spawn('ffmpeg', [...inputs, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow',
    ...(AUDIO ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), OUT], { stdio: 'inherit' });
  ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Wrote', OUT);
