// Records the film to an MP4: steps the master clock frame by frame in headless
// Chromium (deterministic, since every frame is a pure function of t), renders the
// score offline to a WAV, then muxes with ffmpeg.
//
//   npm run build && node tools/capture.mjs [--fps 30] [--width 1920] [--from 0] [--to 202] [--audio 1] [--out out/the-walls.mp4]
//
// Needs: ffmpeg on PATH, and Playwright (`npm i -D playwright`, or set PLAYWRIGHT_MODULE
// to its install path). Uses PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH if set.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), WIDTH = +arg('width', 1920), FROM = +arg('from', 0), TO = +arg('to', 202);
const OUT = arg('out', 'out/the-walls.mp4');
const AUDIO = arg('audio', '1') !== '0';
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

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = fs.mkdtempSync(path.join(path.dirname(OUT), 'frames-'));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.goto(`${url}/?t=${FROM}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });

const frames = Math.round((TO - FROM) * FPS);
console.log(`Rendering ${frames} frames at ${WIDTH}x${HEIGHT}, ${FPS} fps…`);
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__film.seek(t), FROM + i / FPS);
  await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(6, '0')}.png`) });
  if (i % FPS === 0) process.stdout.write(`\r  ${(FROM + i / FPS).toFixed(0)}s / ${TO}s`);
}
const wav = path.join(tmp, 'score.wav');
if (AUDIO) {
  console.log('\nRendering audio…');
  const b64 = await page.evaluate(async () => {
    const buf = await window.__film.wav();
    const u8 = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
}
await browser.close(); server.close();

console.log('Encoding…');
await new Promise((res, rej) => {
  const inputs = ['-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%06d.png')];
  if (AUDIO) inputs.push('-ss', String(FROM), '-i', wav, '-t', String(TO - FROM));
  const ff = spawn('ffmpeg', [...inputs, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow',
    ...(AUDIO ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), OUT], { stdio: 'inherit' });
  ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Wrote', OUT);
