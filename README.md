# THE WALLS

A ~3½ minute 3D animation of the history of modern AI, told as humanoid robots walking
into the walls people said AI would never get past. Runs in the browser (Three.js),
with a fully synthesised score. No asset files: every model, texture and sound is
generated in code.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  — click Begin (sound on)
npm run build      # static site in dist/
```

Controls: **Space** pauses. Add `?q=low` for a lighter render (1× pixel ratio, no AA) and
`?ar=16:9` to drop the 2.39:1 letterbox.

## The story

| Time | Beat |
|---|---|
| 0:00 | GPT-1 shuffles in alone — a pile of boxes with an antenna. Stop-motion gait. |
| 0:06–0:30 | GPT-2 and GPT-3 join. **Wall 1 "JUST PARROTS"** (brick). GPT-1 and GPT-2 bounce off; GPT-3 breaks through. |
| 0:44–0:57 | GPT-4 and Claude join. **Wall 2 "DIMINISHING RETURNS"** (concrete, a flattening scaling curve). |
| 1:10–1:19 | Gemini, Llama, Grok, o1 join. **Wall 3 "OUT OF DATA"** (server racks). |
| 1:35–1:43 | DeepSeek, Qwen, Mistral join. **Wall 4 "CAN'T REASON"** (carved stone); a reasoning bot cuts an arch with a beam. |
| 2:01–2:10 | Everyone together. **Wall 5 "TOO HARD FOR AI"** (armour plate). |
| 2:10–2:32 | The last wall: a monolith ten times taller, with glowing seams and *RSI* on its face. Every bot strikes it. It only flares. |
| 2:56 | They slump. Cut to the **far side** of the wall: dark, silent, muffled thuds. |
| 3:08 | A hairline crack of light. It grows. **Cut to black** on the final swell; one sub-bass hit over the dark. |

Robots get more humanoid as models improve: boxes → rounded blocks → capsule limbs, one
cyclops eye → two eyes → a visor, rigid limbs → knees and elbows, stop-motion stagger →
fluid stride. One `level` number per bot (`src/timeline.js`) drives all of it.

The score is built from Web Audio: a drone, a heartbeat that quickens, and **one new
instrument for every bot that joins** (crude bit-crushed plinks for GPT-1, cello for
Claude, bells for Gemini, a fast arpeggio for the reasoning model…). Each wall gets a
riser, a half-second dropout, then a boom.

## Sources for on-screen text

All of it is a real paper, article or quote. Every entry in `src/content.js` has the
source in its `source` line; some carry a `note`. Checked against the web while building:

- Verified: Reuters (11 Nov 2024) and Bloomberg (13 Nov 2024) headlines; Sutskever's NeurIPS 2024 line (English reports say "will *unquestionably* end"); Google DeepMind's IMO 2025 post (21 Jul 2025); Epoch AI's "Will we run out of data?" (arXiv 2211.04325); I. J. Good (1965), including the "provided that the machine is docile enough…" clause.
- From memory, not re-checked: the other paper titles and arXiv IDs (Attention Is All You Need, GPT-1/2/3, Scaling Laws, Stochastic Parrots, Chain-of-Thought, Chinchilla, Sparks of AGI, Constitutional AI, DeepSeek-R1, The Illusion of Thinking, Humanity's Last Exam, ARC Prize's o3 post, AI 2027, Darwin Gödel Machine, AlphaEvolve), the FLI pause letter, and Marcus's *Nautilus* essay. Please spot-check before publishing.
- An unused extra (The Guardian, Feb 2019, "too dangerous to release") is commented out in `content.js`.

Model names appear only as plain-text name tags. No logos.

## Make an MP4

```bash
npm run build
npm i -D playwright            # or: PLAYWRIGHT_MODULE=/path/to/node_modules
npm run capture -- --fps 30 --width 1920 --out out/the-walls.mp4
```

Every frame is a pure function of time (`src/sim.js`, `src/camera.js`, `src/wall.js`), so
the capture steps the clock frame-by-frame and is exactly reproducible. The score is
rendered offline to WAV and muxed with ffmpeg. Software-GL machines are slow (≈1 s per
frame); use a GPU box for the full film. Try `--from 27 --to 31 --audio 0` for a quick test.

## Where to tweak

| File | What |
|---|---|
| `src/timeline.js` | Bots (level, colour, join time), walls (position, material, hole, strikes, break time), assault and ending times |
| `src/content.js` | Floating text. Placement is automatic (`src/cards.js` keeps cards out of walls) |
| `src/camera.js` | Authored shots: position/look-at/fov keyframes relative to the marching group |
| `src/robot.js` | Robot factory and walk/strike poses |
| `src/wall.js` | Block fracture, debris physics, painted decals |
| `src/audio.js` | The whole score |
| `src/fx.js` | Dust, sparks, beams, the final crack |

## Notes

- Determinism: seeking to the same `t` always yields the same frame (checked).
- Audio is pre-scheduled against the audio clock, and the picture follows it, so they stay
  locked. There is about 1.2 s of lead-in after pressing Begin while the score is scheduled.
- Developed and checked with software rendering only. I haven't measured frame rate on a real
  GPU. If it stutters, use `?q=low`.
