# THE WALLS

A ~100 second 3D animation of the history of modern AI, told as humanoid robots walking
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

About 1:39 end to end.

| Time | Beat |
|---|---|
| 0:00 | GPT-1 shuffles in alone, a pile of boxes with an antenna. Stop-motion gait, close-ups on its feet and its one eye. |
| 0:11–0:18 | **Wall 1 "JUST PARROTS"** (brick). GPT-1 and GPT-2 bounce off; GPT-3 breaks through in slow motion. |
| 0:18–0:22 | **GPT-1 powers down**: stops where it stands, eye flickers out, sparks. GPT-2 follows at 0:22. The group sprints on without them. |
| 0:24–0:33 | **Wall 2 "DIMINISHING RETURNS"** (concrete, a flattening scaling curve). GPT-4 and Claude. GPT-3 powers down at 0:33. |
| 0:37–0:45 | **Wall 3 "OUT OF DATA"** (server racks). Gemini, Llama, Grok, o1 sprint in. GPT-4 powers down at 0:45. |
| 0:49–0:55 | **Wall 4 "CAN'T REASON"** (carved stone); a reasoning bot cuts an arch with a beam. |
| 0:56–1:05 | A flat-out sprint, then **Wall 5 "TOO HARD FOR AI"** (armour plate). Everyone still running breaks it. |
| 1:12–1:25 | The last wall: a monolith far taller than the rest, with glowing seams and *RSI* on its face. The eight live models strike it. It only flares. |
| 1:25 | They slump. Cut to the **far side** of the wall: dark, silent, muffled thuds. |
| 1:32 | A hairline crack of light. It grows. **Cut to black** at 1:39 on the final swell; one sub-bass hit over the dark. |

Pacing lives in `src/timeline.js` (`PACE`, `SLOMO`). Everything is authored in "story seconds" and
played back at a varying speed: fights run at ~1.8x with a slow-motion beat on every break and every
power-down, and the walks between walls are fast-forwarded harder each time (2.6x, 3.2x, 3.8x, 4.2x), so
the rate of progress visibly accelerates. Newer models also run harder: the older ones can't keep up
with the group's pace, fall behind, and are retired (`tRetire`).

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
npm run capture -- --fps 30 --width 1920 --workers 4 --out out/the-walls.mp4
```

Every frame is a pure function of time (`src/sim.js`, `src/camera.js`, `src/wall.js`), so
the capture steps the clock frame-by-frame and is exactly reproducible. The score is
rendered offline to WAV and muxed with ffmpeg. Software-GL machines are slow (≈1 s per
frame); use a GPU box for the full film. `--workers N` renders frames in N parallel browsers. Try `--from 27 --to 31 --audio 0` for a quick test (times are story seconds, see `src/timeline.js`).

## Where to tweak

| File | What |
|---|---|
| `src/timeline.js` | Bots (level, colour, join time), walls (position, material, hole, strikes, break time), assault and ending times |
| `src/content.js` | Floating text. Placement is automatic (`src/cards.js` keeps cards out of walls) |
| `src/camera.js` | Authored cuts: position/look-at/fov/roll keyframes relative to the group, a single robot or a wall; close-up templates in `BT`, `MT`, `WT` |
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
